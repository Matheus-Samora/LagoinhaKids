import asyncio
import json
import time
from test_app import records, client, PASSWORD
from test_basic_sectors import grant
from backend import store as s
from backend.app import COOKIE
from backend.realtime import broker, publish, RealtimeSubscriber


def test_realtime_status_and_auth(records):
    c = client(1)
    status_res = c.get('/api/realtime/status')
    assert status_res.status_code == 200
    data = status_res.json()
    assert data['status'] == 'ok'
    assert 'subscribers_count' in data
    assert 'mode' in data


def test_realtime_stream_unauthenticated(records):
    from starlette.testclient import TestClient
    from backend.app import app
    unauth = TestClient(app)
    res = unauth.get('/api/realtime/stream')
    assert res.status_code == 401


def test_realtime_stream_credentials_and_tickets(records):
    from starlette.testclient import TestClient
    from backend.app import app
    c = client(3)
    anonymous = TestClient(app)
    csrf = c.get('/api/me').json()['csrf']
    native = c.post('/api/auth/login', json={'email':'user3@example.test','password':PASSWORD},headers={'x-native-client':'1'}).json()['access_token']
    for secret in (csrf,native):
        assert anonymous.get('/api/realtime/stream',params={'token':secret,'once':1}).status_code == 401
    assert anonymous.get('/api/me',headers={'Authorization':'Bearer '+csrf}).status_code == 401
    assert anonymous.get('/api/me',headers={'Authorization':'Bearer '+native}).status_code == 200
    # An invalid Authorization header cannot bypass CSRF through cookie fallback.
    assert c.post('/api/realtime/ticket',headers={'Authorization':'Bearer invalid','X-CSRF-Token':''}).status_code in (401,403)
    assert anonymous.post('/api/realtime/ticket').status_code == 401
    c.headers['X-CSRF-Token']=c.get('/api/me').json()['csrf']
    ticket=c.post('/api/realtime/ticket').json()['ticket']
    assert anonymous.get('/api/me',params={'ticket':ticket}).status_code == 401
    before=len(broker.subscribers)
    result=anonymous.get('/api/realtime/stream',params={'ticket':ticket,'once':1})
    assert result.status_code == 200
    payload=json.loads(next(line[6:] for line in result.text.splitlines() if line.startswith('data: ')))
    assert payload['allowed_sectors'] == ['kids']
    assert len(broker.subscribers)==before
    sub=RealtimeSubscriber(3,set(payload['allowed_sectors']))
    broker._deliver_to_subscriber(sub,{'sector':'finance','data':{'private':True}})
    assert sub.queue.empty()
    # Even a legacy all marker cannot bypass sector authorization.
    sub.allowed_sectors.add('all')
    broker._deliver_to_subscriber(sub,{'sector':'members'})
    assert sub.queue.empty()
    c.post('/api/auth/logout')
    assert anonymous.get('/api/realtime/stream',params={'ticket':ticket,'once':1}).status_code == 401


def test_stream_ticket_expiry_tampering_and_revocation(records):
    from starlette.testclient import TestClient
    from backend.app import app
    from backend.realtime import stream_access
    c=client(3)
    anonymous=TestClient(app)
    with s.db() as db:
        hashed=s.digest(c.cookies.get(COOKIE))
        user=dict(db.execute('SELECT u.*,ss.token FROM users u JOIN sessions ss ON ss.user_id=u.id WHERE ss.token=?',(hashed,)).fetchone())
    def ticket(**values):
        return s.CIPHER.encrypt(json.dumps({'purpose':'realtime','session':hashed,'expires':int(time.time())+60,**values}).encode()).decode()
    for invalid in (ticket(expires=int(time.time())-1),ticket(purpose='other'),'invalid'):
        assert anonymous.get('/api/realtime/stream',params={'ticket':invalid,'once':1}).status_code==401
    assert stream_access(user)[0]=={'kids'}
    with s.db() as db:
        db.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
    assert stream_access(user)[0]==set()
    with s.db() as db:
        db.execute('UPDATE users SET active=0 WHERE id=3')
    assert stream_access(user) is None


def test_realtime_delivery_only_after_commit(records):
    sub=RealtimeSubscriber(3,{'members'})
    broker.register(sub)
    try:
        with s.db() as db:
            db.execute("UPDATE users SET name='Committed' WHERE id=3")
            publish('test:commit',{'ok':True},user_id=3)
            assert sub.queue.empty()
        assert sub.queue.get_nowait()['type']=='test:commit'
        try:
            with s.db() as db:
                db.execute("UPDATE users SET name='Rolled back' WHERE id=3")
                publish('test:rollback',{},user_id=3)
                raise ValueError('rollback')
        except ValueError:
            pass
        assert sub.queue.empty()
        with s.db() as db:
            assert db.execute('SELECT name FROM users WHERE id=3').fetchone()[0]=='Committed'
    finally:
        broker.unregister(sub)


