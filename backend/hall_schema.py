"""Additive community tables, imported safely during store initialization."""
def migrate(c):
    for sql in (
        'CREATE TABLE IF NOT EXISTS hall_posts(id TEXT PRIMARY KEY,author_id BIGINT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,content TEXT NOT NULL,active BIGINT NOT NULL DEFAULT 1,version BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)',
        'CREATE INDEX IF NOT EXISTS hall_posts_page ON hall_posts(active,created_at,id)',
        'CREATE INDEX IF NOT EXISTS hall_posts_author ON hall_posts(author_id,active,created_at)',
        'CREATE TABLE IF NOT EXISTS hall_comments(id TEXT PRIMARY KEY,post_id TEXT NOT NULL REFERENCES hall_posts(id),author_id BIGINT NOT NULL REFERENCES users(id),content TEXT NOT NULL,active BIGINT NOT NULL DEFAULT 1,created_at TEXT NOT NULL)',
        'CREATE INDEX IF NOT EXISTS hall_comments_post ON hall_comments(post_id,active,created_at)',
        'CREATE INDEX IF NOT EXISTS members_directory_page ON members_people(active,name,id)',
        'CREATE INDEX IF NOT EXISTS ministries_person_active ON ministries_assignments(person_id,active)',
        'CREATE TABLE IF NOT EXISTS hall_reactions(post_id TEXT NOT NULL REFERENCES hall_posts(id),user_id BIGINT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(post_id,user_id))',
        'CREATE TABLE IF NOT EXISTS hall_reports(post_id TEXT NOT NULL REFERENCES hall_posts(id),user_id BIGINT NOT NULL REFERENCES users(id),reason TEXT NOT NULL,resolved BIGINT NOT NULL DEFAULT 0,created_at TEXT NOT NULL,PRIMARY KEY(post_id,user_id))',
    ):c.execute(sql)

