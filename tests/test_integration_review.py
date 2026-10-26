from test_app import records,client
from test_saving_profiles import photo
from backend import store as s


def test_profile_does_not_disclose_or_claim_unverified_legacy_identity(records):
    with s.db() as c:
        c.execute("INSERT INTO members_people(id,name,email,address,active,version,created_at) VALUES('legacy','Cadastro legado','user3@example.test','Endereco reservado',1,1,?)",(s.now(),))
    u=client(3)
    assert u.get('/api/me/profile').json()['user']['address']==''
    r=u.patch('/api/me/profile',json={'version':1,'name':'Minha conta'})
    assert r.status_code==409,r.text
    with s.db() as c:
        assert c.execute('SELECT profile_version FROM users WHERE id=3').fetchone()[0]==1
        assert c.execute("SELECT account_user_id FROM members_people WHERE id='legacy'").fetchone()[0] is None
        c.execute('UPDATE users SET email_verified=1 WHERE id=3')
    assert u.patch('/api/me/profile',json={'version':1,'name':'Minha conta'}).status_code==200
    with s.db() as c:assert c.execute("SELECT account_user_id FROM members_people WHERE id='legacy'").fetchone()[0]==3


def test_profile_explicit_identity_precedes_same_email_legacy(records):
    with s.db() as c:
        for rid,owner,address in [('a-other',None,'Privado de outro cadastro'),('z-mine',3,'Meu endereco')]:
            c.execute('INSERT INTO members_people(id,name,email,address,account_user_id,active,version,created_at) VALUES(?,?,?,?,?,1,1,?)',(rid,rid,'user3@example.test',address,owner,s.now()))
    u=client(3)
    assert u.get('/api/me/profile').json()['user']['address']=='Meu endereco'
    assert u.patch('/api/me/profile',json={'version':1,'name':'Nome atualizado'}).status_code==200
    with s.db() as c:assert c.execute("SELECT name FROM members_people WHERE id='a-other'").fetchone()[0]=='a-other'


def test_profile_family_is_not_joined_by_name_or_foreign_id(records):
    a=client(1);u=client(3)
    fid=a.post('/api/members/families',json={'name':'Mesmo nome'}).json()['id']
    assert u.get('/api/me/profile').json()['families']==[]
    assert u.patch('/api/me/profile',json={'version':1,'family_id':fid}).status_code==403
    r=u.patch('/api/me/profile',json={'version':1,'new_family_name':'Mesmo nome'})
    assert r.status_code==200,r.text
    mine=r.json()['user']['family_id'];assert mine!=fid
    with s.db() as c:assert c.execute('SELECT joined_on FROM members_families WHERE id=?',(mine,)).fetchone()[0] is None
    assert [x['id'] for x in u.get('/api/me/profile').json()['families']]==[mine]


def test_partial_photo_upload_preserves_profile_family_and_birthday(records):
    u=client(3)
    r=u.patch('/api/me/profile',json={'version':1,'birthday':'1990-02-03','bio':'Minha biografia','new_family_name':'Minha familia','public_bio':False})
    assert r.status_code==200,r.text
    fid=r.json()['user']['family_id']
    r=u.post('/api/me/profile',data={'version':2,'name':'Nome com foto'},files={'photo':('foto.png',photo(),'image/png')})
    assert r.status_code==200,r.text
    row=r.json()['user'];assert row['family_id']==fid and row['birthday']=='1990-02-03' and row['bio']=='Minha biografia' and row['public_bio'] is False


