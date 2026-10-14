from test_app import records,client
from datetime import datetime,timedelta
from zoneinfo import ZoneInfo

def event_data():
    start=datetime.now(ZoneInfo('America/Sao_Paulo'))+timedelta(days=3)
    return dict(title='Evento teste',description='Descrição do evento',category='Kids',min_age=2,max_age=10,starts_at=start.isoformat(),ends_at=(start+timedelta(hours=1)).isoformat(),max_capacity=2)

def test_recovery_never_returns_token_without_email(monkeypatch):
    monkeypatch.delenv('SMTP_HOST',raising=False)
    r=client(4).post('/api/auth/recovery',json={'email':'user1@example.test','allow_direct_fallback':True})
    assert r.status_code==503
    assert 'reset_token' not in r.json()

def test_paging_family_and_teacher_scope():
    teacher=client(2)
    r=teacher.post('/api/paging',json={'child_id':1})
    assert r.status_code==200
    assert r.json()['claim_code'].startswith('CH-')
    assert client(4).get('/api/paging/active').json()==[]
    assert len(client(3).get('/api/paging/active').json())==1
    assert teacher.post('/api/paging',json={'child_id':2}).status_code==403
    assert teacher.post('/api/paging',json={'child_id':1}).json()['id']==r.json()['id']

def test_guest_checkout_scope_confirmation_and_retry():
    a=client();teacher=client(2)
    data=dict(child_name='Visitante',child_age=5,guardian_name='Responsável',guardian_phone='31999999999',room_id=2)
    g=a.post('/api/guests/checkin',json=data).json()
    assert teacher.get('/api/guests/active').json()==[]
    url=f'/api/guests/{g["id"]}/checkout'
    assert teacher.post(url,json={'claim_code':g['claim_code'],'guardian_confirmed':True}).status_code==403
    assert a.post(url,json={'claim_code':g['claim_code']}).status_code==400
    assert a.post(url,json={'claim_code':'WRONG','guardian_confirmed':True}).status_code==400
    payload={'claim_code':g['claim_code'],'guardian_confirmed':True}
    assert a.post(url,json=payload).status_code==200
    assert a.post(url,json=payload).status_code==200
    assert a.get('/api/guests/active').json()==[]

def test_event_validation_capacity_and_idempotence():
    a=client();data=event_data()
    assert a.post('/api/events',json=data|{'starts_at':'invalid date'}).status_code==422
    eid=a.post('/api/events',json=data).json()['id']
    p=client(3);first=p.post(f'/api/events/{eid}/register',json={'child_id':1}).json()
    assert p.post(f'/api/events/{eid}/register',json={'child_id':1}).json()['id']==first['id']
    assert client(4).post(f'/api/events/{eid}/register',json={'child_id':2}).status_code==200
    assert a.patch(f'/api/events/{eid}',json=data|{'max_capacity':1}).status_code==409

def test_stale_room_edits_conflict():
    a=client();teacher=client(2)
    old=next(r for r in teacher.get('/api/rooms').json() if r['id']==1)
    assert a.patch('/api/rooms/1',json=old|{'name':'Atualizada','owner_id':2}).status_code==200
    assert teacher.patch('/api/rooms/1',json=old|{'name':'Antiga'}).status_code==409

def test_snapshot_is_scoped():
    p=client(3).get('/api/snapshot')
    assert p.status_code==200
    assert [c['id'] for c in p.json()['children']]==[1]
    assert p.json()['activeGuests']==[]
