from datetime import date,timedelta
from uuid import uuid4
from fastapi.testclient import TestClient
from test_app import records,client,PASSWORD
from test_basic_sectors import grant,person,account
from backend import store as s
from backend.app import app


def test_invitation_activation_and_controlled_migration(records):
    admin=client(1)
    r=admin.post('/api/workspace/invitations',json={'name':'Nova pessoa','email':'new@example.test'})
    assert r.status_code==200,r.text
    token=r.json()['url'].split('reset=')[1]
    with s.db() as c:
        row=c.execute("SELECT * FROM users WHERE email='new@example.test'").fetchone()
        assert row['activation_required']==1
    anonymous=TestClient(app)
    assert anonymous.post('/api/auth/reset',json={'token':token,'password':PASSWORD+'new'}).status_code==200
    assert anonymous.post('/api/auth/reset',json={'token':token,'password':PASSWORD+'new'}).status_code==400
    assert anonymous.post('/api/auth/login',json={'email':'new@example.test','password':PASSWORD+'new'}).status_code==200
    old=client(3)
    preview=admin.post('/api/workspace/invitations/migrate',json={'user_id':3})
    assert preview.status_code==200 and preview.json()['requires_confirmation']
    assert old.get('/api/me').status_code==200
    r=admin.post('/api/workspace/invitations/migrate',json={'user_id':3,'confirm':True});assert r.status_code==200
    assert old.get('/api/me').status_code==401
    assert TestClient(app).post('/api/auth/login',json={'email':'user3@example.test','password':PASSWORD}).status_code==401
    assert admin.post('/api/workspace/invitations/migrate',json={'user_id':1,'confirm':True}).status_code==409


def test_operational_routes_deny_unrelated_users(records):
    c=client(3)
    for path in ('/api/workspace/integrity','/api/workspace/audit','/api/workspace/deliveries','/api/workspace/finance/operations','/api/workspace/journeys'):
        assert c.get(path).status_code==403,path
    assert c.get('/api/workspace/tasks').status_code==200
    assert c.get('/api/workspace/calendar').status_code==200
    assert c.get('/api/workspace/access-matrix').json()['platform_admin'] is False


def test_gc_leader_scope_and_meeting_idempotency(records):
    a=client(1);pid=person(a)
    gid=a.post('/api/members/cells',json={'name':'GC Teste'}).json()['id']
    gid2=a.post('/api/members/cells',json={'name':'GC Outro'}).json()['id']
    with s.db() as c:c.execute('UPDATE members_people SET cell_id=? WHERE id=?',(gid,pid))
    assert a.put('/api/workspace/groups/'+gid+'/leaders',json={'user_id':3}).status_code==200
    leader=client(3)
    assert leader.get('/api/workspace/groups/'+gid).status_code==200
    assert leader.get('/api/workspace/groups/'+gid2).status_code==403
    body={'request_id':str(uuid4()),'title':'Encontro','held_on':s.today(),'present_ids':[pid]}
    for _ in range(2):assert leader.post('/api/workspace/groups/'+gid+'/meetings',json=body).status_code==200
    assert leader.get('/api/workspace/groups/'+gid).json()['meetings'][0]['present_count']==1
    assert client(4).get('/api/workspace/groups/'+gid).status_code==403


def test_journey_history_tasks_and_completion(records):
    a=client(1);pid=person(a)
    r=a.post('/api/workspace/journeys',json={'request_id':str(uuid4()),'person_id':pid,'stage':'in_training','next_action':'Acolher família','responsible_id':3,'due_on':s.today()})
    assert r.status_code==200,r.text
    user=client(3);tasks=user.get('/api/workspace/tasks').json()['items']
    assert any(t['kind']=='journey' for t in tasks)
    assert client(4).post('/api/workspace/journeys/'+r.json()['id']+'/complete').status_code==403
    assert user.post('/api/workspace/journeys/'+r.json()['id']+'/complete').status_code==200
    assert not any(t['kind']=='journey' for t in user.get('/api/workspace/tasks').json()['items'])


def test_transfer_is_atomic_balanced_and_idempotent(records):
    a=client(1);one=account(a);two=account(a)
    body={'request_id':str(uuid4()),'source_id':one,'target_id':two,'amount':'25.50','occurred_on':s.today()}
    for _ in range(2):assert a.post('/api/workspace/finance/transfers',json=body).status_code==200
    snapshot=a.get('/api/finance').json();assert len(snapshot['entries'])==2
    balances={r['id']:r['balance_cents'] for r in snapshot['accounts']}
    assert balances[one]+balances[two]==20000
    bad={**body,'amount':'26.00'};assert a.post('/api/workspace/finance/transfers',json=bad).status_code==409


