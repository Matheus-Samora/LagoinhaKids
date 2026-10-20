import json
from datetime import datetime,timedelta,timezone
from test_app import records,client
from backend import store as s
from backend.notification_center import metadata,push_policy,DEFAULTS


def notice(uid=3,kind='announcement',created_at=None,read_at=None):
    with s.db() as c:
        return c.execute('INSERT INTO notifications(user_id,kind,title,message,created_at,read_at,sector) VALUES(?,?,?,?,?,?,?)',(uid,kind,'Teste privado','Conteúdo interno',created_at or s.now(),read_at,'finance' if kind=='announcement' else '')).lastrowid


def test_private_inbox_counts_pagination_and_read_state(records):
    own=[notice() for _ in range(35)];other=notice(4)
    user=client(3);first=user.get('/api/notification-center?limit=10').json()
    assert len(first['items'])==10 and first['unread_count']==35 and first['next_before']
    second=user.get('/api/notification-center?limit=10&before='+str(first['next_before'])).json()
    assert not {r['id'] for r in first['items']} & {r['id'] for r in second['items']}
    assert user.get('/api/notification-center/'+str(other)).status_code==404
    assert user.post('/api/notification-center/'+str(other)+'/read').status_code==404
    assert user.post('/api/notification-center/'+str(own[0])+'/read').status_code==200
    assert user.get('/api/notification-center').json()['unread_count']==34
    assert user.post('/api/notification-center/read-all').status_code==200
    assert user.get('/api/notification-center').json()['unread_count']==0
    assert client(4).get('/api/notification-center').json()['unread_count']==1


def test_preferences_are_private_validate_and_preserve_inbox(records):
    nid=notice();user=client(3)
    settings=user.get('/api/notification-center/preferences').json()['settings']
    assert settings['activity'] is False
    settings.update(push_enabled=False,quiet_enabled=True)
    assert user.put('/api/notification-center/preferences',json=settings).status_code==200
    assert client(4).get('/api/notification-center/preferences').json()['settings']['push_enabled'] is True
    with s.db() as c:
        row=dict(c.execute('SELECT * FROM notifications WHERE id=?',(nid,)).fetchone())
        assert push_policy(c,row)==(False,0,'user_preference')
    assert len(user.get('/api/notification-center').json()['items'])==1
    settings['quiet_start']='25:00'
    assert user.put('/api/notification-center/preferences',json=settings).status_code==422
    settings.update(quiet_start='07:00',quiet_end='07:00')
    assert user.put('/api/notification-center/preferences',json=settings).status_code==400


def test_quiet_hours_overnight_and_urgent_override(records):
    now=datetime(2026,10,20,2,0,tzinfo=timezone.utc) # 23h Brasília
    with s.db() as c:
        prefs={**DEFAULTS,'quiet_enabled':True}
        c.execute('INSERT INTO notification_preferences VALUES(?,?,?)',(3,json.dumps(prefs),s.now()))
        normal={'user_id':3,'kind':'announcement','created_at':now.isoformat()}
        send,delay,reason=push_policy(c,normal,now=now)
        assert not send and delay==8*3600 and reason=='quiet_hours'
        urgent={**normal,'kind':'please_pickup','child_id':1}
        assert push_policy(c,urgent,now=now)==(True,0,'ready')
        assert push_policy(c,normal,now=now+timedelta(hours=8))==(True,0,'ready')
        prefs['urgent']=False
        c.execute('UPDATE notification_preferences SET settings=? WHERE user_id=3',(json.dumps(prefs),))
        assert push_policy(c,urgent,now=now)==(False,0,'user_preference')


def test_expired_read_inactive_and_resolved_calls_are_suppressed(records):
    now=datetime.now(timezone.utc)
    with s.db() as c:
        row={'user_id':3,'kind':'please_pickup','child_id':1,'created_at':(now-timedelta(hours=1)).isoformat()}
        assert push_policy(c,row,now=now)[2]=='expired'
        row.update(created_at=now.isoformat(),read_at=s.now())
        assert push_policy(c,row,now=now)[2]=='already_read'
        row.update(kind='urgent_call',read_at=None)
        assert push_policy(c,row,now=now)[2]=='resolved_call'
        row['kind']='announcement';c.execute('UPDATE users SET active=0 WHERE id=3')
        assert push_policy(c,row,now=now)[2]=='inactive_user'