def test_realtime_targeted_and_sector_events(records):
    # Register test subscribers directly on broker to verify dispatch logic
    sub1 = RealtimeSubscriber(user_id=1, allowed_sectors={'members', 'ministries'})
    sub2 = RealtimeSubscriber(user_id=2, allowed_sectors={'kids'})
    broker.register(sub1)
    broker.register(sub2)

    try:
        # 1. Targeted event for user 1
        broker.publish('test:user1_only', {'msg': 'secret'}, user_id=1)
        assert not sub1.queue.empty()
        evt1 = sub1.queue.get_nowait()
        assert evt1['type'] == 'test:user1_only'
        assert evt1['data']['msg'] == 'secret'
        assert sub2.queue.empty(), "User 2 should not have received user 1 targeted event"

        # 2. Sector event for 'members'
        broker.publish('hall:post', {'title': 'Novo post'}, sector='members')
        assert not sub1.queue.empty(), "User 1 has 'members' sector"
        evt_sector = sub1.queue.get_nowait()
        assert evt_sector['type'] == 'hall:post'
        assert sub2.queue.empty(), "User 2 does not have 'members' sector"

        # 3. Sector event for 'kids'
        broker.publish('kids:attendance', {'child': 'João'}, sector='kids')
        assert sub1.queue.empty(), "User 1 does not have 'kids' sector"
        assert not sub2.queue.empty(), "User 2 has 'kids' sector"
        evt_kids = sub2.queue.get_nowait()
        assert evt_kids['type'] == 'kids:attendance'

        # 4. Global broadcast 'all'
        broker.publish('announcement:new', {'title': 'Geral'}, sector='all')
        assert not sub1.queue.empty()
        assert not sub2.queue.empty()
    finally:
        broker.unregister(sub1)
        broker.unregister(sub2)


def test_hall_and_schedule_publish_realtime_events(records):
    admin = client(1)
    member = client(3)
    grant(3, 'members', 'viewer')

    # Listen for events on user 3
    sub3 = RealtimeSubscriber(user_id=3, allowed_sectors={'members', 'ministries'})
    broker.register(sub3)

    try:
        # Create a hall post as admin
        post_res = admin.post('/api/platform/hall/posts', json={
            'request_id': '11111111-2222-3333-4444-555555555555',
            'kind': 'testimony',
            'content': 'Testemunho abençoado de tempo real!'
        })
        assert post_res.status_code == 200

        # Sub3 receives hall:post event
        found_post = False
        while not sub3.queue.empty():
            evt = sub3.queue.get_nowait()
            if evt['type'] == 'hall:post' and evt['data'].get('action') == 'created':
                found_post = True
                assert evt['data']['post_id'] == post_res.json()['id']
                assert 'post' not in evt['data']
        assert found_post, "Realtime hall:post event was not received"

        # React to post -> hall:reaction event
        react_res = member.put('/api/platform/hall/posts/11111111-2222-3333-4444-555555555555/reaction', json={'active': True})
        assert react_res.status_code == 200

        found_reaction = False
        while not sub3.queue.empty():
            evt = sub3.queue.get_nowait()
            if evt['type'] == 'hall:reaction':
                found_reaction = True
                assert evt['data']['post_id'] == '11111111-2222-3333-4444-555555555555'
                assert evt['data']['reactions'] == 1
        assert found_reaction, "Realtime hall:reaction event was not received"

        # Member replies to post (author is admin) -> hall:comment event is published
        comment_res = member.post('/api/platform/hall/posts/11111111-2222-3333-4444-555555555555/comments', json={
            'request_id': '99999999-8888-7777-6666-555555555555',
            'content': 'Amém, glorificado seja Deus!'
        })
        assert comment_res.status_code == 200

        found_comment = False
        while not sub3.queue.empty():
            evt = sub3.queue.get_nowait()
            if evt['type'] == 'hall:comment':
                found_comment = True
                assert evt['data']['comment_id'] == comment_res.json()['id']
                assert 'comment' not in evt['data']
        assert found_comment, "Realtime hall:comment event was not received"

    finally:
        broker.unregister(sub3)


