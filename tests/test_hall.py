from uuid import uuid4
from test_app import records,client
from test_basic_sectors import grant,person
from backend import store as s
from backend.notification_policy import metadata

def publish(c,content='Uma mensagem de gratidao',**extra):
    body={'request_id':str(uuid4()),'content':content,'kind':'testimony',**extra}
    response=c.post('/api/platform/hall/posts',json=body)
    assert response.status_code==200,response.text
    return response.json()['id'],body

def test_hall_permissions_and_directory_privacy(records):
    a=client(1);u=client(3)
    assert u.get('/api/platform/hall/posts').status_code==403
    grant(3,'members','viewer')
    pid=person(a)
    with s.db() as c:c.execute("UPDATE members_people SET phone='31999999999',email='private@example.test',address='private address',pastoral_notes='private notes' WHERE id=?",(pid,))
    result=u.get('/api/platform/hall/members').json()
    assert result['total']==1
    for key in ('phone','email','birthday','address','pastoral_notes','marital_status','joined_on'):assert key not in result['members'][0]
    legacy=u.get('/api/members/hall').json()
    assert 'email' not in legacy['members'][0]
    assert u.get('/api/platform/hall/reports').status_code==403
    u.headers.pop('X-CSRF-Token')
    assert u.post('/api/platform/hall/posts',json={'request_id':str(uuid4()),'content':'Test'}).status_code==403

def test_publication_idempotency_versions_and_author_permissions(records):
    grant(3,'members','viewer');grant(4,'members','viewer')
    c=client(3);other=client(4);a=client(1)
    rid,body=publish(c)
    assert c.post('/api/platform/hall/posts',json=body).json()['id']==rid
    assert len(c.get('/api/platform/hall/posts').json()['items'])==1
    edit={'version':1,'content':'Mensagem atualizada','kind':'general'}
    assert other.patch('/api/platform/hall/posts/'+rid,json=edit).status_code==403
    assert c.patch('/api/platform/hall/posts/'+rid,json=edit).status_code==200
    assert c.patch('/api/platform/hall/posts/'+rid,json=edit).status_code==409
    assert other.delete('/api/platform/hall/posts/'+rid+'?version=2').status_code==403
    assert a.delete('/api/platform/hall/posts/'+rid+'?version=1').status_code==409
    assert a.delete('/api/platform/hall/posts/'+rid+'?version=2').status_code==200
    assert c.get('/api/platform/hall/posts/'+rid).status_code==404
    with s.db() as db:assert db.execute('SELECT active,content FROM hall_posts WHERE id=?',(rid,)).fetchone()['content']=='Mensagem atualizada'

def test_reactions_comments_and_private_context_notification(records):
    grant(3,'members','viewer');grant(4,'members','viewer')
    author=client(3);u=client(4);rid,_=publish(author)
    for _ in range(2):assert u.put('/api/platform/hall/posts/'+rid+'/reaction',json={'active':True}).json()['reactions']==1
    assert u.put('/api/platform/hall/posts/'+rid+'/reaction',json={'active':False}).json()['reactions']==0
    comment={'request_id':str(uuid4()),'content':'Que bom caminhar juntos!'}
    first=u.post('/api/platform/hall/posts/'+rid+'/comments',json=comment);assert first.status_code==200,first.text
    cid=first.json()['id']
    assert u.post('/api/platform/hall/posts/'+rid+'/comments',json=comment).json()['id']==cid
    assert author.get('/api/platform/hall/posts/'+rid).json()['comments']==1
    notices=author.get('/api/notification-center').json()['items']
    assert len(notices)==1 and notices[0]['url']=='/membro#hall/'+rid
    assert 'Que bom' not in notices[0]['message']
    assert not u.get('/api/notification-center').json()['items']
    assert author.delete('/api/platform/hall/comments/'+cid).status_code==403
    assert u.delete('/api/platform/hall/comments/'+cid).status_code==200
    assert author.get('/api/platform/hall/posts/'+rid+'/comments').json()['items']==[]

def test_reporting_deduplication_moderation_and_revoked_access(records):
    grant(3,'members','viewer');grant(4,'members','viewer')
    u=client(3);other=client(4);a=client(1);rid,_=publish(u)
    for _ in range(2):assert other.post('/api/platform/hall/posts/'+rid+'/report',json={'reason':'privacy'}).status_code==200
    assert len(a.get('/api/platform/hall/reports').json()['items'])==1
    assert other.post('/api/platform/hall/posts/'+rid+'/resolve-reports').status_code==403
    assert a.post('/api/platform/hall/posts/'+rid+'/resolve-reports').status_code==200
    assert not a.get('/api/platform/hall/reports').json()['items']
    with s.db() as db:db.execute("UPDATE module_access SET enabled=0 WHERE user_id=4 AND module='members'")
    assert other.get('/api/platform/hall/posts/'+rid).status_code==403
    assert other.post('/api/platform/hall/posts/'+rid+'/comments',json={'request_id':str(uuid4()),'content':'Denied'}).status_code==403

def test_feed_limits_pagination_and_whitespace_validation(records):
    a=client(1)
    for i in range(5):publish(a,'Publicacao de teste '+str(i))
    assert a.post('/api/platform/hall/posts',json={'request_id':str(uuid4()),'content':'Another post'}).status_code==429
    assert a.post('/api/platform/hall/posts',json={'request_id':str(uuid4()),'content':'   '}).status_code==400
    assert a.get('/api/platform/hall/posts?kind=unknown').status_code==400
    assert a.get('/api/platform/hall/posts?page=0').status_code==422
    rid=a.get('/api/platform/hall/posts').json()['items'][0]['id']
    assert a.post('/api/platform/hall/posts/'+rid+'/comments',json={'request_id':str(uuid4()),'content':'   '}).status_code==400
    assert metadata({'kind':'hall_reply','context_id':rid})['url']=='/membro#hall/'+rid


def test_feed_pagination_and_notification_links_preserve_context(records):
    a=client(1)
    with s.db() as db:
        for i in range(27):db.execute('INSERT INTO hall_posts(id,author_id,kind,content,created_at,updated_at) VALUES(?,1,?,?,?,?)',(str(uuid4()),'prayer' if i<7 else 'general','Teste de paginacao '+str(i),s.now(),s.now()))
    first=a.get('/api/platform/hall/posts').json();second=a.get('/api/platform/hall/posts?page=2').json()
    assert len(first['items'])==20 and first['has_more']
    assert len(second['items'])==7 and not second['has_more']
    assert not {p['id'] for p in first['items']} & {p['id'] for p in second['items']}
    assert len(a.get('/api/platform/hall/posts?kind=prayer').json()['items'])==7
    assert a.get('/api/platform/hall/summary').json()['latest_id']==first['items'][0]['id']
    from backend.notification_policy import notification_url
    assert notification_url(42,{'url':'/membro#hall/example'})=='/membro?notice=42#hall/example'
    assert notification_url(42,{'url':'/kids#events'})=='/kids?notice=42#events'
