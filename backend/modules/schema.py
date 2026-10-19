"""Additive business tables and columns. Preserves all existing records."""
import os
from datetime import datetime, timezone

OFFICIAL_GCS = [
    ('gc-ide', 'GC Ide', 'Vila Isa', 'Avenida Ibituruna, 826 - Vila Isa', 'Terça-feira | 19h30', '/gc/gc-ide.webp'),
    ('gc-emanuel', 'GC Emanuel', 'Vale do Sol 2', 'Rua Quinze, 113 - Vale do Sol 2', 'Terça-feira | 19h30', '/gc/gc-emanuel.webp'),
    ('gc-fe', 'GC Fé', 'Elvamar', 'Rua M, 143 - Elvamar', 'Terça-feira | 19h30', '/gc/gc-fe.webp'),
    ('gc-betel', 'GC Betel', 'Vera Cruz', 'Rua Esmeralda, 3104 - Vera Cruz', 'Terça-feira | 19h30', '/gc/gc-betel.webp'),
    ('gc-rocket', 'GC Rocket', 'Vila Isa', 'Rua José Otávio da Fonseca, 228 - Bairro Vila Isa', 'Terça-feira | 19h30', '/gc/gc-rocket.webp'),
    ('gc-legacy', 'GC Legacy', 'Vila Isa', 'Rua José Otávio da Fonseca, 150 - Vila Isa', 'Terça-feira | 19h30', '/gc/gc-legacy.webp'),
    ('gc-proposito', 'GC Propósito', 'Asteca', 'Avenida 105, Nº 60 - Asteca', 'Sexta-feira | 19h30', '/gc/gc-proposito.webp'),
    ('gc-aviva', 'GC Aviva', 'Vila Rainha - Engenheiro Caldas', 'Av. Padre João Pina de Amaral 554, Vila Rainha - Engenheiro Caldas (Ao lado padaria Araújo)', 'Terça-feira | 19h30', '/gc/gc-aviva.webp'),
]

def ensure_column(c, table, column, definition):
    if os.getenv('KIDS_DATABASE_URL'):
        c.execute(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}')
    else:
        cols = {r[1] for r in c.execute(f'PRAGMA table_info({table})').fetchall()}
        if column not in cols:
            c.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')

def ensure_official_gcs(c):
    # Existing user records are never deleted or detached by catalog seeding.
    now_iso = datetime.now(timezone.utc).isoformat(timespec='seconds')
    for gc_id, gc_name, neigh, addr, m_day, banner in OFFICIAL_GCS:
        existing = c.execute(
            "SELECT id FROM members_cells WHERE id=? OR lower(name)=? OR lower(name)=?",
            (gc_id, gc_name.lower(), gc_name.lower().replace('gc ', ''))
        ).fetchone()
        if existing:
            c.execute(
                "UPDATE members_cells SET name=?, neighborhood=?, address=?, meeting_day=?, banner_url=?, active=1 WHERE id=?",
                (gc_name, neigh, addr, m_day, banner, existing[0])
            )
        else:
            c.execute(
                "INSERT INTO members_cells(id,name,leader_name,neighborhood,meeting_day,banner_url,address,active,version,created_at) VALUES(?,?,?,?,?,?,?,1,1,?)",
                (gc_id, gc_name, 'Liderança GC', neigh, m_day, banner, addr, now_iso)
            )

