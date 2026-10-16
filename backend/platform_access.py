"""Shared identity and explicit module grants; business data stays in its module."""
import os,json
MODULES={'kids':'Lagoinha Kids','finance':'Lagoinha Finance','members':'Lagoinha Members','ministries':'Lagoinha Ministries'}
ROLES={'kids':('admin','teacher','parent'),'finance':('admin','editor','viewer'),'members':('admin','editor','viewer'),'ministries':('admin','editor','viewer')}

def migrate(c,postgres=False):
    if postgres or not getattr(c,'in_transaction',False):c.execute('BEGIN IMMEDIATE')
    c.execute('CREATE TABLE IF NOT EXISTS platform_migrations(name TEXT PRIMARY KEY)')
    c.execute('CREATE TABLE IF NOT EXISTS platform_admins(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE)')
    c.execute('''CREATE TABLE IF NOT EXISTS module_access(user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,module TEXT NOT NULL,role TEXT NOT NULL,enabled BIGINT NOT NULL DEFAULT 1,PRIMARY KEY(user_id,module))''')
    if not c.execute("SELECT 1 FROM platform_migrations WHERE name='systems_v1'").fetchone():
        c.execute("INSERT INTO platform_admins(user_id) SELECT id FROM users WHERE role='admin'")
        c.execute("INSERT INTO module_access(user_id,module,role,enabled) SELECT id,'kids',role,1 FROM users")
        c.execute("INSERT INTO platform_migrations VALUES('systems_v1')")

def platform_admin(c,uid):return bool(c.execute('SELECT 1 FROM platform_admins WHERE user_id=?',(uid,)).fetchone())
def allowed(c,user,module):
    if platform_admin(c,user['id']):return True
    return bool(c.execute('SELECT 1 FROM module_access WHERE user_id=? AND module=? AND enabled=1',(user['id'],module)).fetchone())
def kids_grant(c,uid,role):
    c.execute("INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,'kids',?,1) ON CONFLICT(user_id,module) DO NOTHING",(uid,role))
def host_module(host):
    # Exact hostnames only; never trust a client-supplied forwarded-host header.
    mapping=json.loads(os.getenv('SYSTEMS_MODULE_HOSTS','{}'))
    return mapping.get(host.lower().split(':')[0])

def module_url(module):
    mapping=json.loads(os.getenv('SYSTEMS_MODULE_HOSTS','{}'))
    for host,key in mapping.items():
        if key==module:return 'https://'+host
    return '/'+module
