import os, sqlite3, secrets, hashlib, hmac, time
from pathlib import Path
from contextlib import contextmanager
from contextvars import ContextVar
REQUEST_IP=ContextVar("request_ip",default="")
from datetime import datetime
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent.parent
from dotenv import load_dotenv
load_dotenv(ROOT / '.env')
DATA = Path(os.getenv('KIDS_DATA_DIR', str(ROOT / 'runtime'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'kids.sqlite3'
if os.getenv('K_SERVICE') and not os.getenv('KIDS_DATABASE_URL'):
    raise RuntimeError('Cloud Run requires KIDS_DATABASE_URL; ephemeral SQLite is forbidden.')
env_key = os.getenv('KIDS_BIOMETRIC_KEY') or os.getenv('KIDS_MASTER_KEY')
if env_key:
    raw_key = env_key.strip().encode('utf-8') if isinstance(env_key, str) else env_key
    CIPHER = Fernet(raw_key)
else:
    key_file = DATA / 'biometric.key'
    if not key_file.exists():
        with key_file.open('xb') as stream: stream.write(Fernet.generate_key())
    CIPHER = Fernet(key_file.read_bytes())


@contextmanager
def db():
    if os.getenv('KIDS_DATABASE_URL'):
        from .postgres import db as postgres_db
        with postgres_db() as connection:yield connection
        return
    conn = sqlite3.connect(DB, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    conn.execute('PRAGMA busy_timeout=15000')
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally: conn.close()

def now(): return datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')
def today(): return now()[:10]
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def password_hash(password):
    salt = secrets.token_hex(16)
    value = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return salt + ':' + value
def password_ok(password, stored):
    try:
        salt, expected = stored.split(':')
        actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
        return hmac.compare_digest(actual, expected)
    except (ValueError, AttributeError): return False
def audit(conn, user, action, child=None):
    previous=conn.execute('SELECT prev_hash FROM audit ORDER BY id DESC LIMIT 1').fetchone()
    stamp=now();prior=previous[0] if previous else ''
    ip=REQUEST_IP.get()
    chain=digest(f'{prior}|{user}|{action}|{child}|{stamp}|{ip}')
    conn.execute('INSERT INTO audit(actor,action,child_id,created_at,prev_hash,ip) VALUES(?,?,?,?,?,?)',(user,action,child,stamp,chain,ip))

CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
def generate_claim_code(length=4):
    return ''.join(secrets.choice(CLAIM_ALPHABET) for _ in range(length))

def migrate_safety_and_health(conn):
    """Additive migration for allergies, medical conditions, security claim tags and LGPD records."""
    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'children' in tables:
        c_fields = {r[1] for r in conn.execute('PRAGMA table_info(children)')}
        for col in ('allergies', 'medical_conditions', 'emergency_medication', 'special_needs', 'authorized_pickups', 'avatar_url'):
            if col not in c_fields:
                conn.execute(f'ALTER TABLE children ADD COLUMN {col} TEXT NOT NULL DEFAULT ""')
    if 'users' in tables:
        for statement in ('ALTER TABLE users ADD COLUMN mfa_secret TEXT','ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0'):
            field='mfa_secret' if 'mfa_secret' in statement else 'email_verified'
            if field not in {r[1] for r in conn.execute('PRAGMA table_info(users)')}:conn.execute(statement)
        u_fields = {r[1] for r in conn.execute('PRAGMA table_info(users)')}
        if 'phone' not in u_fields:
            conn.execute('ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ""')
        if 'avatar_url' not in u_fields:
            conn.execute('ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ""')
    if 'attendance' in tables:
        a_fields = {r[1] for r in conn.execute('PRAGMA table_info(attendance)')}
        if 'claim_code' not in a_fields:
            conn.execute('ALTER TABLE attendance ADD COLUMN claim_code TEXT NOT NULL DEFAULT ""')
        if 'checkout_guardian' not in a_fields:
            conn.execute('ALTER TABLE attendance ADD COLUMN checkout_guardian TEXT NOT NULL DEFAULT ""')
    if 'audit' in tables:
        aud_fields = {r[1] for r in conn.execute('PRAGMA table_info(audit)')}
        if 'ip' not in aud_fields:
            conn.execute('ALTER TABLE audit ADD COLUMN ip TEXT NOT NULL DEFAULT ""')
        if 'prev_hash' not in aud_fields:
            conn.execute('ALTER TABLE audit ADD COLUMN prev_hash TEXT NOT NULL DEFAULT ""')
    conn.execute('''CREATE TABLE IF NOT EXISTS terms_consents(
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        child_id INTEGER,
        term_version TEXT NOT NULL,
        term_type TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL
    )''')
    statements=[
      'CREATE TABLE IF NOT EXISTS attendance_events(id INTEGER PRIMARY KEY,child_id INTEGER NOT NULL REFERENCES children(id),lesson_id INTEGER REFERENCES lessons(id),action TEXT NOT NULL,guardian_id INTEGER,guardian_name TEXT NOT NULL,actor INTEGER NOT NULL,created_at TEXT NOT NULL,exception_reason TEXT NOT NULL DEFAULT "")',
      'CREATE TABLE IF NOT EXISTS family_links(child_id INTEGER NOT NULL REFERENCES children(id),user_id INTEGER NOT NULL REFERENCES users(id),can_pickup INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(child_id,user_id))',
      'CREATE TABLE IF NOT EXISTS family_invites(token TEXT PRIMARY KEY,child_id INTEGER NOT NULL REFERENCES children(id),email TEXT NOT NULL,expires INTEGER NOT NULL,actor INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS waitlist(id INTEGER PRIMARY KEY,lesson_id INTEGER NOT NULL REFERENCES lessons(id),child_id INTEGER NOT NULL REFERENCES children(id),actor INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(lesson_id,child_id))',
      'CREATE TABLE IF NOT EXISTS mfa_recovery(user_id INTEGER NOT NULL REFERENCES users(id),code_hash TEXT NOT NULL,PRIMARY KEY(user_id,code_hash))',
      'CREATE TABLE IF NOT EXISTS auth_tokens(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,expires INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY,notification_id INTEGER NOT NULL UNIQUE REFERENCES notifications(id),status TEXT NOT NULL DEFAULT "pending",attempts INTEGER NOT NULL DEFAULT 0,next_attempt INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT "",delivered_at TEXT)',
      'CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,id)',
      'CREATE INDEX IF NOT EXISTS children_parent ON children(parent_id,archived)',
      'CREATE INDEX IF NOT EXISTS children_room ON children(room_id,archived)',
      'CREATE INDEX IF NOT EXISTS events_child ON attendance_events(child_id,id)',
      'CREATE TRIGGER IF NOT EXISTS queue_notification AFTER INSERT ON notifications BEGIN INSERT INTO outbox(notification_id) VALUES(NEW.id); END',
      'CREATE TRIGGER IF NOT EXISTS family_notification AFTER INSERT ON notifications WHEN NEW.child_id IS NOT NULL AND NEW.user_id=(SELECT parent_id FROM children WHERE id=NEW.child_id) BEGIN INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) SELECT f.user_id,NEW.child_id,NEW.kind,NEW.title,NEW.message,NEW.sender,NEW.created_at FROM family_links f JOIN users u ON u.id=f.user_id WHERE f.child_id=NEW.child_id AND f.active=1 AND u.active=1 AND f.user_id!=NEW.user_id; END'
    ]
    for statement in statements:
        if 'notifications' not in tables and ('notifications_user' in statement or 'queue_notification' in statement or 'family_notification' in statement):continue
        conn.execute(statement)
    conn.execute('''CREATE TABLE IF NOT EXISTS device_tokens(
        id INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL UNIQUE,
        platform TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )''')

    if 'session_token' not in {r[1] for r in conn.execute('PRAGMA table_info(device_tokens)')}:
        conn.execute('ALTER TABLE device_tokens ADD COLUMN session_token TEXT NOT NULL DEFAULT ""')
    conn.execute('''CREATE TABLE IF NOT EXISTS web_subscriptions(
        id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),
        endpoint TEXT NOT NULL UNIQUE,keys_json TEXT NOT NULL,session_token TEXT NOT NULL,updated_at TEXT NOT NULL)''')

    if 'lessons' in tables:
        l_fields = {r[1] for r in conn.execute('PRAGMA table_info(lessons)')}
        for col in ('theme', 'memory_verse', 'family_question'):
            if col not in l_fields:
                conn.execute(f'ALTER TABLE lessons ADD COLUMN {col} TEXT NOT NULL DEFAULT ""')

    conn.execute('''CREATE TABLE IF NOT EXISTS events(
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        target_audience TEXT NOT NULL DEFAULT "all",
        min_age INTEGER NOT NULL DEFAULT 0,
        max_age INTEGER NOT NULL DEFAULT 17,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        location TEXT NOT NULL DEFAULT "",
        price TEXT NOT NULL DEFAULT "Gratuito",
        max_capacity INTEGER NOT NULL DEFAULT 100,
        banner_url TEXT NOT NULL DEFAULT "",
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS event_registrations(
        id INTEGER PRIMARY KEY,
        event_id INTEGER NOT NULL REFERENCES events(id),
        child_id INTEGER NOT NULL REFERENCES children(id),
        guardian_id INTEGER NOT NULL REFERENCES users(id),
        status TEXT NOT NULL DEFAULT "confirmed",
        notes TEXT NOT NULL DEFAULT "",
        created_at TEXT NOT NULL,
        UNIQUE(event_id, child_id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS paging_requests(
        id INTEGER PRIMARY KEY,
        child_id INTEGER NOT NULL REFERENCES children(id),
        room_id INTEGER REFERENCES rooms(id),
        claim_code TEXT NOT NULL DEFAULT "",
        reason TEXT NOT NULL DEFAULT "Acolhimento necessário",
        status TEXT NOT NULL DEFAULT "active",
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        actor INTEGER NOT NULL REFERENCES users(id)
    )''')
    conn.execute('''CREATE TABLE IF NOT EXISTS guest_checkins(
        id INTEGER PRIMARY KEY,
        child_name TEXT NOT NULL,
        child_age INTEGER NOT NULL,
        guardian_name TEXT NOT NULL,
        guardian_phone TEXT NOT NULL,
        allergies TEXT NOT NULL DEFAULT "",
        room_id INTEGER REFERENCES rooms(id),
        claim_code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        actor INTEGER NOT NULL REFERENCES users(id)
    )''')
    fields={r[1] for r in conn.execute('PRAGMA table_info(guest_checkins)')}
    for column,definition in [('status',"TEXT NOT NULL DEFAULT 'present'"),('out_at','TEXT'),('checkout_actor','INTEGER')]:
        if column not in fields:conn.execute(f'ALTER TABLE guest_checkins ADD COLUMN {column} {definition}')
    p_fields={r[1] for r in conn.execute('PRAGMA table_info(paging_requests)')}
    for column,definition in [('acknowledged_at','TEXT'),('acknowledged_by','INTEGER REFERENCES users(id)')]:
        if column not in p_fields:conn.execute(f'ALTER TABLE paging_requests ADD COLUMN {column} {definition}')
    r_fields={r[1] for r in conn.execute('PRAGMA table_info(rooms)')}
    if 'version' not in r_fields:
        conn.execute('ALTER TABLE rooms ADD COLUMN version INTEGER NOT NULL DEFAULT 1')
    if 'cover_url' not in r_fields:
        conn.execute('ALTER TABLE rooms ADD COLUMN cover_url TEXT NOT NULL DEFAULT ""')
    conn.execute('''CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        data BLOB,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL
    )''')
    if conn.execute("SELECT 1 FROM sqlite_master WHERE name='notifications'").fetchone():
        conn.execute('CREATE INDEX IF NOT EXISTS notice_user_id ON notifications(user_id,id)')
    conn.execute('CREATE INDEX IF NOT EXISTS family_user_active ON family_links(user_id,active,child_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS guest_status_room ON guest_checkins(status,room_id,created_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS events_active ON events(active, target_audience, starts_at)')
    conn.execute('CREATE INDEX IF NOT EXISTS event_reg_event ON event_registrations(event_id, child_id)')
    conn.execute('CREATE INDEX IF NOT EXISTS paging_active ON paging_requests(status, created_at)')

def migrate_school():
    """Transactional, additive migration; preserve children, attendance and templates."""
    conn=sqlite3.connect(DB,timeout=20)
    try:
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=OFF')
        conn.execute('BEGIN IMMEDIATE')
        fields={r[1] for r in conn.execute('PRAGMA table_info(rooms)')}
        if 'created_by' not in fields: conn.execute('ALTER TABLE rooms ADD COLUMN created_by INTEGER REFERENCES users(id)')
        if 'active' not in fields: conn.execute('ALTER TABLE rooms ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
        info={r[1]:r for r in conn.execute('PRAGMA table_info(children)')}
        if info.get('room_id') and info['room_id'][3]:
            conn.execute('CREATE TABLE children_nullable_v2(id INTEGER PRIMARY KEY,name TEXT NOT NULL,birthday TEXT NOT NULL,room_id INTEGER REFERENCES rooms(id),parent_id INTEGER REFERENCES users(id),face_allowed INTEGER NOT NULL DEFAULT 0,face_template BLOB,consent_at TEXT,created_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,allergies TEXT NOT NULL DEFAULT "",medical_conditions TEXT NOT NULL DEFAULT "",emergency_medication TEXT NOT NULL DEFAULT "",special_needs TEXT NOT NULL DEFAULT "",authorized_pickups TEXT NOT NULL DEFAULT "")')
            columns='id,name,birthday,room_id,parent_id,face_allowed,face_template,consent_at,created_at'
            if 'archived' in info: columns+=',archived'
            for col in ('allergies','medical_conditions','emergency_medication','special_needs','authorized_pickups'):
                if col in info:columns+=','+col
            conn.execute(f'INSERT INTO children_nullable_v2({columns}) SELECT {columns} FROM children')
            conn.execute('DROP TABLE children')
            conn.execute('ALTER TABLE children_nullable_v2 RENAME TO children')
        elif 'archived' not in info: conn.execute('ALTER TABLE children ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
        conn.execute('CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,room_id INTEGER NOT NULL REFERENCES rooms(id),title TEXT NOT NULL,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id))')
        conn.execute('CREATE TABLE IF NOT EXISTS reservations(lesson_id INTEGER NOT NULL REFERENCES lessons(id),child_id INTEGER NOT NULL REFERENCES children(id),confirmed INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL,PRIMARY KEY(lesson_id,child_id))')
        conn.execute('CREATE INDEX IF NOT EXISTS lessons_schedule ON lessons(starts_at,ends_at)')
        conn.execute('CREATE INDEX IF NOT EXISTS reservations_child ON reservations(child_id,confirmed)')
        conn.execute('UPDATE rooms SET created_by=coalesce((SELECT user_id FROM teacher_rooms WHERE room_id=rooms.id ORDER BY user_id LIMIT 1),(SELECT id FROM users WHERE role="admin" ORDER BY id LIMIT 1)) WHERE created_by IS NULL')
        migrate_safety_and_health(conn)
        if conn.execute('PRAGMA foreign_key_check').fetchone(): raise RuntimeError('Migration aborted: database reference integrity failed.')
        conn.execute('PRAGMA user_version=4')
        conn.commit()
    except BaseException:
        conn.rollback();raise
    finally:conn.close()

def init():
    if os.getenv('KIDS_DATABASE_URL'):
        from .postgres import init as postgres_init
        postgres_init()
        return
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT,role TEXT NOT NULL CHECK(role IN ('admin','teacher','parent')),active INTEGER NOT NULL DEFAULT 1,google_sub TEXT UNIQUE,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,failures INTEGER NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,nonce TEXT NOT NULL,browser TEXT NOT NULL,user_id INTEGER,mode TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY,name TEXT NOT NULL,min_age INTEGER NOT NULL,max_age INTEGER NOT NULL,capacity INTEGER NOT NULL,color TEXT NOT NULL,cover_url TEXT NOT NULL DEFAULT "");
        CREATE TABLE IF NOT EXISTS teacher_rooms(user_id INTEGER REFERENCES users(id),room_id INTEGER REFERENCES rooms(id),PRIMARY KEY(user_id,room_id));
        CREATE TABLE IF NOT EXISTS children(id INTEGER PRIMARY KEY,name TEXT NOT NULL,birthday TEXT NOT NULL,room_id INTEGER NOT NULL REFERENCES rooms(id),parent_id INTEGER REFERENCES users(id),face_allowed INTEGER NOT NULL DEFAULT 0,face_template BLOB,consent_at TEXT,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attendance(child_id INTEGER REFERENCES children(id),day TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('present','departed')),in_at TEXT NOT NULL,out_at TEXT,guardian TEXT NOT NULL,actor INTEGER REFERENCES users(id),PRIMARY KEY(child_id,day));
        CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),child_id INTEGER REFERENCES children(id),kind TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,sender INTEGER REFERENCES users(id),created_at TEXT NOT NULL,read_at TEXT);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER REFERENCES users(id),action TEXT NOT NULL,child_id INTEGER,created_at TEXT NOT NULL);
        ''')
    migrate_school()

def seed():
    if os.getenv('KIDS_ALLOW_DEMO_SEED')!='true' or os.getenv('K_SERVICE'):
        raise RuntimeError('Demonstration data disabled. Set KIDS_ALLOW_DEMO_SEED=true only in an isolated development environment.')
    init()
    with db() as c:
        if c.execute('SELECT count(*) FROM users').fetchone()[0]: return False
        accounts = [('admin','Ana Costa','admin@lagoinha.test'),('teacher','Mariana Alves','professora@lagoinha.test'),('parent','Gabriel Oliveira','pai@lagoinha.test'),('parent','Juliana Santos','mae@lagoinha.test')]
        credentials=[]
        for role,name,email in accounts:
            password=secrets.token_urlsafe(14)
            c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(name,email,password_hash(password),role,now()))
            credentials.append((role,email,password))
        for name,mi,ma,cap,color in [('Sementinhas',2,3,12,'#18181b'),('Pequenos Exploradores',4,6,18,'#27272a'),('Geração Kids',7,11,24,'#3f3f46')]:
            c.execute('INSERT INTO rooms(name,min_age,max_age,capacity,color) VALUES(?,?,?,?,?)',(name,mi,ma,cap,color))
        c.execute('INSERT INTO teacher_rooms VALUES(2,2)')
        c.execute('UPDATE rooms SET created_by=CASE WHEN id=2 THEN 2 ELSE 1 END')
        kids=[('Lucas Oliveira','2021-05-12',2,3),('Sofia Oliveira','2023-02-18',1,3),('Helena Santos','2020-07-08',2,4),('Theo Santos','2021-03-10',2,4),('Alice Santos','2018-09-15',3,4),('Miguel Oliveira','2017-08-04',3,3)]
        for name,birthday,room,parent in kids: c.execute('INSERT INTO children(name,birthday,room_id,parent_id,created_at) VALUES(?,?,?,?,?)',(name,birthday,room,parent,now()))
        c.execute('INSERT INTO attendance(child_id,day,status,in_at,out_at,guardian,actor) VALUES(?,?,?,?,?,?,?)',(1,today(),'present',now(),None,'Gabriel Oliveira',2))
        c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(3,1,?,?,?,?,?)',('welcome','Bem-vindo ao Lagoinha Kids','Estes são dados fictícios para conhecer o aplicativo.',1,now()))
    # Credentials are a local deliverable; never print or include them in export ZIPs.
    text='# Acessos locais — Lagoinha Kids\n\nContas fictícias de demonstração. Troque as senhas em Minha conta. Não use estes dados em produção.\n\n'
    text+='\n'.join(f'- **{r}**: `{e}` — senha: `{p}`' for r,e,p in credentials)
    (DATA/'ACESSOS-LOCAIS.md').write_text(text,encoding='utf-8')
    return True

init()
