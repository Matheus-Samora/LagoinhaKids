"""Synchronize full SQLite schema and live production data into Cloudflare D1."""
import json, os, re, sqlite3, sys
from pathlib import Path
import httpx

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID', 'c799ce6344d15b7604a9b3717eab0aa3')
DATABASE_ID = os.getenv('CF_D1_DATABASE_ID', 'b978290d-50e4-4dfc-86dd-d6207b57ea92')
API_TOKEN = os.getenv('CF_API_TOKEN') or os.getenv('CLOUDFLARE_API_TOKEN', '')

def unescape_pg(val: str):
    if val == r'\N':
        return None
    if val.startswith(r'\\x'):
        return bytes.fromhex(val[3:])
    out = []
    i = 0
    n = len(val)
    while i < n:
        if val[i] == '\\' and i + 1 < n:
            c = val[i + 1]
            out.append({'n': '\n', 'r': '\r', 't': '\t', '\\': '\\'}.get(c, c))
            i += 2
        else:
            out.append(val[i])
            i += 1
    return ''.join(out)

def sql_literal(val):
    if val is None:
        return 'NULL'
    if isinstance(val, (bytes, bytearray, memoryview)):
        return "X'" + bytes(val).hex() + "'"
    if isinstance(val, bool):
        return '1' if val else '0'
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''")
    return f"'{s}'"

def build_local_sqlite():
    state_dir = ROOT / 'runtime' / 'cloud-deployment'
    db_path = state_dir / 'cloudflare-d1.sqlite3'
    if db_path.exists():
        db_path.unlink()
    os.environ.pop('KIDS_DATABASE_URL', None)
    os.environ['KIDS_DATA_DIR'] = str(state_dir)
    import backend.store as s
    s.DB = db_path
    s.init()
    # Also ensure church_attendance tables exist
    from backend.church_attendance_schema import migrate as migrate_church
    with s.db() as c:
        migrate_church(c)

    conn = sqlite3.connect(db_path)
    conn.execute('PRAGMA foreign_keys=OFF')
    tables = [
        r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    ]
    for t in tables:
        conn.execute(f'DELETE FROM {t}')

    dump_path = state_dir / 'prod-export.sql'
    txt = dump_path.read_text(encoding='utf-8').replace('\r\n', '\n')
    for m in re.finditer(r'COPY public\.(\w+) \(([^\n]+)\) FROM stdin;\n', txt):
        table = m.group(1)
        if table not in tables:
            continue
        cols = [c.strip().strip('"') for c in m.group(2).split(',')]
        end = txt.find('\n\\.\n', m.end() - 1)
        body = txt[m.end():end] if end >= m.end() else ''
        rows = [l for l in body.splitlines() if l]
        if not rows:
            continue
        placeholders = ','.join(['?'] * len(cols))
        col_names = ','.join(cols)
        for r in rows:
            vals = [unescape_pg(p) for p in r.split('\t')]
            conn.execute(f'INSERT OR REPLACE INTO {table}({col_names}) VALUES({placeholders})', vals)
        print(f'Local SQLite prepared {table}: {len(rows)} rows', flush=True)
    conn.commit()
    return conn, tables

def d1_execute(client: httpx.Client, sql_batch: str):
    url = f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query'
    r = client.post(url, json={'sql': 'PRAGMA foreign_keys=OFF;\n' + sql_batch})
    if r.status_code != 200 or not r.json().get('success'):
        raise RuntimeError(f'D1 query failed ({r.status_code}): {r.text[:600]}')
    return r.json()

def main():
    conn, tables = build_local_sqlite()
    headers = {'Authorization': f'Bearer {API_TOKEN}', 'Content-Type': 'application/json'}
    with httpx.Client(headers=headers, timeout=60) as client:
        # 1. Create all tables & indexes in D1
        schema_stmts = []
        for (sql_stmt,) in conn.execute(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 1 ELSE 2 END"
        ).fetchall():
            stmt = re.sub(r'^CREATE TABLE\b(?!\s+IF NOT EXISTS)', 'CREATE TABLE IF NOT EXISTS', sql_stmt.strip(), flags=re.I)
            stmt = re.sub(r'^CREATE UNIQUE INDEX\b(?!\s+IF NOT EXISTS)', 'CREATE UNIQUE INDEX IF NOT EXISTS', stmt, flags=re.I)
            stmt = re.sub(r'^CREATE INDEX\b(?!\s+IF NOT EXISTS)', 'CREATE INDEX IF NOT EXISTS', stmt, flags=re.I)
            stmt = re.sub(r'^CREATE TRIGGER\b(?!\s+IF NOT EXISTS)', 'CREATE TRIGGER IF NOT EXISTS', stmt, flags=re.I)
            schema_stmts.append(stmt + ';')
        print(f'Applying {len(schema_stmts)} schema statements to Cloudflare D1...', flush=True)
        for i in range(0, len(schema_stmts), 15):
            d1_execute(client, '\n'.join(schema_stmts[i:i + 15]))

        # 2. Topologically sort tables by foreign key dependencies
        skip_tables = {'outbox', 'attempts', 'oauth'}
        active_tables = [t for t in tables if t not in skip_tables]
        deps = {
            t: {r[2] for r in conn.execute(f'PRAGMA foreign_key_list({t})').fetchall() if r[2] in active_tables and r[2] != t}
            for t in active_tables
        }
        ordered = []
        while len(ordered) < len(active_tables):
            ready = [t for t in active_tables if t not in ordered and deps[t].issubset(set(ordered))]
            if not ready:
                ready = [t for t in active_tables if t not in ordered]
            ordered.extend(ready)

        # Clear existing rows in reverse order so foreign keys never block
        clear_stmts = ['DELETE FROM outbox;'] + [f'DELETE FROM {t};' for t in reversed(ordered)]
        for i in range(0, len(clear_stmts), 20):
            d1_execute(client, '\n'.join(clear_stmts[i:i + 20]))

        for table in ordered:
            cur = conn.execute(f'SELECT * FROM {table}')
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            if not rows:
                continue
            if table == 'media':
                media_dir = ROOT / 'dist' / 'api' / 'media'
                media_dir.mkdir(parents=True, exist_ok=True)
                id_idx = cols.index('id')
                data_idx = cols.index('data')
                for row in rows:
                    if row[id_idx] and row[data_idx]:
                        (media_dir / str(row[id_idx])).write_bytes(bytes(row[data_idx]))
            col_names = ','.join(cols)
            batch = []
            batch_bytes = 0
            sent = 0
            for row in rows:
                vals = ','.join(sql_literal(v) for v in row)
                stmt = f'INSERT OR REPLACE INTO {table}({col_names}) VALUES({vals});'
                if len(stmt) > 85_000:
                    continue
                if batch and (len(batch) >= 12 or batch_bytes + len(stmt) > 45_000):
                    d1_execute(client, '\n'.join(batch))
                    sent += len(batch)
                    batch = []
                    batch_bytes = 0
                batch.append(stmt)
                batch_bytes += len(stmt)
            if batch:
                d1_execute(client, '\n'.join(batch))
                sent += len(batch)
            print(f'Synced to Cloudflare D1 -> {table}: {sent} rows', flush=True)
    conn.close()
    print('D1 synchronization complete!', flush=True)

if __name__ == '__main__':
    main()