def test_recurrence_generates_pending_installment(records):
    a=client(1);aid=account(a)
    r=a.post('/api/workspace/finance/recurrences',json={'request_id':str(uuid4()),'account_id':aid,'direction':'expense','description':'Aluguel','amount':'100.00','next_on':s.today()})
    assert r.status_code==200,r.text
    assert a.post('/api/workspace/finance/recurrences/'+r.json()['id']+'/generate').status_code==200
    assert a.post('/api/workspace/finance/recurrences/'+r.json()['id']+'/generate').status_code==409
    entry=a.get('/api/finance').json()['entries'][0];assert entry['payment_status']=='pending'


def test_finance_approval_requires_distinct_author_and_preserves_versions(records):
    a=client(1);aid=account(a);grant(2,'finance','editor');editor=client(2)
    assert a.put('/api/workspace/finance/accounts/'+aid+'/approval',json={'required':True}).status_code==200
    body={'account_id':aid,'direction':'expense','description':'Compra','occurred_on':s.today(),'amount':'10.00','payment_status':'pending'}
    r=editor.post('/api/finance/entries',json=body);assert r.status_code==200,r.text;rid=r.json()['id']
    assert editor.post('/api/finance/entries/'+rid+'/settle').status_code==409
    assert editor.post('/api/workspace/finance/entries/'+rid+'/request-approval').status_code==200
    assert editor.post('/api/workspace/finance/entries/'+rid+'/approve',json={'approve':True,'reason':'Conferido'}).status_code==403
    r=a.post('/api/workspace/finance/entries/'+rid+'/approve',json={'approve':True,'reason':'Conferido'});assert r.status_code==200,r.text
    assert editor.post('/api/finance/entries/'+rid+'/settle').status_code==200


def test_statement_import_dedup_and_match_validation(records):
    a=client(1);aid=account(a)
    row={'occurred_on':s.today(),'amount':'-10.00','description':'Compra','reference':'bank-001'}
    for n in (1,0):
        r=a.post('/api/workspace/finance/statements',json={'account_id':aid,'rows':[row]});assert r.status_code==200,r.text;assert r.json()['added']==n
    rid=a.get('/api/workspace/finance/operations').json()['statements'][0]['id']
    entry=a.post('/api/finance/entries',json={'account_id':aid,'direction':'expense','description':'Compra','occurred_on':s.today(),'amount':'10.00'}).json()['id']
    assert a.put('/api/workspace/finance/statements/'+rid+'/match',json={'entry_id':entry}).status_code==200
    csv=('data;valor;descricao;referencia\n'+s.today()+';-10,00;Compra;bank-002').encode()
    r=a.post('/api/workspace/finance/statements/preview',files={'file':('extrato.csv',csv,'text/csv')});assert r.status_code==200,r.text
    assert r.json()['count']==1


def test_schedule_overlap_availability_and_history(records):
    a=client(1);pid=person(a);future=str(date.today()+timedelta(days=2))
    body={'title':'Culto','ministry':'Music','person_id':pid,'service_date':future,'service_time':'10:00','duration_minutes':120}
    first=a.post('/api/ministries/schedules',json=body);assert first.status_code==200,first.text
    assert a.post('/api/ministries/schedules',json={**body,'service_time':'11:00'}).status_code==409
    with s.db() as c:c.execute('UPDATE members_people SET account_user_id=3 WHERE id=?',(pid,))
    u=client(3)
    assert u.post('/api/workspace/availability',json={'starts_at':future+'T15:00','ends_at':future+'T17:00'}).status_code==200
    assert a.post('/api/ministries/schedules',json={**body,'service_time':'16:00'}).status_code==409
    rid=first.json()['id'];assert u.post('/api/ministries/schedules/'+rid+'/respond',json={'status':'declined','reason':'Indisponível'}).status_code==200
    assert u.get('/api/workspace/schedules/'+rid+'/history').json()[0]['status']=='declined'


