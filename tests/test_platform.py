from test_app import records,client,PASSWORD
from backend import store as s
from backend.platform_access import migrate

def test_existing_kids_and_central_access_are_separate():
    teacher=client(2);parent=client(3)
    assert teacher.get('/api/platform/me').status_code==200
    modules=parent.get('/api/platform/me').json()['modules']
    assert next(m for m in modules if m['id']=='kids')['enabled']
    assert not next(m for m in modules if m['id']=='finance')['enabled']
    assert teacher.get('/api/platform/users').status_code==403
    assert parent.get('/api/platform/modules/finance').status_code==403

def test_module_grant_revoke_enforced_on_existing_session():
    admin=client(1);parent=client(3)
    assert admin.put('/api/platform/users/3/modules/finance',json={'role':'viewer','enabled':True}).status_code==200
    assert parent.get('/api/platform/modules/finance').status_code==200
    assert admin.put('/api/platform/users/3/modules/finance',json={'role':'viewer','enabled':False}).status_code==200
    assert parent.get('/api/platform/modules/finance').status_code==403
    assert admin.put('/api/platform/users/3/modules/kids',json={'role':'parent','enabled':False}).status_code==200
    assert parent.get('/api/children').status_code==403
    assert parent.get('/api/platform/me').status_code==200
    assert admin.put('/api/platform/users/3/modules/kids',json={'role':'parent','enabled':True}).status_code==200
    assert parent.get('/api/children').status_code==200

def test_kids_admin_cannot_take_over_central_identity():
    admin=client(1)
    with s.db() as c:c.execute("INSERT INTO users(id,name,email,password,role,created_at) VALUES(5,'Kids admin','user5@example.test',?,'admin',?)",(s.password_hash(PASSWORD),s.now()));c.execute("INSERT INTO module_access VALUES(5,'kids','admin',1)")
    scoped=client(5)
    assert scoped.get('/api/rooms').status_code==200
    assert scoped.get('/api/platform/users').status_code==403
    assert scoped.patch('/api/users/1',json={'active':True,'rooms':[],'password':PASSWORD+'changed'}).status_code==403
    assert scoped.patch('/api/team/member/1',json={'password':PASSWORD+'changed'}).status_code==403
    assert scoped.put('/api/platform/users/2/modules/finance',json={'role':'admin','enabled':True}).status_code==403

def test_grants_csrf_validation_and_no_self_escalation():
    admin=client(1);parent=client(3)
    assert admin.put('/api/platform/users/3/modules/unknown',json={'role':'viewer','enabled':True}).status_code==400
    assert admin.put('/api/platform/users/3/modules/finance',json={'role':'teacher','enabled':True}).status_code==400
    assert parent.put('/api/platform/users/3/modules/finance',json={'role':'admin','enabled':True}).status_code==403
    admin.headers.pop('X-CSRF-Token')
    assert admin.put('/api/platform/users/3/modules/finance',json={'role':'admin','enabled':True}).status_code==403

def test_migration_never_reenables_revoked_access_or_promotes_new_kids_admin():
    with s.db() as c:
        c.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
        c.execute("UPDATE users SET role='admin' WHERE id=2")
        migrate(c)
        assert not c.execute('SELECT 1 FROM platform_admins WHERE user_id=2').fetchone()
        assert c.execute("SELECT enabled FROM module_access WHERE user_id=3 AND module='kids'").fetchone()[0]==0

def test_host_isolation(monkeypatch):
    monkeypatch.setenv('SYSTEMS_MODULE_HOSTS','{"finance.example.test":"finance"}')
    c=client(1)
    assert c.get('/api/children',headers={'Host':'finance.example.test'}).status_code==403
    assert c.get('/api/platform/me',headers={'Host':'finance.example.test'}).status_code==200

def test_finance_only_user_cannot_access_kids_but_can_access_finance():
    admin=client(1);parent=client(3)
    admin.put('/api/platform/users/3/modules/finance',json={'role':'viewer','enabled':True})
    admin.put('/api/platform/users/3/modules/kids',json={'role':'parent','enabled':False})
    assert parent.get('/api/finance').status_code==200
    assert parent.get('/api/members').status_code==403
    assert parent.get('/api/children').status_code==403

def test_revoked_kids_access_stops_pending_push(monkeypatch):
    from backend import push_worker
    from test_web_push import configure
    data=configure(monkeypatch);parent=client(3)
    assert parent.post('/api/web-push/subscribe',json=data).status_code==200
    assert parent.post('/api/web-push/test').status_code==200
    with s.db() as c:c.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
    delivered=[]
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    monkeypatch.setattr(push_worker.web_push,'send',lambda *args:delivered.append(True) or True)
    assert push_worker.deliver_batch()['sent']==0
    assert delivered==[]

def test_central_identity_starts_without_any_module():
    admin=client(1);parent=client(3)
    body={'name':'Finance identity','email':'finance.identity@example.test','password':PASSWORD}
    assert parent.post('/api/platform/users',json=body).status_code==403
    r=admin.post('/api/platform/users',json=body)
    assert r.status_code==200
    from fastapi.testclient import TestClient
    from backend.app import app
    new=TestClient(app)
    signed=new.post('/api/auth/login',json={'email':body['email'],'password':PASSWORD})
    assert signed.status_code==200
    new.headers['X-CSRF-Token']=signed.json()['csrf']
    assert not any(m['enabled'] for m in new.get('/api/platform/me').json()['modules'])
    assert new.get('/api/children').status_code==403
    assert admin.put(f"/api/platform/users/{r.json()['id']}/modules/finance",json={'role':'viewer','enabled':True}).status_code==200
    assert new.get('/api/finance').status_code==200
    assert new.get('/api/children').status_code==403
