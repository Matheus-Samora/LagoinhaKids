CREATE TABLE IF NOT EXISTS native_paging_devices (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  session_token TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paging_push_deliveries (
  paging_id INTEGER NOT NULL REFERENCES paging_requests(id),user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('call','cancel')),
  status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL DEFAULT 0,accepted_at TEXT,error_code TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(paging_id,token,kind)
);
CREATE INDEX IF NOT EXISTS native_paging_session ON native_paging_devices(session_token);
CREATE INDEX IF NOT EXISTS paging_push_pending ON paging_push_deliveries(status,next_attempt);
