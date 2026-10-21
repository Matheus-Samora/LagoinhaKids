from io import BytesIO
from uuid import uuid4
from PIL import Image
from test_app import records, client
from test_basic_sectors import grant, person, account
from backend import store as s


def photo():
    out=BytesIO();Image.new('RGB',(48,32),'gold').save(out,format='PNG');return out.getvalue()


def test_profile_atomic_save_photo_and_fresh_session_without_kids(records):
    grant(3,'finance','viewer')
    with s.db() as db:db.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
    c=client(3)
    assert c.get('/api/children').status_code==403
    assert c.get('/api/me/profile').json()['user']['profile_version']==1
    response=c.post('/api/me/profile',data={'version':'1','name':'Perfil atualizado','phone':'31999999999'},files={'photo':('foto.png',photo(),'image/png')})
    assert response.status_code==200,response.text
    user=response.json()['user'];assert user['name']=='Perfil atualizado' and user['profile_version']==2
    assert c.get(user['avatar_url']).headers['content-type']=='image/webp'
    fresh=client(3).get('/api/me/profile').json()['user']
    assert fresh==user and fresh['phone']=='31999999999'
    with s.db() as db:assert db.execute('SELECT count(*) FROM media').fetchone()[0]==1
    stale=c.post('/api/me/profile',data={'version':'1','name':'Conflito'},files={'photo':('foto.png',photo(),'image/png')})
    assert stale.status_code==409
    with s.db() as db:assert db.execute('SELECT count(*) FROM media').fetchone()[0]==1
    assert c.get('/api/me/profile').json()['user']==fresh
    assert c.patch('/api/me/profile',json={'version':2,'avatar_url':''}).status_code==200
    assert client(3).get('/api/me/profile').json()['user']['avatar_url']==''


def test_profile_invalid_photo_validation_and_no_privilege_changes(records):
    c=client(3)
    for data in (b'not an image',b'%PDF-1.4'):
        r=c.post('/api/me/profile',data={'version':'1','name':'Unsaved name'},files={'photo':('bad.png',data,'image/png')})
        assert r.status_code==400,r.text
    assert c.post('/api/me/profile',data={'version':0,'name':'x'}).status_code==422
    assert c.patch('/api/me/profile',json={'version':1,'name':'Test','role':'admin'}).status_code==422
    assert c.get('/api/me/profile').json()['user']['name']=='User 3'
    with s.db() as db:assert db.execute('SELECT count(*) FROM media').fetchone()[0]==0
    c.headers.pop('X-CSRF-Token')
    assert c.patch('/api/me/profile',json={'version':1,'name':'Test'}).status_code==403


def test_shared_avatar_does_not_expose_unrelated_media(records):
    admin=client(1);c=client(3)
    private=admin.post('/api/upload',files={'file':('document.pdf',b'%PDF-1.4','application/pdf')}).json()
    uploaded=admin.post('/api/avatar/upload',files={'file':('photo.png',photo(),'image/png')}).json()
    with s.db() as db:db.execute("UPDATE module_access SET enabled=0 WHERE user_id=3 AND module='kids'")
    assert c.get(private['url']).status_code==404
    assert c.get(uploaded['url']).status_code==404
    assert admin.patch('/api/me/profile',json={'version':1,'avatar_url':uploaded['url']}).status_code==200
    assert c.get(uploaded['url']).status_code==200
    assert c.patch('/api/me/profile',json={'version':1,'avatar_url':uploaded['url']}).status_code==400


