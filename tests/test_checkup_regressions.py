from test_app import records,client,PASSWORD
from backend import store as s
from fastapi.testclient import TestClient
from backend.app import app

def test_teacher_cannot_manage_accounts_or_read_candidates():
    teacher=client(2)
    payload={'name':'Scoped monitor','email':'scope@example.test','password':PASSWORD,'rooms':[2]}
    assert teacher.post('/api/team/member',json=payload).status_code==403
    assert teacher.post('/api/team/delegate',json={'user_id':4,'rooms':[2]}).status_code==403
    assert teacher.patch('/api/team/member/4',json={'password':PASSWORD+'new'}).status_code==403
    data=teacher.get('/api/team').json()
    assert data['candidates']==[]
    assert all('email' not in member for member in data['members'])

def test_monitor_membership_survives_room_edit():
    admin=client(1)
    uid=admin.post('/api/team/member',json={'name':'Scoped monitor','email':'monitor@example.test','password':PASSWORD,'staff_role':'monitor'}).json()['id']
    payload={'name':'Monitor room','min_age':2,'max_age':6,'capacity':10,'teacher_id':2,'monitor_id':uid}
    rid=admin.post('/api/rooms',json=payload).json()['id']
    with s.db() as c:
        assert c.execute('SELECT 1 FROM teacher_rooms WHERE user_id=? AND room_id=?',(uid,rid)).fetchone()
    assert admin.patch(f'/api/rooms/{rid}',json=payload).status_code==200
    with s.db() as c:
        assert c.execute('SELECT 1 FROM teacher_rooms WHERE user_id=? AND room_id=?',(uid,rid)).fetchone()

def test_teacher_cannot_transfer_classroom_using_teacher_field():
    teacher=client(2)
    assert teacher.patch('/api/rooms/1',json={'name':'Turma A','min_age':2,'max_age':6,'capacity':10,'teacher_id':1}).status_code==403

def test_team_change_revokes_sessions_and_preserves_family():
    admin=client(1);teacher=client(2)
    assert admin.patch('/api/team/member/2',json={'active':False}).status_code==200
    assert teacher.get('/api/me').status_code==401
    assert admin.post('/api/team/delegate',json={'user_id':3,'rooms':[1]}).status_code==409
    assert admin.patch('/api/team/member/1',json={'active':False}).status_code==409

def test_event_participants_are_scoped_and_age_checked():
    admin=client(1);teacher=client(2);parent=client(4)
    payload={'title':'Scope event','description':'Scope event description','category':'Kids','min_age':2,'max_age':6,'starts_at':'2026-11-20T10:00:00-03:00','ends_at':'2026-11-20T12:00:00-03:00','max_capacity':20}
    eid=admin.post('/api/events',json=payload).json()['id']
    assert parent.post(f'/api/events/{eid}/register',json={'child_id':2}).status_code==200
    assert teacher.get(f'/api/events/{eid}/participants').json()['participants']==[]
    assert teacher.delete(f'/api/events/{eid}/register/2').status_code==403
    assert teacher.post(f'/api/events/{eid}/participants',json={'child_id':2}).status_code==403
    with s.db() as c:c.execute('UPDATE children SET birthday=? WHERE id=1',('2010-01-01',))
    assert admin.post(f'/api/events/{eid}/participants',json={'child_id':1}).status_code==400

def test_media_requires_login_and_avatar_rejects_pdf():
    parent=client(3)
    assert parent.post('/api/avatar/upload',files={'file':('profile.pdf',b'%PDF-test','application/pdf')}).status_code==400
    assert TestClient(app).get('/api/media/unknown').status_code==401

def test_materials_reject_script_urls_and_unassigned_staff():
    admin=client(1)
    payload={'room_id':1,'title':'Aula','starts_at':'2026-11-22T10:00:00-03:00','ends_at':'2026-11-22T11:00:00-03:00','materials_url':'javascript:alert(1)'}
    assert admin.post('/api/lessons',json=payload).status_code==400
    payload['materials_url']='https://example.com/lesson.pdf';payload['teacher_id']=3
    assert admin.post('/api/lessons',json=payload).status_code==400

def test_push_failure_remains_pending_and_does_not_log_secrets(monkeypatch,capsys):
    from backend import push_worker
    from test_web_push import configure
    data=configure(monkeypatch);p=client(3)
    assert p.post('/api/web-push/subscribe',json=data).status_code==200
    assert p.post('/api/web-push/test').status_code==200
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    def failed(*args):raise RuntimeError('private-subscription-token')
    monkeypatch.setattr(push_worker.web_push,'send',failed)
    assert push_worker.deliver_batch()['sent']==0
    with s.db() as c:
        row=c.execute('SELECT status,attempts,delivered_at FROM outbox').fetchone()
        assert row['status']=='pending' and row['attempts']==1 and row['delivered_at'] is None
    assert 'private-subscription-token' not in capsys.readouterr().out

def test_urgent_web_push_contains_no_child_or_pickup_data(monkeypatch):
    import json
    from test_web_push import configure
    from backend import web_push_transport
    import pywebpush
    configure(monkeypatch)
    t=client(2)
    t.post('/api/paging',json={'child_id':1,'reason':'Private health detail'})
    with s.db() as c:nid=c.execute("SELECT id FROM notifications WHERE kind='urgent_call'").fetchone()[0]
    captured={}
    def fake(**kwargs):captured.update(kwargs)
    monkeypatch.setattr(pywebpush,'webpush',fake)
    assert web_push_transport.send({'endpoint':'https://fcm.googleapis.com/fcm/send/test','keys_json':'{}'},nid)
    payload=json.loads(captured['data'])
    assert payload['urgent'] is True
    assert not any(key in payload for key in ('child_name','room_name','claim_code','reason','child_id'))
    assert 'Private health detail' not in captured['data']

def test_team_admin_creation_and_phone_update_are_honest():
    admin=client(1)
    r=admin.post('/api/team/member',json={'name':'New coordinator','email':'coordinator@example.test','password':PASSWORD,'staff_role':'admin'})
    assert r.status_code==200
    uid=r.json()['id']
    assert admin.patch(f'/api/team/member/{uid}',json={'phone':'31999990000'}).status_code==200
    with s.db() as c:
        row=c.execute('SELECT role,phone FROM users WHERE id=?',(uid,)).fetchone()
        assert row['role']=='admin' and row['phone']=='31999990000'

def test_pdf_material_upload_save_and_authenticated_download():
    admin=client(1);teacher=client(2)
    pdf=b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'
    r=teacher.post('/api/upload',files={'file':('licao.pdf',pdf,'application/pdf')})
    assert r.status_code==200
    url=r.json()['url']
    payload={'room_id':1,'title':'Aula com material','starts_at':'2026-11-25T10:00:00-03:00','ends_at':'2026-11-25T11:00:00-03:00','materials_url':url}
    lesson=teacher.post('/api/lessons',json=payload)
    assert lesson.status_code==200
    saved=next(l for l in client(3).get('/api/lessons').json() if l['id']==lesson.json()['id'])
    assert saved['materials_url']==url
    download=client(3).get(url)
    assert download.status_code==200 and download.content==pdf
    assert download.headers['content-type']=='application/pdf'
    assert TestClient(app).get(url).status_code==401
    assert client(3).post('/api/upload',files={'file':('licao.pdf',pdf,'application/pdf')}).status_code==403
