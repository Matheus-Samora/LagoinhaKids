from datetime import date,timedelta
from uuid import uuid4
from test_app import records,client
from test_basic_sectors import person,grant
from backend import store as s
from backend.modules.common import decrypt_text


def test_reading_empty_catalog_does_not_create_groups(records):
    a=client(1)
    assert a.get('/api/members').status_code==200
    assert a.get('/api/platform/community').status_code==200
    with s.db() as c:assert c.execute('SELECT count(*) FROM members_cells').fetchone()[0]==0


def test_optional_catalog_seed_preserves_customized_archived_groups(records):
    from backend.modules.schema import ensure_official_gcs
    with s.db() as c:
        ensure_official_gcs(c)
        c.execute("UPDATE members_cells SET name='Nome escolhido',address='Local escolhido',active=0 WHERE id='gc-ide'")
        ensure_official_gcs(c)
        row=c.execute("SELECT * FROM members_cells WHERE id='gc-ide'").fetchone()
        assert row['name']=='Nome escolhido' and row['address']=='Local escolhido' and row['active']==0


def test_registration_completes_existing_identity_without_merging_family_names(records):
    grant(3,'members','viewer')
    a=client(1);u=client(3);pid=person(a)
    family=a.post('/api/members/families',json={'name':'Mesmo sobrenome'}).json()['id']
    with s.db() as c:
        c.execute("UPDATE members_people SET account_user_id=3,joined_on=NULL,pastoral_notes='Nota preservada',phone='' WHERE id=?",(pid,))
    submitted=u.post('/api/members/self-register',json={'name':'Cadastro completo','family_name':'Mesmo sobrenome','phone':'31999999999','address':'Local privado'})
    assert submitted.status_code==200,submitted.text
    rid=submitted.json()['id']
    result=a.post('/api/members/self-registrations/'+rid+'/approve')
    assert result.status_code==200,result.text
    assert result.json()['person_id']==pid and result.json()['family_id']!=family
    with s.db() as c:
        row=c.execute('SELECT * FROM members_people WHERE id=?',(pid,)).fetchone()
        assert row['joined_on'] is None and row['pastoral_notes']=='Nota preservada'
        assert row['phone']=='31999999999' and decrypt_text(row['address'])=='Local privado'
        assert row['address']!='Local privado'
        assert c.execute('SELECT count(*) FROM members_people WHERE account_user_id=3 AND active=1').fetchone()[0]==1
    assert a.delete('/api/members/self-registrations/'+rid).status_code==409
    assert a.delete('/api/members/self-registrations/absent').status_code==404


def test_lesson_monitor_can_be_explicitly_removed_and_stays_removed(records):
    a=client(1);future=str(date.today()+timedelta(days=5))
    with s.db() as c:c.execute('UPDATE rooms SET monitor_id=2 WHERE id=1')
    body={'room_id':1,'title':'Aula','starts_at':future+'T10:00:00','ends_at':future+'T11:00:00','teacher_id':1,'monitor_id':2}
    created=a.post('/api/lessons',json=body);assert created.status_code==200,created.text
    lid=created.json()['ids'][0]
    changed=a.patch('/api/lessons/'+str(lid),json={**body,'monitor_id':None});assert changed.status_code==200,changed.text
    row=next(x for x in a.get('/api/lessons').json() if x['id']==lid)
    assert row['monitor_id'] is None and row['monitor_name']==''


def test_rescheduling_rearms_reminder_but_notes_only_edit_does_not(records):
    a=client(1);pid=person(a);future=str(date.today()+timedelta(days=5))
    body={'title':'Culto','ministry':'Music','person_id':pid,'service_date':future,'service_time':'10:00','reminder_enabled':True}
    rid=a.post('/api/ministries/schedules',json=body).json()['id']
    with s.db() as c:c.execute('UPDATE ministries_schedules SET reminder_sent=1 WHERE id=?',(rid,))
    assert a.put('/api/ministries/schedules/'+rid,json={**body,'role_notes':'Somente instrução','version':1}).status_code==200
    with s.db() as c:assert c.execute('SELECT reminder_sent FROM ministries_schedules WHERE id=?',(rid,)).fetchone()[0]==1
    assert a.put('/api/ministries/schedules/'+rid,json={**body,'service_time':'12:00','version':2}).status_code==200
    with s.db() as c:assert c.execute('SELECT reminder_sent FROM ministries_schedules WHERE id=?',(rid,)).fetchone()[0]==0
    assert a.put('/api/ministries/schedules/'+rid,json={**body,'status':'declined','response_due_at':'inválido','version':3}).status_code==400


def test_application_review_is_idempotent_and_respects_final_state(records):
    a=client(1);u=client(3)
    rid=u.post('/api/platform/apply',json={'target_type':'ministry','target_name':'Music'}).json()['id']
    body={'stage':'conversation','note':'Agendar conversa','request_id':str(uuid4())}
    for _ in range(2):assert a.post('/api/workspace/applications/'+rid+'/review',json=body).status_code==200
    assert a.post('/api/workspace/applications/'+rid+'/review',json={**body,'note':'Outra nota'}).status_code==409
    assert a.post('/api/workspace/applications/'+rid+'/review',json={'stage':'withdrawn'}).status_code==409
    assert u.post('/api/workspace/applications/'+rid+'/review',json={'stage':'withdrawn'}).status_code==200
    assert a.post('/api/workspace/applications/'+rid+'/review',json={'stage':'ready'}).status_code==409
    with s.db() as c:assert c.execute('SELECT count(*) FROM workflow_reviews WHERE application_id=?',(rid,)).fetchone()[0]==2


def test_event_edit_preserves_eligibility_and_delete_respects_owner(records):
    a=client(1);future=str(date.today()+timedelta(days=5))
    body={'title':'Evento','description':'Descrição do evento','category':'Culto','starts_at':future+'T10:00:00','ends_at':future+'T11:00:00','min_age':0,'max_age':17}
    created=a.post('/api/events',json=body);assert created.status_code==200,created.text
    eid=created.json()['id']
    assert client(3).post('/api/events/'+str(eid)+'/register',json={'child_id':1}).status_code==200
    assert a.patch('/api/events/'+str(eid),json={**body,'min_age':16}).status_code==409
    assert client(2).delete('/api/events/'+str(eid)).status_code==403
    assert a.delete('/api/events/'+str(eid)).status_code==200


def test_group_leader_can_review_only_own_applications(records):
    a=client(1)
    groups=[a.post('/api/members/cells',json={'name':name}).json()['id'] for name in ('GC Um','GC Dois')]
    assert a.put('/api/workspace/groups/'+groups[0]+'/leaders',json={'user_id':3}).status_code==200
    u=client(4);leader=client(3)
    requests=[u.post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':name}).json()['id'] for gid,name in zip(groups,('GC Um','GC Dois'))]
    assert leader.post('/api/workspace/applications/'+requests[0]+'/review',json={'stage':'conversation'}).status_code==200
    assert leader.get('/api/workspace/applications/'+requests[0]+'/history').status_code==200
    assert leader.post('/api/workspace/applications/'+requests[1]+'/review',json={'stage':'conversation'}).status_code==403
    assert leader.get('/api/workspace/applications/'+requests[1]+'/history').status_code==403