def migrate(c):
    statements = [
        '''CREATE TABLE IF NOT EXISTS members_cells(id TEXT PRIMARY KEY,name TEXT NOT NULL,leader_name TEXT NOT NULL DEFAULT '',neighborhood TEXT NOT NULL DEFAULT '',meeting_day TEXT NOT NULL DEFAULT '',banner_url TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_families(id TEXT PRIMARY KEY,name TEXT NOT NULL,joined_on TEXT,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_people(id TEXT PRIMARY KEY,name TEXT NOT NULL,family_id TEXT REFERENCES members_families(id),relationship TEXT NOT NULL DEFAULT '',birthday TEXT,joined_on TEXT,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_self_registrations(id TEXT PRIMARY KEY,name TEXT NOT NULL,family_name TEXT NOT NULL DEFAULT '',birthday TEXT,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',marital_status TEXT NOT NULL DEFAULT '',profession TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',integration_stage TEXT NOT NULL DEFAULT 'visitor',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS sector_applications(id TEXT PRIMARY KEY,user_id BIGINT,member_name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',target_type TEXT NOT NULL,target_id TEXT NOT NULL DEFAULT '',target_name TEXT NOT NULL,role_desired TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending',reviewed_by BIGINT,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS platform_announcements(id TEXT PRIMARY KEY,title TEXT NOT NULL,message TEXT NOT NULL,target_sector TEXT NOT NULL DEFAULT 'all',author_id BIGINT REFERENCES users(id),author_name TEXT NOT NULL DEFAULT '',event_date TEXT,location TEXT,banner_url TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS ministries_assignments(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES members_people(id),ministry TEXT NOT NULL,position TEXT NOT NULL DEFAULT 'Integrante',started_on TEXT,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS ministries_schedules(id TEXT PRIMARY KEY,title TEXT NOT NULL,ministry TEXT NOT NULL,person_id TEXT NOT NULL REFERENCES members_people(id),role_notes TEXT NOT NULL DEFAULT '',service_date TEXT NOT NULL,service_time TEXT NOT NULL DEFAULT '18:00',status TEXT NOT NULL DEFAULT 'confirmed',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS ministries_resources(id TEXT PRIMARY KEY,ministry TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL DEFAULT 'roteiro',notes TEXT NOT NULL DEFAULT '',resource_url TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_cost_centers(id TEXT PRIMARY KEY,name TEXT NOT NULL,ministry TEXT NOT NULL DEFAULT '',budget_cents BIGINT NOT NULL DEFAULT 0,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,bank TEXT NOT NULL DEFAULT '',opening_cents BIGINT NOT NULL DEFAULT 0,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_entries(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES finance_accounts(id),direction TEXT NOT NULL,description TEXT NOT NULL,occurred_on TEXT NOT NULL,amount_cents BIGINT NOT NULL,category TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_files(id TEXT PRIMARY KEY,filename TEXT NOT NULL,content_type TEXT NOT NULL,data BYTEA NOT NULL,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_invoices(id TEXT PRIMARY KEY,number TEXT NOT NULL,supplier TEXT NOT NULL,issued_on TEXT NOT NULL,amount_cents BIGINT NOT NULL,entry_id TEXT REFERENCES finance_entries(id),file_id TEXT REFERENCES finance_files(id),active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS finance_service_closings(id TEXT PRIMARY KEY,service_name TEXT NOT NULL,service_date TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES finance_accounts(id),tithes_cents BIGINT NOT NULL DEFAULT 0,offerings_cash_cents BIGINT NOT NULL DEFAULT 0,offerings_pix_cents BIGINT NOT NULL DEFAULT 0,offerings_card_cents BIGINT NOT NULL DEFAULT 0,total_cents BIGINT NOT NULL DEFAULT 0,counted_by TEXT NOT NULL,verified_by TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',entry_id TEXT REFERENCES finance_entries(id),active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS module_changes(id TEXT PRIMARY KEY,module TEXT NOT NULL,record_id TEXT NOT NULL,action TEXT NOT NULL,actor BIGINT REFERENCES users(id),before_json TEXT,after_json TEXT,created_at TEXT NOT NULL)''',
        'CREATE INDEX IF NOT EXISTS members_family_active ON members_people(family_id,active)',
        'CREATE INDEX IF NOT EXISTS ministries_person_active ON ministries_assignments(person_id,active)',
        'CREATE UNIQUE INDEX IF NOT EXISTS ministries_one_active ON ministries_assignments(person_id,ministry) WHERE active=1',
        'CREATE INDEX IF NOT EXISTS ministries_schedule_date ON ministries_schedules(service_date,service_time,active)',
        'CREATE INDEX IF NOT EXISTS finance_account_active ON finance_entries(account_id,active)',
        'CREATE INDEX IF NOT EXISTS changes_record ON module_changes(module,record_id,created_at)',
        'CREATE INDEX IF NOT EXISTS sector_apps_status ON sector_applications(target_type,status,created_at)',
        'CREATE INDEX IF NOT EXISTS announcements_sector_active ON platform_announcements(target_sector,active,created_at)',
        '''CREATE TABLE IF NOT EXISTS module_scopes(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,module TEXT NOT NULL,scope TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,module))'''
    ]
    for statement in statements:
        c.execute(statement)

    # Additive columns for existing tables
    ensure_column(c, 'members_cells', 'banner_url', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_cells', 'address', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_families', 'cell_id', 'TEXT')
    ensure_column(c, 'members_families', 'neighborhood', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_people', 'cell_id', 'TEXT')
    ensure_column(c, 'members_people', 'integration_stage', "TEXT NOT NULL DEFAULT 'active_member'")
    ensure_column(c, 'members_people', 'baptism_date', 'TEXT')
    ensure_column(c, 'members_people', 'origin_church', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_people', 'marital_status', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_people', 'profession', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_people', 'address', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'members_people', 'pastoral_notes', "TEXT NOT NULL DEFAULT ''")
    ensure_column(c, 'ministries_assignments', 'is_leader', 'BIGINT NOT NULL DEFAULT 0')
    ensure_column(c, 'ministries_assignments', 'training_status', "TEXT NOT NULL DEFAULT 'certified'")
    ensure_column(c, 'finance_entries', 'payment_status', "TEXT NOT NULL DEFAULT 'paid'")
    ensure_column(c, 'finance_entries', 'due_date', 'TEXT')
    ensure_column(c, 'finance_entries', 'payment_method', "TEXT NOT NULL DEFAULT 'pix'")
    ensure_column(c, 'finance_entries', 'cost_center_id', 'TEXT')

    # Migrate 'Link Future' to 'Link' and 'Sonoplastia' to 'Future'
    c.execute("UPDATE ministries_assignments SET ministry='Link' WHERE ministry='Link Future'")
    c.execute("UPDATE ministries_schedules SET ministry='Link' WHERE ministry='Link Future'")
    c.execute("UPDATE ministries_resources SET ministry='Link' WHERE ministry='Link Future'")
    c.execute("UPDATE module_scopes SET scope='Link' WHERE module='ministries' AND scope='Link Future'")

    c.execute("UPDATE ministries_assignments SET ministry='Future' WHERE ministry='Sonoplastia'")
    c.execute("UPDATE ministries_schedules SET ministry='Future' WHERE ministry='Sonoplastia'")
    c.execute("UPDATE ministries_resources SET ministry='Future' WHERE ministry='Sonoplastia'")
    c.execute("UPDATE module_scopes SET scope='Future' WHERE module='ministries' AND scope='Sonoplastia'")
    c.execute("UPDATE sector_applications SET target_name='Future', target_id='Future' WHERE target_type='ministry' AND target_name='Sonoplastia'")

    if not c.execute("SELECT 1 FROM platform_migrations WHERE name='official_gcs_v230'").fetchone():
        if c.execute('SELECT count(*) FROM members_cells').fetchone()[0]==0:
            ensure_official_gcs(c)
        c.execute("INSERT INTO platform_migrations VALUES('official_gcs_v230')")

    # Demo cleanup must use verified record identifiers outside startup migrations.
    if not c.execute("SELECT 1 FROM platform_migrations WHERE name='sensitive_fields_v231'").fetchone():
        from .. import store as s
        import json
        def encrypt(value):
            return 'enc:v1:'+s.CIPHER.encrypt(value.encode('utf-8')).decode('ascii') if value and not value.startswith('enc:v1:') else value
        for table,fields in [('members_people',('address','pastoral_notes')),('members_self_registrations',('address',)),('finance_service_closings',('notes',)),('sector_applications',('notes',))]:
            for row in c.execute(f"SELECT id,{','.join(fields)} FROM {table}").fetchall():
                for field in fields:
                    if row[field] and not row[field].startswith('enc:v1:'):
                        c.execute(f'UPDATE {table} SET {field}=? WHERE id=?',(encrypt(row[field]),row['id']))
        for row in c.execute('SELECT id,before_json,after_json FROM module_changes').fetchall():
            for field in ('before_json','after_json'):
                if not row[field]:continue
                snapshot=json.loads(row[field])
                for key in ('address','pastoral_notes','notes'):
                    if isinstance(snapshot.get(key),str):snapshot[key]=encrypt(snapshot[key])
                c.execute(f'UPDATE module_changes SET {field}=? WHERE id=?',(json.dumps(snapshot,ensure_ascii=False),row['id']))
        c.execute("INSERT INTO platform_migrations VALUES('sensitive_fields_v231')")

    # Additive ownership metadata. Existing records retain their IDs and contents.
    owned_tables = {
        'members':('members_cells','members_families','members_people'),
        'ministries':('ministries_assignments','ministries_schedules','ministries_resources'),
        'finance':('finance_accounts','finance_entries','finance_invoices','finance_cost_centers','finance_service_closings')
    }
    for tables in owned_tables.values():
        for table in tables:
            ensure_column(c,table,'created_by','BIGINT REFERENCES users(id)')
            c.execute(f'CREATE INDEX IF NOT EXISTS {table}_owner_active ON {table}(created_by,active)')
    ensure_column(c,'members_self_registrations','owner_id','BIGINT REFERENCES users(id)')
    ensure_column(c,'platform_announcements','target_scope',"TEXT NOT NULL DEFAULT ''")
    if not c.execute("SELECT 1 FROM platform_migrations WHERE name='record_ownership_v243'").fetchone():
        for module,tables in owned_tables.items():
            for table in tables:
                c.execute(f"UPDATE {table} SET created_by=(SELECT actor FROM module_changes ch WHERE ch.module=? AND ch.record_id={table}.id AND ch.action='created' ORDER BY ch.created_at,ch.id LIMIT 1) WHERE created_by IS NULL",(module,))
        c.execute("INSERT INTO platform_migrations VALUES('record_ownership_v243')")

    ensure_column(c,'members_self_registrations','version','BIGINT NOT NULL DEFAULT 1')
