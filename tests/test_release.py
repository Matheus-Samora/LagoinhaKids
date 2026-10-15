from datetime import datetime,timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlparse,parse_qs
import os,subprocess,sys
from test_app import records,client,PASSWORD
from fastapi.testclient import TestClient
from backend.app import app
from backend import store as s
from backend.features import reset,Reset

def lesson(c,capacity=1,repeat=1):
    c.patch('/api/rooms/1',json={'name':'Turma A','min_age':2,'max_age':6,'capacity':capacity})
    start=(datetime.now(ZoneInfo('America/Sao_Paulo'))+timedelta(days=2)).replace(hour=10,minute=0,second=0,microsecond=0)
    return c.post('/api/lessons',json={'room_id':1,'starts_at':start.isoformat(),'ends_at':(start+timedelta(hours=1)).isoformat(),'repeat_weeks':repeat})

def test_checkout_requires_code_and_never_discloses_expected():
    t=client(2);payload={'action':'in','guardian_id':3,'guardian_confirmed':True}
    claim=t.post('/api/children/1/attendance',json=payload).json()['claim_code']
    payload['action']='out'
    for value in [None,'','WRNG']:
        r=t.post('/api/children/1/attendance',json=payload|{'claim_code':value})
        assert r.status_code==403 and claim not in r.text
    assert t.post('/api/children/1/attendance',json=payload|{'claim_code':claim}).status_code==200
    history=client(3).get('/api/children/1/history').json()
    assert [r['action'] for r in history]==['out','in']
    assert client(4).get('/api/children/1/history').status_code==403

def test_checkout_exception_only_admin_with_audited_reason():
    t=client(2);a=client();p={'action':'in','guardian_id':3,'guardian_confirmed':True}
    t.post('/api/children/1/attendance',json=p)
    p|={'action':'out','exception_reason':'Conferência presencial com documento e coordenação.'}
    assert t.post('/api/children/1/attendance',json=p).status_code==403
    assert a.post('/api/children/1/attendance',json=p).status_code==200
    with s.db() as c:assert c.execute('SELECT exception_reason FROM attendance_events WHERE action="out"').fetchone()[0]==p['exception_reason']

def test_terms_explicit_and_capabilities_honest(monkeypatch):
    c=TestClient(app);data={'name':'Teste','email':'new@example.test','password':PASSWORD}
    assert c.post('/api/auth/register',json=data).status_code==400
    assert c.post('/api/auth/register',json=data|{'terms_accepted':True,'terms_version':'2026.1'}).status_code==200
    monkeypatch.delenv('GOOGLE_APPLICATION_CREDENTIALS',raising=False)
    monkeypatch.delenv('SMTP_HOST',raising=False)
    assert not c.get('/api/health').json()['push_enabled']
    assert c.post('/api/auth/recovery',json={'email':data['email']}).status_code==503

def test_family_invitation_bound_to_email_revocable():
    p=client(3);other=client(4)
    r=p.post('/api/children/1/family/invites',json={'email':'user4@example.test'})
    token=parse_qs(urlparse(r.json()['url']).query)['invite'][0]
    assert p.post('/api/family/accept',json={'token':token}).status_code==403
    assert other.post('/api/family/accept',json={'token':token}).status_code==200
    assert 1 in [ch['id'] for ch in other.get('/api/children').json()]
    assert other.patch('/api/children/1',json={'name':'Tentativa','birthday':'2021-01-01'}).status_code==403
    assert other.post('/api/children/1/consent',json={'allowed':True}).status_code==403
    assert other.delete('/api/children/1').status_code==403
    assert other.post('/api/family/accept',json={'token':token}).status_code==403
    assert p.delete('/api/children/1/family/4').status_code==200
    assert other.get('/api/children/1/history').status_code==403