def test_multi_ministry_scope_is_enforced_for_read_write_and_respond(records):
    a=client(1);pid=person(a)
    r=a.put('/api/platform/users/3/modules/ministries',json={'role':'editor','enabled':True,'scopes':['Music','Hero']});assert r.status_code==200,r.text
    u=client(3)
    for ministry in ('Music','Hero'):
        assert u.post('/api/ministries/assignments',json={'person_id':pid,'ministry':ministry}).status_code==200
    assert u.post('/api/ministries/assignments',json={'person_id':pid,'ministry':'Shine'}).status_code==403
    assert set(u.get('/api/ministries').json()['catalog'])=={'Music','Hero'}


def test_scheduled_announcements_expiry_and_read_confirmation(records):
    from backend.evolution import dispatch_due
    a=client(1);u=client(3)
    future=(__import__('datetime').datetime.fromisoformat(s.now())+timedelta(days=1)).isoformat()
    r=a.post('/api/platform/announcements',json={'title':'Futuro','message':'Comunicado','target_sector':'kids','publish_at':future,'require_ack':True});assert r.status_code==200,r.text
    rid=r.json()['id'];assert r.json()['scheduled'] is True
    assert not any(x['id']==rid for x in u.get('/api/platform/announcements').json())
    with s.db() as c:c.execute('UPDATE platform_announcements SET publish_at=? WHERE id=?',(s.now(),rid))
    dispatch_due();dispatch_due()
    assert any(x['id']==rid for x in u.get('/api/platform/announcements').json())
    assert u.post('/api/workspace/announcements/'+rid+'/acknowledge').status_code==200
    with s.db() as c:
        assert c.execute('SELECT count(*) FROM notifications WHERE user_id=3 AND context_id=?',(rid,)).fetchone()[0]==1


def test_pickup_authorizations_expiry_scope_and_tag_invalidation(records):
    a=client(1);parent=client(3)
    r=parent.post('/api/workspace/children/1/pickups',json={'name':'Avó autorizada','relationship':'Avó'});assert r.status_code==200,r.text
    assert client(4).get('/api/workspace/children/1/pickups').status_code==403
    assert client(2).post('/api/workspace/children/1/pickups',json={'name':'Outra pessoa'}).status_code==403
    entry=a.post('/api/children/1/attendance',json={'action':'in','guardian_id':3,'guardian_confirmed':True});assert entry.status_code==200
    code=entry.json()['claim_code']
    payload={'action':'out','guardian_id':3,'guardian_confirmed':True,'claim_code':code,'pickup_authorization_id':r.json()['id']}
    assert a.post('/api/children/1/attendance',json=payload).status_code==200
    assert a.post('/api/children/1/attendance',json=payload).status_code==409
    with s.db() as c:assert c.execute('SELECT claim_code FROM attendance WHERE child_id=1').fetchone()[0]==''


def test_privacy_opt_out_and_source_data_are_preserved(records):
    a=client(1);pid=person(a)
    with s.db() as c:c.execute("UPDATE members_people SET account_user_id=3,profession='Professor',bio='Minha bio' WHERE id=?",(pid,))
    u=client(3)
    r=u.patch('/api/me/profile',json={'version':1,'public_bio':False,'public_profession':False});assert r.status_code==200,r.text
    public=a.get('/api/platform/hall/members').json()['members'][0]
    assert public['bio']=='' and public['profession']==''
    with s.db() as c:assert c.execute('SELECT profession FROM members_people WHERE id=?',(pid,)).fetchone()[0]=='Professor'


def test_calendar_feed_and_financial_report_filters(records):
    a=client(1);aid=account(a)
    for amount in ('10.00','20.00'):
        a.post('/api/finance/entries',json={'account_id':aid,'direction':'income','description':'Entrada','occurred_on':s.today(),'amount':amount})
    a.post('/api/finance/entries',json={'account_id':aid,'direction':'expense','description':'Saída','occurred_on':s.today(),'amount':'5.00'})
    r=a.get('/api/finance/report?format=json&direction=income');assert r.status_code==200
    assert r.json()['totals']['income_cents']==3000 and r.json()['totals']['expense_cents']==0
    assert all(x['direction']=='income' for x in r.json()['entries'])
    assert all(x['expense_cents']==0 for x in r.json()['engine']['by_category'])
    feed=a.get('/api/workspace/calendar.ics');assert feed.status_code==200 and 'BEGIN:VCALENDAR' in feed.text

