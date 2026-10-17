import time
from fastapi.testclient import TestClient
from test_app import app,records,client,PASSWORD,s
from backend import features


def ready(monkeypatch):
    monkeypatch.setenv('SMTP_HOST','smtp.example.test')
    monkeypatch.setenv('SMTP_FROM','sender@example.test')


def test_recovery_private_rate_limit_and_token_lifecycle(monkeypatch):
    ready(monkeypatch)
    sent=[]
    monkeypatch.setattr(features,'send_mail',lambda *args:sent.append(args))
    c=TestClient(app)
    previous=client(3)
    response=c.post('/api/auth/recovery',json={'email':'user3@example.test'})
    assert response.status_code==200 and 'token' not in response.text
    assert len(sent)==1 and sent[0][0]=='user3@example.test'
    token=sent[0][2].split('#reset=')[1].split()[0]
    with s.db() as db:
        assert db.execute('SELECT token FROM auth_tokens').fetchone()['token']==s.digest(token)
    unknown=c.post('/api/auth/recovery',json={'email':'unknown@example.test'})
    assert unknown.json()==response.json() and len(sent)==1
    assert c.post('/api/auth/reset',json={'token':token,'password':'short'}).status_code==400
    for _ in range(7):c.post('/api/auth/recovery',json={'email':'user3@example.test'})
    assert len(sent)==5
    assert c.post('/api/auth/reset',json={'token':token,'password':PASSWORD+'new'}).status_code==400
    token=sent[-1][2].split('#reset=')[1].split()[0]
    assert c.post('/api/auth/reset',json={'token':token,'password':PASSWORD+'new'}).status_code==200
    assert previous.get('/api/me').status_code==401
    assert c.post('/api/auth/reset',json={'token':token,'password':PASSWORD+'new'}).status_code==400
    assert c.post('/api/auth/login',json={'email':'user3@example.test','password':PASSWORD+'new'}).status_code==200


def test_expired_reset_and_delivery_failure_do_not_leak(monkeypatch,caplog):
    ready(monkeypatch)
    with s.db() as db:
        db.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest('expired'),3,'reset',int(time.time())-1))
    c=TestClient(app)
    assert c.post('/api/auth/reset',json={'token':'expired','password':PASSWORD+'new'}).status_code==400
    def broken(*args):raise RuntimeError('sensitive-token-and-recipient')
    monkeypatch.setattr(features,'send_mail',broken)
    assert c.post('/api/auth/recovery',json={'email':'user3@example.test'}).status_code==200
    assert 'password_recovery_delivery_failed' in caplog.text
    assert 'sensitive-token-and-recipient' not in caplog.text