def test_weekly_schedule_and_queue_promotes_only_one():
    t=client(2);p=client(3);other=client(4)
    r=lesson(t,repeat=4);assert r.status_code==200,r.text
    assert len(r.json()['ids'])==4
    lid=r.json()['id']
    assert p.post(f'/api/lessons/{lid}/presence',json={'child_id':1}).status_code==200
    assert other.post(f'/api/lessons/{lid}/waitlist',json={'child_id':2}).status_code==200
    assert other.get('/api/lessons').json()[0]['waiting_children']==[2]
    assert p.delete(f'/api/lessons/{lid}/presence/1').status_code==200
    assert other.get('/api/lessons').json()[0]['confirmed_children']==[2]
    assert other.get('/api/notifications').json()[0]['title']=='Vaga confirmada na aulinha'
    with s.db() as c:assert c.execute('SELECT count(*) FROM reservations WHERE lesson_id=? AND confirmed=1',(lid,)).fetchone()[0]==1

def test_push_outbox_created_and_no_cross_user_tokens():
    t=client(2);p=client(3)
    t.post('/api/children/1/notify',json={'kind':'please_pickup'})
    with s.db() as c:assert c.execute('SELECT count(*) FROM outbox WHERE status="pending"').fetchone()[0]==1
    assert p.post('/api/devices/token',json={'token':'x'*32,'platform':'android'}).status_code==200
    p.post('/api/auth/logout')
    with s.db() as c:assert c.execute('SELECT count(*) FROM device_tokens').fetchone()[0]==0

def test_reset_one_use_revokes_sessions():
    p=client(3)
    with s.db() as c:c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest('test-token'),3,'reset',9999999999))
    anon=TestClient(app)
    assert anon.post('/api/auth/reset',json={'token':'test-token','password':PASSWORD+'new'}).status_code==200
    assert p.get('/api/me').status_code==401
    assert anon.post('/api/auth/reset',json={'token':'test-token','password':PASSWORD+'new'}).status_code==400

def test_origin_prefix_and_other_tunnels_rejected():
    c=TestClient(app)
    for origin in ['http://localhost.evil.test','https://evil.trycloudflare.com']:
        assert c.post('/api/auth/login',headers={'Origin':origin},json={'email':'user3@example.test','password':PASSWORD}).status_code==403

def test_clean_install_and_second_seed_preserves(tmp_path):
    env=os.environ|{'KIDS_DATA_DIR':str(tmp_path)}
    for _ in range(2):
        r=subprocess.run([sys.executable,'-m','backend.seed'],env=env,capture_output=True,text=True)
        assert r.returncode==0,r.stderr
def test_mfa_enrollment_login_and_recovery_codes():
    from backend.security import totp
    a=client()
    setup=a.post('/api/auth/mfa/setup',json={'password':PASSWORD}).json()
    r=a.post('/api/auth/mfa/confirm',json={'password':PASSWORD,'secret':setup['enrollment'],'code':totp(setup['secret'])})
    assert r.status_code==200,r.text
    c=TestClient(app)
    data={'email':'user1@example.test','password':PASSWORD}
    assert c.post('/api/auth/login',json=data).json()['detail']['code']=='mfa'
    assert c.post('/api/auth/login',json=data|{'otp':totp(setup['secret'])}).status_code==200
    recovery=r.json()['recovery_codes'][0]
    assert c.post('/api/auth/login',json=data|{'otp':recovery}).status_code==200
    assert c.post('/api/auth/login',json=data|{'otp':recovery}).status_code==401

def test_backup_restore_integrity(tmp_path):
    if os.getenv('KIDS_DATABASE_URL'):
        import pytest
        pytest.skip('SQLite physical backup; PostgreSQL backups are managed by Cloud SQL.')
    from backend.manage import backup
    import sqlite3
    target=backup(tmp_path/'copy.sqlite3')
    with sqlite3.connect(target) as c:
        assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert c.execute('SELECT count(*) FROM users').fetchone()[0]==4

def test_sync_revision_changes_after_notice_and_read():
    p=client(3);t=client(2)
    old=p.get('/api/sync').json()['revision']
    t.post('/api/children/1/notify',json={'kind':'please_pickup'})
    new=p.get('/api/sync').json()['revision'];assert old!=new
    nid=p.get('/api/notifications').json()[0]['id']
    p.post(f'/api/notifications/{nid}/read')
    assert p.get('/api/sync').json()['revision']!=new