def test_simplified_members_edit_preserves_hidden_fields_and_explicit_clear(records):
    c=client(1)
    payload={'name':'Cadastro anterior','joined_on':'2020-01-01','birthday':'1990-02-02','relationship':'Titular','phone':'123','address':'Endereco anterior','pastoral_notes':'Nota privada','marital_status':'Casado(a)'}
    pid=c.post('/api/members/people',json=payload).json()['id']
    grant(2,'members','editor');editor=client(2)
    r=editor.put('/api/members/people/'+pid,json={'version':1,'name':'Nome editado','phone':'456'})
    assert r.status_code==200,r.text
    actual=next(p for p in c.get('/api/members').json()['people'] if p['id']==pid)
    for key,value in payload.items():
        if key not in ('name','phone'):assert actual[key]==value
    assert c.put('/api/members/people/'+pid,json={'version':2,'name':'Nome editado','address':''}).status_code==200
    assert next(p for p in c.get('/api/members').json()['people'] if p['id']==pid)['address']==''


def test_simplified_finance_and_ministry_edits_preserve_values(records):
    c=client(1);aid=account(c);pid=person(c)
    r=c.put('/api/finance/accounts/'+aid,json={'version':1,'name':'Conta renomeada'})
    assert r.status_code==200,r.text
    assert c.get('/api/finance').json()['accounts'][0]['opening_cents']==10000
    assignment={'person_id':pid,'ministry':'Music','position':'Cantor','started_on':'2020-01-01','training_status':'in_training'}
    rid=c.post('/api/ministries/assignments',json=assignment)
    assert rid.status_code==200,rid.text
    rid=rid.json()['id']
    r=c.put('/api/ministries/assignments/'+rid,json={'version':1,'person_id':pid,'ministry':'Music','position':'Vocal'})
    assert r.status_code==200,r.text
    actual=c.get('/api/ministries').json()['assignments'][0]
    assert actual['started_on']=='2020-01-01' and actual['training_status']=='in_training'


def test_closing_optional_second_counter_idempotency_and_stale_edit_rollback(records):
    c=client(1);aid=account(c)
    body={'request_id':str(uuid4()),'account_id':aid,'service_name':'Culto teste','service_date':s.today(),'counted_by':'Conferente teste','tithes':'12,50'}
    first=c.post('/api/finance/closings',json=body);assert first.status_code==200,first.text
    assert c.post('/api/finance/closings',json=body).json()['id']==first.json()['id']
    rid=first.json()['id']
    edit={**body,'version':1,'tithes':'20,00'}
    assert c.put('/api/finance/closings/'+rid,json=edit).status_code==200
    assert c.put('/api/finance/closings/'+rid,json={**edit,'tithes':'99,00'}).status_code==409
    with s.db() as db:
        row=db.execute('SELECT * FROM finance_service_closings WHERE id=?',(rid,)).fetchone()
        assert row['total_cents']==2000 and row['verified_by']==''
        assert db.execute('SELECT amount_cents FROM finance_entries WHERE id=?',(row['entry_id'],)).fetchone()[0]==2000
        assert db.execute('SELECT count(*) FROM finance_entries').fetchone()[0]==1


def test_record_creator_is_not_automatically_the_persons_identity(records):
    c=client(1);person(c)
    assert c.get('/api/platform/my-data').json()['profile']==[]


def test_kids_edits_keep_photo_lesson_attachment_and_event_banner(records):
    from test_school import schedule
    c=client(1);parent=client(3)
    with s.db() as db:db.execute("UPDATE children SET avatar_url='https://example.test/foto.webp',allergies='Cuidado de teste' WHERE id=1")
    r=parent.patch('/api/children/1',json={'name':'Nome atualizado','birthday':'2021-01-01'})
    assert r.status_code==200,r.text
    actual=parent.get('/api/children').json()[0]
    assert actual['avatar_url']=='https://example.test/foto.webp' and actual['allergies']=='Cuidado de teste'
    data=schedule();data.update(materials_url='https://example.test/material.pdf',notes='Material a preservar')
    lid=c.post('/api/lessons',json=data).json()['id']
    edited={k:v for k,v in data.items() if k not in ('materials_url','notes')};edited['title']='Aula renomeada'
    r=c.patch('/api/lessons/'+str(lid),json=edited);assert r.status_code==200,r.text
    with s.db() as db:
        row=db.execute('SELECT * FROM lessons WHERE id=?',(lid,)).fetchone()
        assert row['materials_url']==data['materials_url'] and row['notes']==data['notes']
    event={'title':'Evento teste','description':'Descricao do evento','category':'Culto','starts_at':data['starts_at'],'ends_at':data['ends_at'],'banner_url':'https://example.test/banner.webp','max_capacity':40,'min_age':3,'max_age':10}
    response=c.post('/api/events',json=event);assert response.status_code==200,response.text
    eid=response.json()['id']
    r=c.patch('/api/events/'+str(eid),json={k:v for k,v in event.items() if k not in ('banner_url','max_capacity','min_age','max_age')})
    assert r.status_code==200,r.text
    with s.db() as db:
        row=db.execute('SELECT * FROM events WHERE id=?',(eid,)).fetchone()
        assert row['banner_url']==event['banner_url'] and row['max_capacity']==40 and row['min_age']==3


