"""Small DB-API compatibility layer; all application data lives in PostgreSQL."""
import os,re,sqlite3
from pathlib import Path
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

class Row(dict):
    def __getitem__(self,key):return list(self.values())[key] if isinstance(key,int) else super().__getitem__(key)

def sql(statement):
    # Existing queries use SQLite's double-quoted string literals; never alter parameters.
    statement=re.sub(r"'[^']*(?:''[^']*)*'|\"([^\"]*)\"",lambda m:"'"+m[1].replace("'","''")+"'" if m[1] is not None else m[0],statement)
    replace=bool(re.match(r'\s*INSERT OR REPLACE INTO attempts\b',statement,re.I))
    ignore=bool(re.match(r'\s*INSERT OR IGNORE\b',statement,re.I))
    statement=re.sub(r'INSERT OR (REPLACE|IGNORE)', 'INSERT',statement,flags=re.I)
    if replace:statement+=' ON CONFLICT(key) DO UPDATE SET failures=excluded.failures,expires=excluded.expires'
    elif ignore:statement+=' ON CONFLICT DO NOTHING'
    return statement.replace('?','%s')

class Cursor:
    def __init__(self,cursor,lastrowid=None):self.cursor=cursor;self.lastrowid=lastrowid;self.rowcount=cursor.rowcount
    def fetchone(self):
        row=self.cursor.fetchone();return Row(row) if row is not None else None
    def fetchall(self):return [Row(r) for r in self.cursor.fetchall()]
    def __iter__(self):return iter(self.fetchall())

IDENTITIES={'users','rooms','children','notifications','audit','lessons','terms_consents','attendance_events','waitlist','outbox','device_tokens','events','event_registrations','paging_requests','guest_checkins','web_subscriptions'}
class Connection:
    def __init__(self,connection):self.connection=connection
    def execute(self,statement,parameters=()):
        if statement.strip().upper()=='BEGIN IMMEDIATE':
            return Cursor(self.connection.execute('SELECT pg_advisory_xact_lock(16574001)'))
        query=sql(statement);insert=re.match(r'\s*INSERT INTO (\w+)\s*(\([^)]*\))?',query,re.I)
        table=insert[1] if insert else None
        identity=table in IDENTITIES
        if identity:query+=' RETURNING id'
        try:
            cursor=self.connection.execute(query,parameters or None)
        except psycopg.IntegrityError as exc:
            # Preserve API exception handling, while rolling back the failed transaction.
            self.connection.rollback();raise sqlite3.IntegrityError('Database constraint violation') from exc
        last=None
        if identity:
            row=cursor.fetchone();last=row['id'] if row else None
            if insert[2] and re.search(r'\bid\b',insert[2]):
                self.connection.execute(f"SELECT setval(pg_get_serial_sequence('{table}','id'),GREATEST((SELECT coalesce(max(id),1) FROM {table}),(SELECT last_value FROM {table}_id_seq)))")
        return Cursor(cursor,last)
    def commit(self):self.connection.commit()
    def rollback(self):self.connection.rollback()

_pool=None
@contextmanager
def db():
    global _pool
    if _pool is None:
        low_cost=os.getenv('KIDS_LOW_COST_MODE')=='1' or (bool(os.getenv('K_SERVICE')) and os.getenv('KIDS_LOW_COST_MODE')!='0')
        _pool=ConnectionPool(
            os.environ['KIDS_DATABASE_URL'],
            min_size=0 if low_cost else 1,
            max_size=int(os.getenv('KIDS_DB_POOL_SIZE','2' if low_cost else '5')),
            max_idle=30 if low_cost else 300,
            timeout=15,
            check=ConnectionPool.check_connection if low_cost else None,
            kwargs={'row_factory':dict_row,'connect_timeout':15}
        )
    with _pool.connection() as connection:yield Connection(connection)

def init():
    with psycopg.connect(os.environ['KIDS_DATABASE_URL']) as connection:
        connection.execute('SELECT pg_advisory_xact_lock(16574002)')
        connection.execute(Path(__file__).with_name('postgres_schema.sql').read_text(encoding='utf-8'))
