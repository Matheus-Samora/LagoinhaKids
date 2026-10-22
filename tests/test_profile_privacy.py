from uuid import uuid4
from test_app import records,client
from test_basic_sectors import grant
from backend import store as s
from backend.privacy import hide_emails


def member(admin,uid,name):
    result=admin.post('/api/members/people',json={'name':name,'request_id':str(uuid4()),'email':f'user{uid}@example.test','phone':'31912345678','birthday':'1990-02-03','address':'Endereço privado','pastoral_notes':'Nota privada','profession':'Professor','account_user_id':uid})
    assert result.status_code==200,result.text
    return result.json()['id']


def test_member_profiles_are_private_outside_hall_and_own_profile_stays_visible(records):
    admin=client(1)
    rid=member(admin,4,'Pessoa cadastrada')
    mine=member(admin,3,'Meu cadastro')
    grant(3,'members','editor')
    c=client(3)
    payload=c.get('/api/members').json()
    other=next(p for p in payload['people'] if p['id']==rid)
    own=next(p for p in payload['people'] if p['id']==mine)
    assert other['profile_restricted'] is True
    for field in ('email','phone','birthday','address','profession','bio','avatar_url','pastoral_notes'):
        assert field not in other
    assert own['email']=='user3@example.test'
    assert own['phone']=='31912345678'
    hall=c.get('/api/platform/hall/members').json()['members']
    public=next(p for p in hall if p['id']==rid)
    assert public['profession']=='Professor'
    assert not {'email','phone','birthday','address','pastoral_notes'} & public.keys()
    assert c.get('/api/me/profile').json()['user']['email']=='user3@example.test'
    for body in ({'version':1,'name':'Alteração','email':''},{'version':1,'name':'Alteração','account_user_id':3}):
        assert c.put('/api/members/people/'+rid,json=body).status_code==403
    # A sector leader can still correct an operational name without clearing hidden fields.
    assert c.put('/api/members/people/'+rid,json={'version':1,'name':'Nome corrigido'}).status_code==200
    current=next(p for p in admin.get('/api/members').json()['people'] if p['id']==rid)
    assert current['email']=='user4@example.test' and current['phone']=='31912345678'


def test_admin_and_pastor_keep_contact_access_but_sector_admin_does_not(records):
    admin=client(1);rid=member(admin,4,'Contato protegido')
    grant(3,'members','admin')
    restricted=next(p for p in client(3).get('/api/members').json()['people'] if p['id']==rid)
    assert 'email' not in restricted
    with s.db() as db:db.execute('INSERT INTO pastoral_users(user_id) VALUES(2)')
    pastor=next(p for p in client(2).get('/api/members').json()['people'] if p['id']==rid)
    assert pastor['email']=='user4@example.test'


def test_teacher_responses_and_notification_text_do_not_disclose_other_emails(records):
    teacher=client(2)
    children=teacher.get('/api/children')
    assert children.status_code==200
    assert 'user3@example.test' not in children.text
    with s.db() as db:
        nid=db.execute("INSERT INTO notifications(user_id,kind,title,message,created_at) VALUES(2,'sector_application','Inscrição','Contato user4@example.test',?)",(s.now(),)).lastrowid
    message=teacher.get('/api/notification-center/'+str(nid))
    assert message.status_code==200
    assert 'user4@example.test' not in message.text
    admin=client(1)
    assert 'user3@example.test' in admin.get('/api/children').text


def test_email_redaction_nested_payloads_and_hall_bio(records):
    assert hide_emails({'email':'other@example.test','parent_email':'other@example.test','nested':[{'email':'own@example.test','message':'other@example.test'}]},'own@example.test')=={'nested':[{'email':'own@example.test','message':'[e-mail protegido]'}]}
    admin=client(1);member(admin,4,'Bio pública')
    with s.db() as db:db.execute("UPDATE members_people SET bio='Escreva para user4@example.test' WHERE account_user_id=4")
    for reader in (admin,):
        response=reader.get('/api/platform/hall/members')
        assert response.status_code==200 and 'user4@example.test' not in response.text



def test_sse_notification_redacts_other_email_for_non_admin(records):
    import asyncio,json
    from backend.app import COOKIE
    from backend.realtime import realtime_stream,broker
    c=client(3)
    with s.db() as db:
        user=dict(db.execute('SELECT u.*,ss.token FROM users u JOIN sessions ss ON ss.user_id=u.id WHERE ss.token=?',(s.digest(c.cookies.get(COOKIE)),)).fetchone())
    class Connected:
        async def is_disconnected(self):return False
    async def check():
        response=await realtime_stream(Connected(),user=user)
        stream=response.body_iterator
        try:
            assert 'event: connected' in await anext(stream)
            subscriber=next(sub for sub in broker.subscribers.values() if sub.user_id==3)
            subscriber.queue.put_nowait({'id':'private-test','type':'notification:new','user_id':3,'data':{'message':'Outra conta user4@example.test'}})
            notification=await anext(stream)
            assert 'user4@example.test' not in notification
            assert '[e-mail protegido]' in notification
        finally:
            await stream.aclose()
    asyncio.run(check())
