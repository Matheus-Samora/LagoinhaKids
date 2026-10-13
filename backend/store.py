import os, sqlite3, secrets, hashlib, hmac, time
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime
from zoneinfo import ZoneInfo
from cryptography.fernet import Fernet

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.getenv('KIDS_DATA_DIR', str(ROOT / 'runtime'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'kids.sqlite3'
key_file = DATA / 'biometric.key'
if not key_file.exists():
    with key_file.open('xb') as stream: stream.write(Fernet.generate_key())
CIPHER = Fernet(key_file.read_bytes())

@contextmanager
def db():
    conn = sqlite3.connect(DB, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
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
    conn.execute('INSERT INTO audit(actor,action,child_id,created_at) VALUES(?,?,?,?)', (user,action,child,now()))

def init():
    with db() as c:
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT,role TEXT NOT NULL CHECK(role IN ('admin','teacher','parent')),active INTEGER NOT NULL DEFAULT 1,google_sub TEXT UNIQUE,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,failures INTEGER NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS oauth(state TEXT PRIMARY KEY,nonce TEXT NOT NULL,browser TEXT NOT NULL,user_id INTEGER,mode TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY,name TEXT NOT NULL,min_age INTEGER NOT NULL,max_age INTEGER NOT NULL,capacity INTEGER NOT NULL,color TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS teacher_rooms(user_id INTEGER REFERENCES users(id),room_id INTEGER REFERENCES rooms(id),PRIMARY KEY(user_id,room_id));
        CREATE TABLE IF NOT EXISTS children(id INTEGER PRIMARY KEY,name TEXT NOT NULL,birthday TEXT NOT NULL,room_id INTEGER NOT NULL REFERENCES rooms(id),parent_id INTEGER REFERENCES users(id),face_allowed INTEGER NOT NULL DEFAULT 0,face_template BLOB,consent_at TEXT,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS attendance(child_id INTEGER REFERENCES children(id),day TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('present','departed')),in_at TEXT NOT NULL,out_at TEXT,guardian TEXT NOT NULL,actor INTEGER REFERENCES users(id),PRIMARY KEY(child_id,day));
        CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),child_id INTEGER REFERENCES children(id),kind TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,sender INTEGER REFERENCES users(id),created_at TEXT NOT NULL,read_at TEXT);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor INTEGER REFERENCES users(id),action TEXT NOT NULL,child_id INTEGER,created_at TEXT NOT NULL);
        ''')

def seed():
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
        kids=[('Lucas Oliveira','2021-05-12',2,3),('Sofia Oliveira','2023-02-18',1,3),('Helena Santos','2020-07-08',2,4),('Theo Santos','2021-03-10',2,4),('Alice Santos','2018-09-15',3,4),('Miguel Oliveira','2017-08-04',3,3)]
        for name,birthday,room,parent in kids: c.execute('INSERT INTO children(name,birthday,room_id,parent_id,created_at) VALUES(?,?,?,?,?)',(name,birthday,room,parent,now()))
        c.execute('INSERT INTO attendance VALUES(?,?,?,?,?,?,?)',(1,today(),'present',now(),None,'Gabriel Oliveira',2))
        c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(3,1,?,?,?,?,?)',('welcome','Bem-vindo ao Lagoinha Kids','Estes são dados fictícios para conhecer o aplicativo.',1,now()))
    # Credentials are a local deliverable; never print or include them in export ZIPs.
    text='# Acessos locais — Lagoinha Kids\n\nContas fictícias de demonstração. Troque as senhas em Minha conta. Não use estes dados em produção.\n\n'
    text+='\n'.join(f'- **{r}**: `{e}` — senha: `{p}`' for r,e,p in credentials)
    (DATA/'ACESSOS-LOCAIS.md').write_text(text,encoding='utf-8')
    return True

init()