def test_filters_and_context_routes(records):
    notice(kind='announcement');notice(kind='attendance');notice(kind='sector_application')
    user=client(3)
    assert len(user.get('/api/notification-center?category=announcements').json()['items'])==1
    assert user.get('/api/notification-center?category=invalid').status_code==400
    assert metadata({'kind':'announcement','sector':'finance'})['url']=='/finance'
    assert metadata({'kind':'urgent_call','child_id':1})['priority']=='high'
    assert metadata({'kind':'attendance','child_id':1})['priority']=='low'


def test_partial_retry_does_not_resend_accepted_device(records,monkeypatch):
    from backend import push_worker
    nid=notice();delivered=[];fail=[True]
    with s.db() as c:
        for endpoint in ['first','second']:
            c.execute('INSERT INTO web_subscriptions(user_id,endpoint,keys_json,session_token,updated_at) VALUES(?,?,?,?,?)',(3,'https://fcm.googleapis.com/'+endpoint,'{}','test',s.now()))
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    monkeypatch.setattr(push_worker.web_push,'ready',lambda:True)
    def send(subscription,nid):
        endpoint=subscription['endpoint']
        if endpoint.endswith('second') and fail[0]:raise RuntimeError('Temporary provider error')
        delivered.append(endpoint);return True
    monkeypatch.setattr(push_worker.web_push,'send',send)
    assert push_worker.deliver_batch()['sent']==0
    fail[0]=False
    with s.db() as c:c.execute('UPDATE outbox SET next_attempt=0')
    assert push_worker.deliver_batch()['sent']==1
    assert len(delivered)==2 and len(set(delivered))==2
    assert push_worker.deliver_batch()['sent']==0


def test_worker_suppressed_preference_keeps_internal_notice(records,monkeypatch):
    from backend import push_worker
    nid=notice(kind='attendance')
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False);monkeypatch.setattr(push_worker,'apns_ready',lambda:False);monkeypatch.setattr(push_worker.web_push,'ready',lambda:True)
    monkeypatch.setattr(push_worker.web_push,'send',lambda *_:(_ for _ in ()).throw(AssertionError('Should not send')))
    assert push_worker.deliver_batch()['sent']==0
    with s.db() as c:
        assert c.execute('SELECT status FROM outbox WHERE notification_id=?',(nid,)).fetchone()['status']=='suppressed'
        assert c.execute('SELECT 1 FROM notifications WHERE id=?',(nid,)).fetchone()


def test_sector_broadcast_does_not_push_to_unsubscribed_global_overseers(records):
    from test_basic_sectors import grant
    grant(2,'finance','editor');grant(3,'finance','viewer')
    result=client(2).post('/api/platform/announcements',json={'title':'Rotina do setor','message':'Aviso financeiro','target_sector':'finance'})
    assert result.status_code==200,result.text
    with s.db() as c:
        ids={r['user_id'] for r in c.execute("SELECT user_id FROM notifications WHERE kind='announcement'")}
        assert ids=={3}
    # TI retains oversight of the underlying announcement without unsolicited push copies.
    assert any(a['id']==result.json()['id'] for a in client(1).get('/api/platform/announcements').json())


def test_urgent_push_is_processed_before_older_announcements(records,monkeypatch):
    from backend import push_worker
    older=notice();urgent=notice(kind='please_pickup');sent=[]
    with s.db() as c:c.execute('INSERT INTO web_subscriptions(user_id,endpoint,keys_json,session_token,updated_at) VALUES(?,?,?,?,?)',(3,'https://fcm.googleapis.com/priority','{}','test',s.now()))
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False);monkeypatch.setattr(push_worker,'apns_ready',lambda:False);monkeypatch.setattr(push_worker.web_push,'ready',lambda:True)
    monkeypatch.setattr(push_worker.web_push,'send',lambda subscription,nid:sent.append(nid) or True)
    assert push_worker.deliver_batch(limit=1)['sent']==1
    assert sent==[urgent]


def test_push_worker_starts_without_importing_http_application(tmp_path):
    import os,sys,subprocess
    env=dict(os.environ);env.pop('KIDS_DATABASE_URL',None);env['KIDS_DATA_DIR']=str(tmp_path)
    code="import sys; import backend.push_worker; from backend.notification_policy import push_policy; assert 'backend.app' not in sys.modules; print('independent-worker-ok')"
    result=subprocess.run([sys.executable,'-c',code],env=env,capture_output=True,text=True,timeout=30)
    assert result.returncode==0,result.stderr
    assert 'independent-worker-ok' in result.stdout
