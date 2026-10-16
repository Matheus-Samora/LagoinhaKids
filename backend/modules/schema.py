"""Additive business tables and columns. Preserves all existing records."""
import os

def ensure_column(c, table, column, definition):
    if os.getenv('KIDS_DATABASE_URL'):
        c.execute(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}')
    else:
        cols = {r[1] for r in c.execute(f'PRAGMA table_info({table})').fetchall()}
        if column not in cols:
            c.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')

def migrate(c):
    statements = [
        '''CREATE TABLE IF NOT EXISTS members_cells(id TEXT PRIMARY KEY,name TEXT NOT NULL,leader_name TEXT NOT NULL DEFAULT '',neighborhood TEXT NOT NULL DEFAULT '',meeting_day TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_families(id TEXT PRIMARY KEY,name TEXT NOT NULL,joined_on TEXT,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_people(id TEXT PRIMARY KEY,name TEXT NOT NULL,family_id TEXT REFERENCES members_families(id),relationship TEXT NOT NULL DEFAULT '',birthday TEXT,joined_on TEXT,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
        '''CREATE TABLE IF NOT EXISTS members_self_registrations(id TEXT PRIMARY KEY,name TEXT NOT NULL,family_name TEXT NOT NULL DEFAULT '',birthday TEXT,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',marital_status TEXT NOT NULL DEFAULT '',profession TEXT NOT NULL DEFAULT '',address TEXT NOT NULL DEFAULT '',integration_stage TEXT NOT NULL DEFAULT 'visitor',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL)''',
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
        '''CREATE TABLE IF NOT EXISTS module_scopes(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,module TEXT NOT NULL,scope TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,module))'''
    ]
    for statement in statements:
        c.execute(statement)

    # Additive columns for existing tables
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
