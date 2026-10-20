import base64,json
from test_app import client,records
from backend import store as s,web_push
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def configure(monkeypatch):
    key=ec.generate_private_key(ec.SECP256R1())
    monkeypatch.setenv('KIDS_WEB_PUSH_PRIVATE_KEY',key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()).decode())
    return {'endpoint':'https://fcm.googleapis.com/fcm/send/test-endpoint','keys':{'p256dh':base64.urlsafe_b64encode(b'\x04'+b'x'*64).rstrip(b'=').decode(),'auth':base64.urlsafe_b64encode(b'a'*16).rstrip(b'=').decode()}}

def test_subscriptions_private_and_logout_revokes(monkeypatch):
    data=configure(monkeypatch);p=client(3)
    assert p.get('/api/web-push/config').json()['enabled']
    assert p.post('/api/web-push/subscribe',json=data).status_code==200
    assert p.post('/api/web-push/test').status_code==200
    with s.db() as c:assert c.execute('SELECT count(*) FROM web_subscriptions WHERE user_id=3').fetchone()[0]==1
    assert p.post('/api/auth/logout').status_code==200
    with s.db() as c:assert c.execute('SELECT count(*) FROM web_subscriptions').fetchone()[0]==0

def test_subscriptions_reject_internal_hosts(monkeypatch):
    data=configure(monkeypatch);p=client(3)
    for url in ['http://127.0.0.1/','https://169.254.169.254/','https://fcm.googleapis.com.attacker.test/','https://attacker@fcm.googleapis.com/']:
        assert p.post('/api/web-push/subscribe',json=data|{'endpoint':url}).status_code==422

def test_acknowledgement_cannot_cross_families():
    teacher=client(2);p=teacher.post('/api/paging',json={'child_id':1}).json()
    assert client(4).post('/api/paging/on-my-way',json={'paging_id':p['id']}).status_code==403
    assert client(3).post('/api/paging/on-my-way',json={'paging_id':p['id']}).status_code==200
    assert client(3).post('/api/paging/on-my-way',json={}).status_code==200

def test_server_worker_delivers_once_per_queued_notice(monkeypatch):
    from backend import push_worker
    data=configure(monkeypatch);p=client(3)
    assert p.post('/api/web-push/subscribe',json=data).status_code==200
    assert p.post('/api/web-push/test').status_code==200
    delivered=[]
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    monkeypatch.setattr(push_worker.web_push,'send',lambda subscription,nid:delivered.append(nid) or True)
    assert push_worker.deliver_batch()['sent']==1
    assert push_worker.deliver_batch()['sent']==0
    assert len(delivered)==1

def test_calendar_export_scoped_and_utc():
    from datetime import datetime,timedelta
    from zoneinfo import ZoneInfo
    start=(datetime.now(ZoneInfo('America/Sao_Paulo'))+timedelta(days=2)).replace(hour=10,minute=0,second=0,microsecond=0)
    a=client();lid=a.post('/api/lessons',json={'room_id':2,'title':'Aula','starts_at':start.isoformat(),'ends_at':(start+timedelta(hours=1)).isoformat()}).json()['id']
    assert client(2).get(f'/api/lessons/{lid}/calendar.ics').status_code==403
    r=client(3).get(f'/api/lessons/{lid}/calendar.ics')
    assert r.status_code==200
    assert 'BEGIN:VCALENDAR' in r.text and 'T130000Z' in r.text
    assert 'example.test' not in r.text
    assert 'text/calendar' in r.headers['content-type']

def test_seed_disabled_by_default(monkeypatch):
    import pytest
    monkeypatch.delenv('KIDS_ALLOW_DEMO_SEED',raising=False)
    with pytest.raises(RuntimeError,match='Demonstration data disabled'):s.seed()
    with s.db() as c:assert c.execute('SELECT count(*) FROM users').fetchone()[0]==4

def test_real_web_push_encryption_without_network(monkeypatch):
    import requests,http_ece
    from backend import web_push_transport
    data=configure(monkeypatch)
    receiver=ec.generate_private_key(ec.SECP256R1())
    public=receiver.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    auth=b'a'*16
    data['keys']['p256dh']=base64.urlsafe_b64encode(public).rstrip(b'=').decode()
    captured={}
    def request(self,method,url,**kwargs):
        captured.update(kwargs)
        response=requests.Response();response.status_code=201;response._content=b'';return response
    monkeypatch.setattr(requests.sessions.Session,'request',request)
    with s.db() as c:c.execute('INSERT INTO notifications(id,user_id,kind,title,message,created_at,sector) VALUES(123,3,?,?,?,?,?)',('announcement','Aviso privado','Conteúdo que não deve aparecer no push',s.now(),'finance'))
    assert web_push_transport.send({'endpoint':data['endpoint'],'keys_json':json.dumps(data['keys'])},123)
    payload=http_ece.decrypt(captured['data'],private_key=receiver,auth_secret=auth,version='aes128gcm')
    decoded=json.loads(payload)
    assert decoded['id']==123 and decoded['url']=='/finance?notice=123'
    assert decoded['body']=='Há um novo comunicado para você.'
    assert 'privado' not in payload.decode() and 'Conteúdo' not in payload.decode()
    assert decoded['category']=='announcements'
    assert 'authorization' in {k.lower() for k in captured['headers']}

def test_push_test_throttled_without_duplicate_notice(monkeypatch):
    data=configure(monkeypatch);p=client(3)
    assert p.post('/api/web-push/subscribe',json=data).status_code==200
    assert p.post('/api/web-push/test').status_code==200
    assert p.post('/api/web-push/test').status_code==429
    with s.db() as c:assert c.execute('SELECT count(*) FROM outbox').fetchone()[0]==1

def test_subscription_count_is_bounded(monkeypatch):
    data=configure(monkeypatch);p=client(3)
    for index in range(10):assert p.post('/api/web-push/subscribe',json=data|{'endpoint':data['endpoint']+str(index)}).status_code==200
    assert p.post('/api/web-push/subscribe',json=data|{'endpoint':data['endpoint']+'extra'}).status_code==429
    assert p.post('/api/web-push/subscribe',json=data|{'endpoint':data['endpoint']+'0'}).status_code==200
