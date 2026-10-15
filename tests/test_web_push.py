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
