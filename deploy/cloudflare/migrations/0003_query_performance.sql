-- Small, targeted indexes; no records are deleted or rewritten.
CREATE INDEX IF NOT EXISTS module_pastors_active ON module_access(user_id) WHERE role='pastor' AND enabled=1;
CREATE INDEX IF NOT EXISTS sessions_by_user ON sessions(user_id);
-- Exact duplicate of notifications_user(user_id,id), confirmed in production metadata.
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,id);
DROP INDEX IF EXISTS notice_user_id;