def test_ministry_resource_edit_keeps_hidden_category_and_link(records):
    c=client(1)
    data={'ministry':'Music','title':'Material teste','category':'documento','resource_url':'https://example.test/a.pdf','notes':'Orientacao de teste'}
    rid=c.post('/api/ministries/resources',json=data).json()['id']
    response=c.put('/api/ministries/resources/'+rid,json={'version':1,'ministry':'Music','title':'Novo titulo'})
    assert response.status_code==200,response.text
    with s.db() as db:
        row=db.execute('SELECT * FROM ministries_resources WHERE id=?',(rid,)).fetchone()
        assert row['category']=='documento' and row['resource_url']==data['resource_url']


def test_admin_profile_edit_invalidates_open_own_form(records):
    admin=client(1);user=client(3)
    response=admin.patch('/api/users/3',json={'active':True,'name':'Atualizado pela administracao'})
    assert response.status_code==200,response.text
    assert user.patch('/api/me/profile',json={'version':1,'name':'Versao antiga'}).status_code==409


def test_pending_registration_partial_edit_keeps_omitted_fields(records):
    user=client(3)
    first=user.post('/api/platform/my-registration',json={'name':'Perfil teste','phone':'123','birthday':'1990-02-02','address':'Endereco teste','family_name':'Familia teste'})
    assert first.status_code==200,first.text
    r=user.post('/api/platform/my-registration',json={'version':1,'name':'Novo nome'})
    assert r.status_code==200,r.text
    reg=user.get('/api/platform/my-data').json()['registrations'][0]
    assert reg['phone']=='123' and reg['birthday']=='1990-02-02' and reg['address']=='Endereco teste'


def test_identity_migration_only_links_an_approved_unambiguous_registration(records):
    user=client(3);admin=client(1)
    reg=user.post('/api/platform/my-registration',json={'name':'Identidade de teste','birthday':'1990-02-02'}).json()['id']
    approved=admin.post('/api/members/self-registrations/'+reg+'/approve').json()['person_id']
    unrelated=person(admin)
    with s.db() as db:
        db.execute('UPDATE members_people SET account_user_id=NULL WHERE id=?',(approved,))
        db.execute('UPDATE members_self_registrations SET person_id=NULL WHERE id=?',(reg,))
        db.execute("DELETE FROM platform_migrations WHERE name='personal_identity_v248'")
        from backend.modules.schema import migrate
        migrate(db)
        assert db.execute('SELECT account_user_id FROM members_people WHERE id=?',(approved,)).fetchone()[0]==3
        assert db.execute('SELECT account_user_id FROM members_people WHERE id=?',(unrelated,)).fetchone()[0] is None


def test_profile_serialization_reuses_transaction_connection(records,monkeypatch):
    from backend.profile import account
    with s.db() as db:
        user=dict(db.execute('SELECT * FROM users WHERE id=3').fetchone())
        def unexpected_connection():raise AssertionError('Profile must not acquire a second pool connection during its transaction')
        monkeypatch.setattr(s,'db',unexpected_connection)
        assert account(db,user)['id']==3