def test_transfer_legs_are_protected_and_cancel_together(records):
    a=client(1);one=account(a);two=account(a)
    body={'request_id':str(uuid4()),'source_id':one,'target_id':two,'amount':'30.00','occurred_on':s.today()}
    assert a.post('/api/workspace/finance/transfers',json=body).status_code==200
    rows=a.get('/api/finance').json()['entries']
    leg=rows[0]
    assert a.put('/api/finance/entries/'+leg['id'],json={'version':1,'account_id':leg['account_id'],'direction':leg['direction'],'occurred_on':leg['occurred_on'],'amount':'31.00','description':'Alteração isolada'}).status_code==409
    assert a.delete('/api/finance/entries/'+rows[0]['id']+'?version=1').status_code==409
    assert a.delete('/api/workspace/finance/transfers/'+body['request_id']).status_code==200
    assert a.delete('/api/workspace/finance/transfers/'+body['request_id']).status_code==200
    state=a.get('/api/finance').json();assert state['entries']==[] and all(x['balance_cents']==10000 for x in state['accounts'])
    assert a.post('/api/platform/records/finance/entries/'+rows[0]['id']+'/restore',json={'version':2}).status_code==409
    assert a.post('/api/workspace/finance/transfers/'+body['request_id']+'/restore').status_code==200
    assert len(a.get('/api/finance').json()['entries'])==2


def test_reviewed_merge_preserves_references_and_detects_conflicts(records):
    a=client(1);source=person(a);target=person(a)
    a.post('/api/ministries/assignments',json={'person_id':source,'ministry':'Music'})
    with s.db() as c:c.execute('UPDATE members_people SET account_user_id=3 WHERE id=?',(source,))
    body={'source_id':source,'target_id':target,'source_version':1,'target_version':1,'reason':'Duplicidade revisada pela equipe'}
    assert client(3).post('/api/workspace/people/merge',json=body).status_code==403
    assert a.post('/api/workspace/people/merge',json=body).json()['requires_confirmation']
    assert a.post('/api/workspace/people/merge',json={**body,'confirm':True}).status_code==200
    with s.db() as c:
        assert c.execute('SELECT active FROM members_people WHERE id=?',(source,)).fetchone()[0]==0
        assert c.execute('SELECT account_user_id FROM members_people WHERE id=?',(target,)).fetchone()[0]==3
        assert c.execute('SELECT person_id FROM ministries_assignments WHERE active=1').fetchone()[0]==target
        assert c.execute("SELECT count(*) FROM module_changes WHERE action='merge_reviewed'").fetchone()[0]==1


def test_material_upload_and_expiry_scope(records):
    from PIL import Image
    from io import BytesIO
    a=client(1);buf=BytesIO();Image.new('RGB',(5,5),'white').save(buf,format='PNG')
    r=a.post('/api/workspace/materials',data={'request_id':str(uuid4()),'title':'Material','ministry':'Music','category':'documento'},files={'file':('a.png',buf.getvalue(),'image/png')})
    assert r.status_code==200,r.text
    rid=r.json()['id'];assert a.get('/api/workspace/materials/'+rid+'/file').status_code==200
    assert client(3).get('/api/workspace/materials/'+rid+'/file').status_code==403
    grant(2,'ministries','editor')
    with s.db() as c:c.execute("INSERT INTO module_scopes VALUES(2,'ministries','Kids')")
    assert client(2).get('/api/workspace/materials/'+rid+'/file').status_code==403
    with s.db() as c:c.execute('UPDATE ministries_resources SET expires_on=? WHERE id=?',('2000-01-01',rid))
    assert a.get('/api/workspace/materials/'+rid+'/file').status_code==410


def test_team_invitation_rolls_back_invalid_room_and_missing_mail(records,monkeypatch):
    a=client(1)
    assert a.post('/api/workspace/team-invitations',json={'name':'Equipe','email':'team@example.test','staff_role':'teacher','rooms':[9999]}).status_code==400
    monkeypatch.setattr('backend.features.mail_ready',lambda:False)
    assert a.post('/api/workspace/invitations',json={'name':'Equipe','email':'team@example.test','send_email':True}).status_code==503
    with s.db() as c:assert not c.execute("SELECT 1 FROM users WHERE email='team@example.test'").fetchone()
    r=a.post('/api/workspace/team-invitations',json={'name':'Equipe','email':'team@example.test','staff_role':'teacher','rooms':[1]});assert r.status_code==200,r.text
    with s.db() as c:
        assert c.execute('SELECT activation_required FROM users WHERE id=?',(r.json()['id'],)).fetchone()[0]==1
        assert c.execute('SELECT room_id FROM teacher_rooms WHERE user_id=?',(r.json()['id'],)).fetchone()[0]==1


