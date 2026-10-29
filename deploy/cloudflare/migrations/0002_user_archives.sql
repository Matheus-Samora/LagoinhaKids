CREATE TABLE IF NOT EXISTS user_archives (
 user_id INTEGER PRIMARY KEY REFERENCES users(id),
 deleted_at TEXT NOT NULL,
 deleted_by INTEGER NOT NULL REFERENCES users(id)
);
