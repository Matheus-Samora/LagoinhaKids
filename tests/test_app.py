import os, tempfile, time
from pathlib import Path
runtime=tempfile.TemporaryDirectory(prefix='lagoinha-kids-tests-')
os.environ['KIDS_DATA_DIR']=runtime.name
os.environ['KIDS_PUBLIC_URL']='http://127.0.0.1:8770'
from fastapi.testclient import TestClient
from backend.app import app
from backend import store as s
import pytest

PASSWORD='Test-only-password-2026!'
@pytest.fixture(autouse=True)
def records(monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID',raising=False)
    monkeypatch.delenv('GOOGLE_CLIENT_SECRET',raising=False)
    monkeypatch.delenv('KIDS_WEB_PUSH_PRIVATE_KEY',raising=False)
    monkeypatch.delenv('KIDS_WEB_PUSH_KEY_PATH',raising=False)
    with s.db() as c:
        for table in ['platform_announcements','module_changes','sector_applications','finance_service_closings','finance_invoices','finance_entries','finance_cost_centers','finance_accounts','finance_files','ministries_schedules','ministries_resources','ministries_assignments','members_self_registrations','members_people','members_families','members_cells','module_scopes','module_access','pastoral_users','platform_admins','media','web_subscriptions','paging_requests','guest_checkins','event_registrations','events','mfa_recovery','outbox','attendance_events','family_links','family_invites','waitlist','auth_tokens','terms_consents','device_tokens','reservations','lessons','audit','notifications','attendance','children','teacher_rooms','rooms','sessions','attempts','oauth','users']:
            c.execute(f'DELETE FROM {table}')
        for uid,role in [(1,'admin'),(2,'teacher'),(3,'parent'),(4,'parent')]:
            c.execute('INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',(uid,f'User {uid}',f'user{uid}@example.test',s.password_hash(PASSWORD),role,s.now()))
        c.execute('INSERT INTO platform_admins VALUES(1)')
        from backend.platform_access import kids_grant
        for uid,role in [(1,'admin'),(2,'teacher'),(3,'parent'),(4,'parent')]:kids_grant(c,uid,role)
        c.execute('INSERT INTO rooms(id,name,min_age,max_age,capacity,color) VALUES(1,"Turma A",2,6,10,"#d6e5ae")')
        c.execute('INSERT INTO rooms(id,name,min_age,max_age,capacity,color) VALUES(2,"Turma B",2,6,10,"#d6e5ae")')
        c.execute('INSERT INTO teacher_rooms VALUES(2,1)')
        c.execute('INSERT INTO children(id,name,birthday,room_id,parent_id,created_at) VALUES(1,"Aluno fictício A","2021-01-01",1,3,?)',(s.now(),))
        c.execute('INSERT INTO children(id,name,birthday,room_id,parent_id,created_at) VALUES(2,"Aluno fictício B","2021-01-01",2,4,?)',(s.now(),))

def client(uid=1):
    c=TestClient(app)
    result=c.post('/api/auth/login',json={'email':f'user{uid}@example.test','password':PASSWORD})
    assert result.status_code==200
    c.headers['X-CSRF-Token']=result.json()['csrf']
    return c

def test_anonymous_and_csrf():
    c=TestClient(app)
    assert c.get('/api/children').status_code==401
    c=client(2);c.headers.pop('X-CSRF-Token')
    assert c.post('/api/children/1/notify',json={'kind':'please_pickup'}).status_code==403

def test_parent_scope_and_staff_routes():
    c=client(3)
    assert [ch['id'] for ch in c.get('/api/children').json()]==[1]
    assert c.get('/api/users').status_code==403
    assert c.post('/api/children/2/notify',json={'kind':'arriving'}).status_code==403
    assert c.post('/api/children/1/face/enroll',files={'image':('a.jpg',b'invalid')}).status_code==403
    assert c.post('/api/children/1/attendance',json={'action':'in','guardian_id':3,'guardian_confirmed':True}).status_code==403

def test_teacher_scope_and_privilege():
    c=client(2)
    assert [ch['id'] for ch in c.get('/api/children').json()]==[1]
    assert c.post('/api/children/2/notify',json={'kind':'please_pickup'}).status_code==403
    assert c.get('/api/users').status_code==403
    assert c.post('/api/users',json={'name':'Bad','email':'bad@e.test','password':PASSWORD,'role':'admin','terms_accepted':True,'terms_version':'2026.1'}).status_code==403
    assert c.post('/api/children/1/consent',json={'allowed':True}).status_code==403

def test_signup_never_escalates():
    c=TestClient(app)
    r=c.post('/api/auth/register',json={'name':'Parent new','email':'new@e.test','password':PASSWORD,'role':'admin','terms_accepted':True,'terms_version':'2026.1'})
    assert r.status_code==200 and r.json()['user']['role']=='parent'
    assert c.get('/api/children').json()==[]

def test_origin_and_password_policy():
    c=TestClient(app)
    r=c.post('/api/auth/register',json={'name':'Parent new','email':'new@e.test','password':'short'})
    assert r.status_code==400
    r=c.post('/api/auth/login',json={'email':'user1@example.test','password':PASSWORD},headers={'Origin':'https://evil.example'})
    assert r.status_code==403

def test_failed_login_throttled_and_logout():
    c=TestClient(app)
    for _ in range(6): assert c.post('/api/auth/login',json={'email':'user1@example.test','password':'wrong'}).status_code==401
    assert c.post('/api/auth/login',json={'email':'user1@example.test','password':PASSWORD}).status_code==429
    c=client(2);assert c.post('/api/auth/logout').status_code==200
    assert c.get('/api/me').status_code==401

def test_attendance_requires_manual_guardian_and_notifies():
    c=client(2)
    assert c.post('/api/children/1/attendance',json={'action':'in','guardian_id':3}).status_code==400
    assert c.post('/api/children/1/attendance',json={'action':'in','guardian_id':4,'guardian_confirmed':True}).status_code==403
    payload={'action':'in','guardian_id':3,'guardian_confirmed':True}
    assert c.post('/api/children/1/attendance',json=payload).status_code==200
    assert c.post('/api/children/1/attendance',json=payload).status_code==409
    assert c.get('/api/children').json()[0]['status']=='present'
    parent=client(3);assert parent.get('/api/notifications').json()[0]['kind']=='attendance'
    payload['claim_code']=c.get('/api/children').json()[0]['claim_code'];payload['action']='out';assert c.post('/api/children/1/attendance',json=payload).status_code==200
    assert c.get('/api/children').json()[0]['status']=='departed'

def test_bidirectional_notifications_and_read_isolation():
    teacher=client(2);parent=client(3);other=client(4)
    assert teacher.post('/api/children/1/notify',json={'kind':'please_pickup','message':'Venha à sala.'}).status_code==200
    notif=parent.get('/api/notifications').json()[0]
    assert other.get('/api/notifications').json()==[]
    assert other.post(f'/api/notifications/{notif["id"]}/read').status_code==404
    assert parent.post(f'/api/notifications/{notif["id"]}/read').status_code==200
    assert parent.post('/api/children/1/notify',json={'kind':'pickup_ready'}).status_code==200
    assert teacher.get('/api/notifications').json()[0]['kind']=='pickup_ready'
    assert parent.post('/api/children/1/notify',json={'kind':'please_pickup'}).status_code==403
    assert teacher.post('/api/notifications/read-all').status_code==200
    assert teacher.get('/api/notifications').json()[0]['read_at'] is not None

def test_admin_roles_rooms_and_disabling_invalidates_sessions():
    a=client();t=client(2)
    result=a.post('/api/users',json={'name':'New Teacher','email':'teacher@e.test','password':PASSWORD,'role':'teacher','rooms':[2]})
    assert result.status_code==200
    assert a.patch('/api/users/2',json={'active':False,'rooms':[1]}).status_code==200
    assert t.get('/api/me').status_code==401
    assert a.patch('/api/users/1',json={'active':False}).status_code==400
    assert a.get('/api/audit').status_code==200

def test_consent_revocation_and_guardian_change_erase_template():
    parent=client(3);teacher=client(2);admin=client()
    assert teacher.post('/api/children/1/face/enroll',files={'image':('a.jpg',b'invalid')}).status_code==403
    assert parent.post('/api/children/1/consent',json={'allowed':True}).status_code==200
    with s.db() as c:c.execute('UPDATE children SET face_template=? WHERE id=1',(b'encrypted-fixture',))
    assert parent.post('/api/children/1/consent',json={'allowed':False}).status_code==200
    with s.db() as c:assert c.execute('SELECT face_template FROM children WHERE id=1').fetchone()[0] is None
    assert admin.post('/api/children/1/guardian',json={'parent_id':4}).status_code==200
    assert parent.get('/api/children').json()==[]
    assert client(4).get('/api/children').json()[0]['face_allowed']==0

def test_retired_face_does_not_create_biometrics():
    parent=client(3);teacher=client(2)
    parent.post('/api/children/1/consent',json={'allowed':True})
    for action in ('enroll','verify'):
        response=teacher.post('/api/children/1/face/'+action,files={'image':('fixture.jpg',b'not-a-face')})
        assert response.status_code==410
    with s.db() as c:assert c.execute('SELECT face_template FROM children WHERE id=1').fetchone()[0] is None
    assert teacher.get('/api/children').json()[0]['status']=='absent'


def test_password_change_and_session_revocation():
    p=client(3);other=client(3)
    assert p.post('/api/auth/password',json={'current':'wrong','password':PASSWORD+'new'}).status_code==403
    assert p.post('/api/auth/password',json={'current':PASSWORD,'password':PASSWORD+'new'}).status_code==200
    assert other.get('/api/me').status_code==401
    assert p.get('/api/me').status_code==200

def test_google_disabled_and_forged_state_rejected():
    c=TestClient(app)
    assert c.get('/api/auth/google/start').status_code==503
    assert c.get('/api/auth/google/callback?state=forged&code=forged').status_code==403

def test_google_state_bound_to_browser_and_link_requires_session(monkeypatch):
    monkeypatch.setenv('GOOGLE_CLIENT_ID','fixture-id')
    monkeypatch.setenv('GOOGLE_CLIENT_SECRET','fixture-secret')
    c=TestClient(app)
    assert c.get('/api/auth/google/start?mode=link',follow_redirects=False).status_code==401
    r=c.get('/api/auth/google/start',follow_redirects=False)
    assert r.status_code==302 and 'nonce=' in r.headers['location']
    from urllib.parse import urlparse,parse_qs
    state=parse_qs(urlparse(r.headers['location']).query)['state'][0]
    attacker=TestClient(app)
    assert attacker.get('/api/auth/google/callback',params={'state':state,'code':'bad'}).status_code==403

def test_native_bearer_session_and_cors():
    c=TestClient(app)
    origin='https://localhost'
    r=c.options('/api/auth/login',headers={'Origin':origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Content-Type,X-Native-Client'})
    assert r.status_code==200 and r.headers['access-control-allow-origin']==origin
    r=c.post('/api/auth/login',json={'email':'user3@example.test','password':PASSWORD},headers={'Origin':origin,'X-Native-Client':'1'})
    assert r.status_code==200 and r.json()['access_token']
    token=r.json()['access_token']
    c.cookies.clear()
    headers={'Origin':origin,'Authorization':'Bearer '+token}
    assert [row['id'] for row in c.get('/api/children',headers=headers).json()]==[1]
    assert c.post('/api/children/1/notify',json={'kind':'arriving'},headers=headers).status_code==200
    assert c.get('/api/users',headers=headers).status_code==403
    assert c.post('/api/auth/logout',headers=headers).status_code==200
    assert c.get('/api/me',headers=headers).status_code==401