def test_service_templates_and_mfa_policy_safe_activation(records):
    a=client(1);data={'request_id':str(uuid4()),'title':'Culto de celebração','weekday':6,'service_time':'18:30','duration_minutes':90}
    assert client(3).post('/api/workspace/services',json=data).status_code==403
    r=a.post('/api/workspace/services',json=data);assert r.status_code==200,r.text
    assert a.post('/api/workspace/services',json=data).status_code==200
    assert a.put('/api/workspace/users/1/mfa-policy',json={'required':True}).status_code==409
    from backend.security import totp
    setup=a.post('/api/auth/mfa/setup',json={'password':PASSWORD}).json()
    assert a.post('/api/auth/mfa/confirm',json={'password':PASSWORD,'secret':setup['enrollment'],'code':totp(setup['secret'])}).status_code==200
    assert a.put('/api/workspace/users/1/mfa-policy',json={'required':True}).status_code==200
    assert a.post('/api/auth/mfa/disable',json={'password':PASSWORD,'code':totp(setup['secret'])}).status_code==403


def test_isolated_sqlite_backup_restores_constraints(records,tmp_path):
    import os,sqlite3,pytest
    if os.getenv('KIDS_DATABASE_URL'):pytest.skip('PostgreSQL restore is verified by CI pg_dump/pg_restore.')
    from backend.manage import backup
    a=client(1);pid=person(a);path=tmp_path/'restored.sqlite3';backup(str(path))
    with sqlite3.connect(path) as restored:
        assert restored.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
        assert restored.execute('PRAGMA foreign_key_check').fetchall()==[]
        assert restored.execute('SELECT id FROM members_people WHERE id=?',(pid,)).fetchone()[0]==pid

def test_substitution_candidates_history_and_calendar_filters(records):
    a=client(1);one=person(a);two=person(a);future=str(date.fromisoformat(s.today())+timedelta(days=5))
    for pid in (one,two):assert a.post('/api/ministries/assignments',json={'person_id':pid,'ministry':'Music'}).status_code==200
    r=a.post('/api/ministries/schedules',json={'title':'Culto','person_id':one,'ministry':'Music','service_date':future,'service_time':'10:00'});assert r.status_code==200,r.text
    rid=r.json()['id'];assert a.get('/api/workspace/schedules/'+rid+'/candidates').json()==[{'id':two,'name':'Membro de teste'}]
    assert a.post('/api/workspace/schedules/'+rid+'/replace',json={'person_id':two,'reason':'Substituição pela coordenação','version':1}).status_code==200
    hist=a.get('/api/workspace/schedules/'+rid+'/history').json();assert hist[0]['previous_status']==one and hist[0]['status']==two
    assert a.get('/api/workspace/calendar?ministry=Kids').json()['items']==[]
    assert len(a.get('/api/workspace/calendar?ministry=Music&status=pending').json()['items'])==1
    assert a.post('/api/workspace/schedules/'+rid+'/replace',json={'person_id':one,'reason':'Tentativa com versão antiga','version':1}).status_code==409


def test_material_revision_keeps_previous_file_and_checks_version(records):
    a=client(1)
    r=a.post('/api/workspace/materials',data={'request_id':str(uuid4()),'title':'Lição','ministry':'Kids'},files={'file':('lesson.pdf',b'%PDF-1.4 synthetic fixture','application/pdf')});assert r.status_code==200,r.text
    rid=r.json()['id']
    with s.db() as c:old=c.execute('SELECT file_id FROM ministries_resources WHERE id=?',(rid,)).fetchone()[0]
    r=a.post('/api/workspace/materials/'+rid+'/revision',data={'version':'1'},files={'file':('lesson2.pdf',b'%PDF-1.4 updated synthetic fixture','application/pdf')});assert r.status_code==200,r.text
    assert a.post('/api/workspace/materials/'+rid+'/revision',data={'version':'1'},files={'file':('a.pdf',b'%PDF-1.4 stale','application/pdf')}).status_code==409
    with s.db() as c:
        assert c.execute('SELECT version FROM ministries_resources WHERE id=?',(rid,)).fetchone()[0]==2
        assert c.execute('SELECT 1 FROM media WHERE id=?',(old,)).fetchone()
    assert b'updated synthetic' in a.get('/api/workspace/materials/'+rid+'/file').content