def test_ministry_schedule_realtime_events(records):
    admin = client(1)
    member = client(3)
    grant(3, 'ministries', 'viewer')

    # Create person linked to user 3
    with s.db() as c:
        p = c.execute("SELECT id FROM members_people WHERE account_user_id=3").fetchone()
        if not p:
            c.execute("INSERT INTO members_people(id, name, email, account_user_id, active, version, created_at) VALUES('p-rt-3', 'Voluntário RT', 'user3@example.test', 3, 1, 1, ?)", (s.now(),))
            pid = 'p-rt-3'
        else:
            pid = p['id']

    sub3 = RealtimeSubscriber(user_id=3, allowed_sectors={'ministries'})
    broker.register(sub3)

    try:
        # Admin creates schedule
        sch = admin.post('/api/ministries/schedules', json={
            'title': 'Culto Especial RT',
            'ministry': 'Music',
            'person_id': pid,
            'role_notes': 'Teclado',
            'service_date': '2026-12-01',
            'service_time': '19:00',
            'status': 'confirmed'
        })
        assert sch.status_code == 200
        sid = sch.json()['id']

        # Verify sub3 received ministries:schedule and ministries:my_schedule
        types_received = set()
        while not sub3.queue.empty():
            types_received.add(sub3.queue.get_nowait()['type'])
        assert 'ministries:schedule' in types_received
        assert 'ministries:my_schedule' in types_received

        # Member responds to schedule
        resp = member.post(f'/api/ministries/schedules/{sid}/respond', json={
            'status': 'declined',
            'reason': 'Viagem a trabalho'
        })
        assert resp.status_code == 200

        # Verify response event received
        types_after_resp = set()
        while not sub3.queue.empty():
            types_after_resp.add(sub3.queue.get_nowait()['type'])
        assert 'ministries:schedule' in types_after_resp
    finally:
        broker.unregister(sub3)


def test_announcements_and_notification_read_events(records):
    admin = client(1)
    member = client(3)
    grant(3, 'members', 'viewer')

    sub3 = RealtimeSubscriber(user_id=3, allowed_sectors={'members', 'all'})
    broker.register(sub3)

    try:
        # Admin creates announcement
        ann = admin.post('/api/platform/announcements', json={
            'title': 'Retiro Espiritual 2026',
            'message': 'Inscrições abertas para todos os membros.',
            'target_scope': 'sector',
            'sector': 'members',
            'audience': 'sector'
        })
        assert ann.status_code == 200
        aid = ann.json()['id']

        events = []
        while not sub3.queue.empty():
            events.append(sub3.queue.get_nowait())

        # Sub3 received announcement:new and notification:new
        ev_types = [e['type'] for e in events]
        assert 'announcement:new' in ev_types
        assert 'notification:new' in ev_types

        # Member reads all notifications
        read_res = member.post('/api/notification-center/read-all')
        assert read_res.status_code == 200

        # Sub3 receives notification:count with unread_count=0
        count_events = []
        while not sub3.queue.empty():
            evt = sub3.queue.get_nowait()
            if evt['type'] == 'notification:count':
                count_events.append(evt)
        assert len(count_events) >= 1
        assert count_events[-1]['data']['unread_count'] == 0

        # Admin archives announcement -> announcement:archived
        del_ann = admin.delete(f'/api/platform/announcements/{aid}')
        assert del_ann.status_code == 200

        archived_events = []
        while not sub3.queue.empty():
            evt = sub3.queue.get_nowait()
            if evt['type'] == 'announcement:archived':
                archived_events.append(evt)
        assert len(archived_events) >= 1
        assert archived_events[-1]['data']['id'] == aid
    finally:
        broker.unregister(sub3)


def test_directed_announcements_do_not_broadcast_to_other_members(records):
    admin=client(1)
    subscribers=[RealtimeSubscriber(uid,{'kids'}) for uid in (3,4)]
    for sub in subscribers:broker.register(sub)
    try:
        result=admin.post('/api/platform/announcements',json={
            'title':'Aviso reservado','message':'Conteúdo somente para destinatário',
            'target_sector':'kids','audience':'people','recipient_ids':[3]})
        assert result.status_code==200
        events=[]
        while not subscribers[0].queue.empty():events.append(subscribers[0].queue.get_nowait())
        assert any(e['type']=='announcement:new' for e in events)
        assert subscribers[1].queue.empty()
    finally:
        for sub in subscribers:broker.unregister(sub)


def test_single_notification_read_updates_all_clients_and_checks_owner(records):
    parent=client(3)
    sub=RealtimeSubscriber(3,{'kids'})
    broker.register(sub)
    try:
        for prefix in ('/api/notification-center','/api/notifications','/api/platform/notifications'):
            with s.db() as db:
                nid=db.execute("INSERT INTO notifications(user_id,kind,title,message,created_at) VALUES(3,'attendance','Aviso','Mensagem',?)",(s.now(),)).lastrowid
            assert parent.post(f'{prefix}/{nid}/read').status_code==200
            event=sub.queue.get_nowait()
            assert event['type']=='notification:count'
            assert event['data']['unread_count']==0
            assert client(4).post(f'{prefix}/{nid}/read').status_code==404
            assert sub.queue.empty()
    finally:
        broker.unregister(sub)
