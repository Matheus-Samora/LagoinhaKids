from test_app import records,client
from test_basic_sectors import grant
from backend import store as s


def test_personal_notice_only_selected_receives_and_reads(records):
    admin=client(1);selected=client(3);other=client(4)
    result=admin.post('/api/platform/announcements',json={'title':'Aviso privado','message':'Conteúdo reservado','target_sector':'kids','audience':'people','recipient_ids':[3,3]})
    assert result.status_code==200,result.text
    aid=result.json()['id']
    assert result.json()['recipient_count']==1
    assert any(a['id']==aid for a in selected.get('/api/platform/announcements').json())
    assert not any(a['id']==aid for a in other.get('/api/platform/announcements').json())
    with s.db() as c:
        recipients=[r['user_id'] for r in c.execute("SELECT user_id FROM notifications WHERE kind='announcement'")]
        assert recipients==[3]
        assert c.execute('SELECT count(*) n FROM outbox').fetchone()['n']==1


def test_leader_audience_and_forbidden_cross_sector(records):
    admin=client(1);grant(2,'members','editor');grant(3,'members','viewer')
    leader=client(2)
    assert leader.get('/api/platform/announcement-recipients?sector=finance').status_code==403
    response=leader.post('/api/platform/announcements',json={'title':'Para líderes','message':'Reunião da equipe','target_sector':'members','audience':'leaders'})
    assert response.status_code==200,response.text
    aid=response.json()['id']
    assert not any(a['id']==aid for a in client(3).get('/api/platform/announcements').json())
    bad=leader.post('/api/platform/announcements',json={'title':'Invasão','message':'Sem permissão','target_sector':'members','audience':'people','recipient_ids':[4]})
    assert bad.status_code==403
    assert admin.post('/api/platform/announcements',json={'title':'Sem alvo','message':'Mensagem','audience':'people'}).status_code==400


def test_scoped_leader_cannot_target_other_ministry(records):
    admin=client(1);grant(2,'ministries','editor');grant(3,'ministries','viewer');grant(4,'ministries','viewer')
    with s.db() as c:
        for uid,scope in [(2,'Music'),(3,'Music'),(4,'Hero')]:
            c.execute("INSERT INTO module_scopes(user_id,module,scope) VALUES(?,'ministries',?)",(uid,scope))
    leader=client(2)
    ids={p['id'] for p in leader.get('/api/platform/announcement-recipients?sector=ministries').json()}
    assert 3 in ids and 4 not in ids
    assert leader.post('/api/platform/announcements',json={'title':'Aviso','message':'Somente Music','target_sector':'ministries','audience':'people','recipient_ids':[4]}).status_code==403

def test_sector_push_does_not_require_kids_access(records,monkeypatch):
    from backend import push_worker
    from test_web_push import configure
    subscription=configure(monkeypatch)
    recipient=client(3)
    assert recipient.post('/api/web-push/subscribe',json=subscription).status_code==200
    grant(3,'finance','viewer')
    with s.db() as c:c.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
    result=client(1).post('/api/platform/announcements',json={'title':'Aviso financeiro','message':'Confira no aplicativo','target_sector':'finance','audience':'people','recipient_ids':[3]})
    assert result.status_code==200,result.text
    delivered=[]
    monkeypatch.setattr(push_worker,'fcm_ready',lambda:False)
    monkeypatch.setattr(push_worker,'apns_ready',lambda:False)
    monkeypatch.setattr(push_worker.web_push,'send',lambda subscription,nid:delivered.append(nid) or True)
    assert push_worker.deliver_batch()['sent']==1
    assert push_worker.deliver_batch()['sent']==0
    assert len(delivered)==1