def test_expired_pickup_code_requires_audited_exception(records):
    a=client(1);teacher=client(2)
    r=teacher.post('/api/children/1/attendance',json={'action':'in','guardian_id':3,'guardian_confirmed':True});assert r.status_code==200
    with s.db() as c:c.execute("UPDATE attendance SET claim_expires_at='2000-01-01T00:00:00-03:00' WHERE child_id=1")
    body={'action':'out','guardian_id':3,'guardian_confirmed':True,'claim_code':r.json()['claim_code']}
    assert teacher.post('/api/children/1/attendance',json=body).status_code==403
    assert a.post('/api/children/1/attendance',json={**body,'exception_reason':'Responsável conferido pessoalmente pela administração'}).status_code==200


def test_moderation_receipt_is_private_and_not_duplicated(records):
    a=client(1);grant(3,'members','viewer');u=client(3)
    r=a.post('/api/platform/hall/posts',json={'request_id':str(uuid4()),'content':'Conteúdo fictício para moderação'});assert r.status_code==200
    rid=r.json()['id'];assert u.post('/api/platform/hall/posts/'+rid+'/report',json={'reason':'privacy'}).status_code==200
    for _ in range(2):assert a.post('/api/platform/hall/posts/'+rid+'/resolve-reports').status_code==200
    with s.db() as c:
        rows=c.execute("SELECT user_id,message FROM notifications WHERE kind='hall_moderation'").fetchall()
        assert len(rows)==1 and rows[0]['user_id']==3 and 'Conteúdo' not in rows[0]['message']


