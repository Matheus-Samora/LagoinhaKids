"""Additive business tables. No demonstration data."""
def migrate(c):
    statements=[
    '''CREATE TABLE IF NOT EXISTS members_families(id TEXT PRIMARY KEY,name TEXT NOT NULL,joined_on TEXT,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS members_people(id TEXT PRIMARY KEY,name TEXT NOT NULL,family_id TEXT REFERENCES members_families(id),relationship TEXT NOT NULL DEFAULT '',birthday TEXT,joined_on TEXT,phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS ministries_assignments(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES members_people(id),ministry TEXT NOT NULL,position TEXT NOT NULL DEFAULT 'Integrante',started_on TEXT,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS finance_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,bank TEXT NOT NULL DEFAULT '',opening_cents BIGINT NOT NULL DEFAULT 0,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS finance_entries(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES finance_accounts(id),direction TEXT NOT NULL,description TEXT NOT NULL,occurred_on TEXT NOT NULL,amount_cents BIGINT NOT NULL,category TEXT NOT NULL DEFAULT '',active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS finance_files(id TEXT PRIMARY KEY,filename TEXT NOT NULL,content_type TEXT NOT NULL,data BYTEA NOT NULL,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS finance_invoices(id TEXT PRIMARY KEY,number TEXT NOT NULL,supplier TEXT NOT NULL,issued_on TEXT NOT NULL,amount_cents BIGINT NOT NULL,entry_id TEXT REFERENCES finance_entries(id),file_id TEXT REFERENCES finance_files(id),active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)''',
    '''CREATE TABLE IF NOT EXISTS module_changes(id TEXT PRIMARY KEY,module TEXT NOT NULL,record_id TEXT NOT NULL,action TEXT NOT NULL,actor BIGINT REFERENCES users(id),before_json TEXT,after_json TEXT,created_at TEXT NOT NULL)''',
    'CREATE INDEX IF NOT EXISTS members_family_active ON members_people(family_id,active)',
    'CREATE INDEX IF NOT EXISTS ministries_person_active ON ministries_assignments(person_id,active)',
    'CREATE UNIQUE INDEX IF NOT EXISTS ministries_one_active ON ministries_assignments(person_id,ministry) WHERE active=1',
    'CREATE INDEX IF NOT EXISTS finance_account_active ON finance_entries(account_id,active)',
    'CREATE INDEX IF NOT EXISTS changes_record ON module_changes(module,record_id,created_at)']
    for statement in statements:c.execute(statement)