def test_health_patch_preserves_existing_fields():
    p=client(3)
    p.patch('/api/children/1',json={'name':'Aluno fictício A','birthday':'2021-01-01','allergies':'Amendoim'})
    p.patch('/api/children/1',json={'name':'Atualizado','birthday':'2021-01-01'})
    assert p.get('/api/children').json()[0]['allergies']=='Amendoim'

def test_push_worker_unconfigured_no_false_delivery(monkeypatch):
    from backend.push_worker import deliver_batch
    monkeypatch.delenv('GOOGLE_APPLICATION_CREDENTIALS',raising=False)
    monkeypatch.delenv('KIDS_APNS_KEY_PATH',raising=False)
    assert deliver_batch()=={'configured':False,'sent':0}
def test_fcm_sender_redacts_child_data_and_records_provider_acceptance(monkeypatch,tmp_path):
    import json
    from backend import push_worker
    path=tmp_path/'firebase.json';path.write_text(json.dumps({'project_id':'isolated-test','private_key':'fake-test-key'}))
    monkeypatch.setenv('GOOGLE_APPLICATION_CREDENTIALS',str(path));monkeypatch.setenv('KIDS_FIREBASE_PROJECT_ID','isolated-test')
    class Credentials:
        token='test-access';project_id='isolated-test'
        def refresh(self,_):pass
    monkeypatch.setattr(push_worker.service_account.Credentials,'from_service_account_file',lambda *a,**k:Credentials())
    messages=[]
    import httpx
    def post(url,**kwargs):
        messages.append(kwargs['json']);return httpx.Response(200,request=httpx.Request('POST',url))
    monkeypatch.setattr(push_worker.httpx,'post',post)
    p=client(3);t=client(2)
    p.post('/api/devices/token',json={'token':'x'*32,'platform':'android'})
    t.post('/api/children/1/notify',json={'kind':'please_pickup','message':'Informação privada da criança'})
    assert push_worker.deliver_batch()['sent']==1
    assert 'Informação privada' not in json.dumps(messages)
    with s.db() as c:assert c.execute('SELECT status FROM outbox').fetchone()[0]=='sent'

def test_email_verification_token_single_use():
    with s.db() as c:c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest('verify-test'),3,'verify',9999999999))
    c=TestClient(app)
    assert c.post('/api/auth/email/verify',json={'token':'verify-test'}).status_code==200
    assert c.post('/api/auth/email/verify',json={'token':'verify-test'}).status_code==400
    assert client(3).get('/api/me').json()['user']['email_verified']

def test_shared_family_receives_notice_without_leaking_to_unrelated():
    with s.db() as c:c.execute('INSERT INTO family_links VALUES(1,4,1,1)')
    client(2).post('/api/children/1/notify',json={'kind':'please_pickup'})
    assert len(client(3).get('/api/notifications').json())==1
    assert len(client(4).get('/api/notifications').json())==1

def test_checkout_attempt_limit():
    t=client(2);data={'action':'in','guardian_id':3,'guardian_confirmed':True}
    t.post('/api/children/1/attendance',json=data)
    data['action']='out'
    for _ in range(6):assert t.post('/api/children/1/attendance',json=data).status_code==403
    assert t.post('/api/children/1/attendance',json=data).status_code==429

def test_logout_keeps_other_device_notifications():
    one=client(3);two=client(3)
    one.post('/api/devices/token',json={'token':'device-one-'+'x'*24,'platform':'android'})
    two.post('/api/devices/token',json={'token':'device-two-'+'x'*24,'platform':'android'})
    one.post('/api/auth/logout')
    with s.db() as c:
        tokens=[r['token'] for r in c.execute('SELECT token FROM device_tokens')]
        assert tokens==['device-two-'+'x'*24]
    assert two.get('/api/me').status_code==200
