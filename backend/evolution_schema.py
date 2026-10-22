"""Additive operational schema. No data replacement or automatic invitations."""
def migrate(c):
    from .modules.schema import ensure_column
    columns={
      'users':{'mfa_required':'BIGINT NOT NULL DEFAULT 0','activation_required':'BIGINT NOT NULL DEFAULT 0','public_bio':'BIGINT NOT NULL DEFAULT 1','public_profession':'BIGINT NOT NULL DEFAULT 1'},
      'attendance':{'lesson_context':'BIGINT','claim_expires_at':"TEXT NOT NULL DEFAULT ''"},
      'ministries_schedules':{'duration_minutes':'BIGINT NOT NULL DEFAULT 60','response_due_at':"TEXT NOT NULL DEFAULT ''",'reminder_enabled':'BIGINT NOT NULL DEFAULT 0','reminder_sent':'BIGINT NOT NULL DEFAULT 0'},
      'ministries_resources':{'expires_on':'TEXT','owner_id':'BIGINT REFERENCES users(id)','file_id':'TEXT REFERENCES media(id)'},
      'members_people':{'data_source':"TEXT NOT NULL DEFAULT 'existing'",'confirmed_at':'TEXT'},
      'finance_accounts':{'require_approval':'BIGINT NOT NULL DEFAULT 0'},
      'platform_announcements':{'publish_at':'TEXT','expires_at':'TEXT','dispatched':'BIGINT NOT NULL DEFAULT 1','require_ack':'BIGINT NOT NULL DEFAULT 0','audience_ids':"TEXT NOT NULL DEFAULT '[]'",'request_digest':"TEXT NOT NULL DEFAULT ''"}
    }
    for table,fields in columns.items():
      for key,definition in fields.items():ensure_column(c,table,key,definition)
    statements=[
      "CREATE TABLE IF NOT EXISTS service_templates(id TEXT PRIMARY KEY,title TEXT NOT NULL,weekday BIGINT NOT NULL,service_time TEXT NOT NULL,duration_minutes BIGINT NOT NULL,active BIGINT NOT NULL DEFAULT 1,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS gc_leaders(cell_id TEXT NOT NULL REFERENCES members_cells(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(cell_id,user_id))",
      "CREATE TABLE IF NOT EXISTS gc_meetings(id TEXT PRIMARY KEY,cell_id TEXT NOT NULL REFERENCES members_cells(id) ON DELETE CASCADE,title TEXT NOT NULL,held_on TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',version BIGINT NOT NULL DEFAULT 1,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS gc_attendance(meeting_id TEXT NOT NULL REFERENCES gc_meetings(id) ON DELETE CASCADE,person_id TEXT NOT NULL REFERENCES members_people(id) ON DELETE CASCADE,present BIGINT NOT NULL DEFAULT 1,PRIMARY KEY(meeting_id,person_id))",
      "CREATE TABLE IF NOT EXISTS member_journey(id TEXT PRIMARY KEY,person_id TEXT NOT NULL REFERENCES members_people(id) ON DELETE CASCADE,stage TEXT NOT NULL,next_action TEXT NOT NULL DEFAULT '',due_on TEXT,responsible_id BIGINT REFERENCES users(id) ON DELETE SET NULL,notes TEXT NOT NULL DEFAULT '',version BIGINT NOT NULL DEFAULT 1,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS personal_availability(id TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS schedule_responses(id TEXT PRIMARY KEY,schedule_id TEXT NOT NULL REFERENCES ministries_schedules(id) ON DELETE CASCADE,actor BIGINT REFERENCES users(id) ON DELETE SET NULL,previous_status TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS pickup_authorizations(id TEXT PRIMARY KEY,child_id BIGINT NOT NULL REFERENCES children(id) ON DELETE CASCADE,name TEXT NOT NULL,relationship TEXT NOT NULL DEFAULT '',identity_hint TEXT NOT NULL DEFAULT '',expires_on TEXT,active BIGINT NOT NULL DEFAULT 1,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS notice_acknowledgements(announcement_id TEXT NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,read_at TEXT NOT NULL,PRIMARY KEY(announcement_id,user_id))",
      "CREATE TABLE IF NOT EXISTS workflow_reviews(id TEXT PRIMARY KEY,application_id TEXT NOT NULL REFERENCES sector_applications(id) ON DELETE CASCADE,stage TEXT NOT NULL,responsible_id BIGINT REFERENCES users(id) ON DELETE SET NULL,due_on TEXT,note TEXT NOT NULL DEFAULT '',created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS finance_approvals(entry_id TEXT PRIMARY KEY REFERENCES finance_entries(id) ON DELETE CASCADE,requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,reviewed_at TEXT,entry_version BIGINT NOT NULL DEFAULT 1)",
      "CREATE TABLE IF NOT EXISTS finance_statement_lines(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,occurred_on TEXT NOT NULL,amount_cents BIGINT NOT NULL,description TEXT NOT NULL,reference TEXT NOT NULL DEFAULT '',fingerprint TEXT NOT NULL UNIQUE,entry_id TEXT REFERENCES finance_entries(id) ON DELETE SET NULL,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL)",
      "CREATE TABLE IF NOT EXISTS finance_transfers(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,target_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,amount_cents BIGINT NOT NULL,occurred_on TEXT NOT NULL,out_entry TEXT REFERENCES finance_entries(id) ON DELETE SET NULL,in_entry TEXT REFERENCES finance_entries(id) ON DELETE SET NULL,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL,active BIGINT NOT NULL DEFAULT 1)",
      "CREATE TABLE IF NOT EXISTS finance_recurrences(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,direction TEXT NOT NULL,description TEXT NOT NULL,amount_cents BIGINT NOT NULL,next_on TEXT NOT NULL,active BIGINT NOT NULL DEFAULT 1,created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL,anchor_day BIGINT NOT NULL DEFAULT 1)",
      "CREATE INDEX IF NOT EXISTS ministries_schedule_dates ON ministries_schedules(active,service_date,person_id)",
      "CREATE INDEX IF NOT EXISTS journey_pending ON member_journey(responsible_id,due_on)",
      "CREATE INDEX IF NOT EXISTS announcements_timing ON platform_announcements(active,dispatched,publish_at,expires_at)"
    ]
    for sql in statements:c.execute(sql)

    ensure_column(c,'finance_transfers','active','BIGINT NOT NULL DEFAULT 1')
