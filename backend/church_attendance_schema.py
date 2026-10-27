def migrate(c):
    from .modules.schema import ensure_column
    ensure_column(c,'users','church_auto_checkin','BIGINT NOT NULL DEFAULT 0')
    c.execute('''CREATE TABLE IF NOT EXISTS church_services(
        id TEXT PRIMARY KEY,title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,
        location TEXT NOT NULL,latitude DOUBLE PRECISION NOT NULL,longitude DOUBLE PRECISION NOT NULL,
        radius_m BIGINT NOT NULL,opens_at TEXT NOT NULL,closes_at TEXT NOT NULL,
        active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,
        created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)''')
    c.execute('''CREATE TABLE IF NOT EXISTS church_presences(
        service_id TEXT NOT NULL REFERENCES church_services(id),person_id TEXT NOT NULL REFERENCES members_people(id) ON DELETE CASCADE,
        user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,method TEXT NOT NULL,checked_at TEXT NOT NULL,
        actor BIGINT REFERENCES users(id) ON DELETE SET NULL,reason TEXT NOT NULL DEFAULT '',service_version BIGINT NOT NULL,
        voided BIGINT NOT NULL DEFAULT 0,PRIMARY KEY(service_id,person_id))''')
    c.execute('CREATE INDEX IF NOT EXISTS church_services_time ON church_services(starts_at)')
    c.execute('CREATE INDEX IF NOT EXISTS church_presences_person ON church_presences(person_id,checked_at)')