def test_scheduled_worker_loads_in_fresh_process(records):
    import subprocess,sys,os
    env=os.environ.copy();env['PYTHONIOENCODING']='utf-8'
    r=subprocess.run([sys.executable,'-c','from backend.push_worker import dispatch_operations; dispatch_operations()'],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0,r.stderr

def test_confirming_declined_schedule_rechecks_overlap(records):
    a=client(1);pid=person(a);future=str(date.fromisoformat(s.today())+timedelta(days=4))
    body={'title':'Culto','person_id':pid,'ministry':'Music','service_date':future,'service_time':'10:00','duration_minutes':120}
    old=a.post('/api/ministries/schedules',json={**body,'status':'declined'});assert old.status_code==200
    assert a.post('/api/ministries/schedules',json={**body,'service_time':'11:00'}).status_code==200
    assert a.post('/api/ministries/schedules/'+old.json()['id']+'/respond',json={'status':'confirmed'}).status_code==409

def test_gc_leader_decisions_scope_identity_and_duplicate_delivery(records):
    a=client(1);gid=a.post('/api/members/cells',json={'name':'GC Homônimo'}).json()['id'];other=a.post('/api/members/cells',json={'name':'GC Homônimo'}).json()['id']
    homonym=a.post('/api/members/people',json={'name':'User 4','account_user_id':3}).json()['id']
    assert a.put('/api/workspace/groups/'+gid+'/leaders',json={'user_id':2}).status_code==200
    applicant=client(4);r=applicant.post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':'GC Homônimo'});assert r.status_code==200,r.text
    rid=r.json()['id'];leader=client(2)
    details=leader.get('/api/workspace/groups/'+gid).json();assert details['applications'][0]['id']==rid
    assert not {'email','phone','notes'} & details['applications'][0].keys()
    assert leader.post('/api/workspace/groups/'+other+'/applications/'+rid+'/decision',json={'approve':True}).status_code==403
    assert leader.post('/api/members/gc-applications/'+rid+'/approve').status_code==403
    for _ in range(2):assert leader.post('/api/workspace/groups/'+gid+'/applications/'+rid+'/decision',json={'approve':True}).status_code==200
    with s.db() as c:
        original=c.execute('SELECT cell_id,account_user_id FROM members_people WHERE id=?',(homonym,)).fetchone();assert original['cell_id'] is None and original['account_user_id']==3
        person=c.execute('SELECT * FROM members_people WHERE account_user_id=4 AND active=1').fetchone();assert person['cell_id']==gid and person['joined_on'] is None
        assert c.execute("SELECT count(*) FROM notifications WHERE user_id=4 AND kind='gc_approved'").fetchone()[0]==1
        assert c.execute("SELECT count(*) FROM notifications WHERE user_id=2 AND kind='gc_application'").fetchone()[0]==1
    assert a.delete('/api/workspace/groups/'+gid+'/leaders/2').status_code==200
    assert leader.get('/api/workspace/groups/'+gid).status_code==403


def test_gc_leader_cannot_silently_transfer_from_another_group(records):
    a=client(1);gid=a.post('/api/members/cells',json={'name':'Novo GC'}).json()['id'];old=a.post('/api/members/cells',json={'name':'GC Atual'}).json()['id']
    pid=a.post('/api/members/people',json={'name':'User 3','account_user_id':3,'cell_id':old}).json()['id']
    a.put('/api/workspace/groups/'+gid+'/leaders',json={'user_id':2})
    r=client(3).post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':'Novo GC'});rid=r.json()['id']
    assert client(2).post('/api/workspace/groups/'+gid+'/applications/'+rid+'/decision',json={'approve':True}).status_code==409
    with s.db() as c:assert c.execute('SELECT cell_id FROM members_people WHERE id=?',(pid,)).fetchone()[0]==old
    assert a.post('/api/members/gc-applications/'+rid+'/approve').status_code==200


def test_gc_legacy_identity_requires_verified_email_or_manual_review(records):
    a=client(1);gid=a.post('/api/members/cells',json={'name':'GC Legado'}).json()['id']
    pid=a.post('/api/members/people',json={'name':'Cadastro legado','email':'user4@example.test','phone':'Dados preservados'}).json()['id']
    r=client(4).post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':'GC Legado'});rid=r.json()['id']
    assert a.post('/api/members/gc-applications/'+rid+'/approve').status_code==409
    with s.db() as c:c.execute('UPDATE users SET email_verified=1 WHERE id=4')
    assert a.post('/api/members/gc-applications/'+rid+'/approve').status_code==200
    with s.db() as c:
        row=c.execute('SELECT * FROM members_people WHERE id=?',(pid,)).fetchone();assert row['account_user_id']==4 and row['phone']=='Dados preservados'


def test_gc_reject_is_idempotent_and_request_id_wins_over_duplicate_names(records):
    a=client(1);gid=a.post('/api/members/cells',json={'name':'GC Repetido'}).json()['id'];a.post('/api/members/cells',json={'name':'GC Repetido'})
    u=client(3)
    assert u.post('/api/platform/apply',json={'target_type':'gc','target_name':'GC Repetido'}).status_code==409
    r=u.post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':'GC Repetido'});rid=r.json()['id']
    for _ in range(2):assert a.delete('/api/members/gc-applications/'+rid).status_code==200
    assert a.post('/api/members/gc-applications/'+rid+'/approve').status_code==409
    with s.db() as c:assert c.execute("SELECT count(*) FROM notifications WHERE user_id=3 AND kind='gc_application_result'").fetchone()[0]==1

def test_ministry_approval_never_merges_homonyms_or_reenables_blocked_access(records):
    a=client(1);homonym=a.post('/api/members/people',json={'name':'User 4','account_user_id':3}).json()['id']
    grant(4,'ministries','viewer')
    with s.db() as c:c.execute("UPDATE module_access SET enabled=0 WHERE user_id=4 AND module='ministries'")
    r=client(4).post('/api/platform/apply',json={'target_type':'ministry','target_name':'Music'});rid=r.json()['id']
    for _ in range(2):assert a.post('/api/ministries/applications/'+rid+'/approve').status_code==200
    with s.db() as c:
        p=c.execute('SELECT * FROM members_people WHERE account_user_id=4 AND active=1').fetchone();assert p and p['id']!=homonym and p['joined_on'] is None
        assert c.execute("SELECT enabled FROM module_access WHERE user_id=4 AND module='ministries'").fetchone()[0]==0
        assert c.execute("SELECT count(*) FROM notifications WHERE user_id=4 AND kind='ministry_approved'").fetchone()[0]==1
    assert a.delete('/api/ministries/applications/'+rid).status_code==409


def test_gc_same_name_groups_keep_requests_distinct(records):
    a=client(1);one=a.post('/api/members/cells',json={'name':'Mesmo Nome'}).json()['id'];two=a.post('/api/members/cells',json={'name':'Mesmo Nome'}).json()['id'];u=client(3)
    requests=[u.post('/api/platform/apply',json={'target_type':'gc','target_id':gid,'target_name':'Mesmo Nome'}).json()['id'] for gid in (one,two)]
    assert requests[0]!=requests[1]