def test_legacy_schedule_visibility_response_and_notifications_require_verified_identity(records):
    from datetime import date,timedelta
    from test_basic_sectors import grant
    grant(3,'ministries','viewer');a=client(1);u=client(3)
    pid=a.post('/api/members/people',json={'name':'Pessoa legada','email':'user3@example.test'}).json()['id']
    body={'title':'Culto de teste','person_id':pid,'ministry':'Music','service_date':str(date.today()+timedelta(days=5)),'service_time':'10:00'}
    r=a.post('/api/ministries/schedules',json=body);assert r.status_code==200,r.text
    rid=r.json()['id']
    assert u.get('/api/ministries/my-schedules').json()['schedules']==[]
    assert u.post('/api/ministries/schedules/'+rid+'/respond',json={'status':'confirmed'}).status_code==403
    with s.db() as c:
        assert c.execute('SELECT count(*) FROM notifications WHERE user_id=3').fetchone()[0]==0
        c.execute('UPDATE users SET email_verified=1 WHERE id=3')
    assert len(u.get('/api/ministries/my-schedules').json()['schedules'])==1
    assert u.post('/api/ministries/schedules/'+rid+'/respond',json={'status':'confirmed'}).status_code==200
    version=next(x for x in a.get('/api/ministries').json()['schedules'] if x['id']==rid)['version']
    r=a.put('/api/ministries/schedules/'+rid,json={**body,'service_time':'11:00','status':'confirmed','version':version})
    assert r.status_code==200,r.text
    with s.db() as c:assert c.execute('SELECT count(*) FROM notifications WHERE user_id=3').fetchone()[0]==1


def test_ministry_push_does_not_require_kids_and_revalidates_destination(records,monkeypatch):
    from backend import push_worker
    from test_basic_sectors import grant
    import json
    grant(3,'ministries','viewer')
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    monkeypatch.setattr(push_worker.web_push,'ready',lambda:True)
    sent=[]
    monkeypatch.setattr(push_worker.web_push,'send',lambda subscription,nid:sent.append(nid) or True)
    with s.db() as c:
        c.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
        c.execute('INSERT INTO web_subscriptions(endpoint,user_id,keys_json,session_token,updated_at) VALUES(?,?,?,?,?)',('https://example.test/push',3,json.dumps({}),'isolated-test',s.now()))
        nid=c.execute('INSERT INTO notifications(user_id,kind,title,message,created_at,sector) VALUES(?,?,?,?,?,?)',(3,'ministry_schedule','Escala','Confira a escala',s.now(),'ministries')).lastrowid
        c.execute('UPDATE outbox SET next_attempt=0 WHERE notification_id=?',(nid,))
    assert push_worker.deliver_batch()['sent']==1 and sent==[nid]
    with s.db() as c:
        c.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='ministries'")
        nid2=c.execute('INSERT INTO notifications(user_id,kind,title,message,created_at,sector) VALUES(?,?,?,?,?,?)',(3,'ministry_schedule','Escala alterada','Confira a escala',s.now(),'ministries')).lastrowid
        c.execute('UPDATE outbox SET next_attempt=0 WHERE notification_id=?',(nid2,))
    assert push_worker.deliver_batch()['sent']==0 and sent==[nid]


def test_worker_defers_transient_failure_without_exposing_details(records,monkeypatch,caplog):
    from backend import push_worker
    def failed():raise RuntimeError('private connection credentials')
    monkeypatch.setattr(push_worker,'dispatch_operations',failed)
    monkeypatch.setattr(push_worker,'deliver_batch',failed)
    result=push_worker.run_cycle()
    assert result['retry'] and result['sent']==0
    assert 'private connection credentials' not in caplog.text
    monkeypatch.setattr(push_worker,'deliver_batch',lambda:{'configured':True,'sent':1})
    assert push_worker.run_cycle(False)['sent']==1


def test_database_connection_failure_returns_safe_recoverable_response(records,monkeypatch):
    from backend import profile
    from psycopg import OperationalError
    u=client(3)
    def fail_read(*args,**kwargs):raise OperationalError('private connection password and host')
    monkeypatch.setattr(profile,'account',fail_read)
    response=u.get('/api/me/profile')
    assert response.status_code==503 and response.json()['detail']['code']=='database_unavailable'
    assert 'private connection' not in response.text and response.headers['retry-after']=='3'
