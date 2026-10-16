from test_app import records,client
from test_basic_sectors import person,account,grant
from backend import store as s
from datetime import date,timedelta
from uuid import uuid4
from io import BytesIO
from zipfile import ZipFile
from xml.etree.ElementTree import fromstring

def test_scoped_leader_cannot_read_or_take_over_other_ministry():
    admin=client();pid=person(admin);ids={}
    for name in ['Music','Hero']:
        ids[name]=admin.post('/api/ministries/assignments',json={'person_id':pid,'ministry':name}).json()['id']
    grant(2,'ministries','editor')
    with s.db() as c:c.execute("INSERT INTO module_scopes VALUES(2,'ministries','Music')")
    leader=client(2);rows=leader.get('/api/ministries').json()
    assert [a['ministry'] for a in rows['assignments']]==['Music']
    assert rows['catalog']==['Music']
    assert leader.put('/api/ministries/assignments/'+ids['Hero'],json={'person_id':pid,'ministry':'Music','version':1}).status_code==403

def test_finance_forecast_due_dates_search_and_xlsx():
    c=client();aid=account(c);today=date.fromisoformat(s.today())
    for days in [10,45,75,100]:
        assert c.post('/api/finance/entries',json={'account_id':aid,'description':f'Pagamento {days}','direction':'expense','amount':'10','occurred_on':str(today),'due_date':str(today+timedelta(days=days)),'payment_status':'pending'}).status_code==200
    engine=c.get('/api/finance?q=sem-resultado').json()['engine']
    assert [engine[f'projected_{n}d_cents'] for n in (30,60,90)]==[9000,8000,7000]
    response=c.get('/api/finance/report?format=xlsx')
    assert response.status_code==200
    with ZipFile(BytesIO(response.content)) as z:
        assert 'xl/workbook.xml' in z.namelist()
        for name in z.namelist():fromstring(z.read(name))

def test_closing_retry_does_not_double_income_and_conference_distinct():
    c=client();aid=account(c)
    body={'request_id':str(uuid4()),'service_name':'Culto isolado','service_date':s.today(),'account_id':aid,'tithes':'20','counted_by':'Pessoa A','verified_by':'Pessoa B'}
    first=c.post('/api/finance/closings',json=body)
    assert first.status_code==200,first.text
    assert c.post('/api/finance/closings',json=body).json()['id']==first.json()['id']
    assert c.get('/api/finance').json()['totals']['income_cents']==2000
    body.update(request_id=str(uuid4()),verified_by='Pessoa A')
    assert c.post('/api/finance/closings',json=body).status_code==400

def test_gc_startup_preserves_edits_and_sensitive_history():
    c=client()
    from backend.modules.schema import migrate,ensure_official_gcs
    with s.db() as db:
        ensure_official_gcs(db)
        db.execute("INSERT INTO members_cells(id,name,created_at) VALUES('local-gc','GC local',?)",(s.now(),))
        db.execute("UPDATE members_cells SET address='Endereço editado' WHERE id='gc-ide'")
        migrate(db)
        row=db.execute("SELECT address FROM members_cells WHERE id='gc-ide'").fetchone()
        assert row[0]=='Endereço editado'
    p=c.post('/api/members/people',json={'name':'Pessoa isolada','address':'Endereço privado','pastoral_notes':'Anotação privada'})
    assert p.status_code==200,p.text
    with s.db() as db:
        history=db.execute('SELECT after_json FROM module_changes WHERE record_id=?',(p.json()['id'],)).fetchone()[0]
        assert 'Endereço privado' not in history and 'Anotação privada' not in history

def test_non_kids_user_can_configure_push_and_material_url_is_safe():
    grant(3,'ministries','editor')
    with s.db() as db:db.execute("DELETE FROM module_access WHERE user_id=3 AND module='kids'")
    c=client(3)
    assert c.get('/api/web-push/config').status_code==200
    assert c.post('/api/ministries/resources',json={'ministry':'Music','title':'Material seguro','resource_url':'javascript:alert(1)'}).status_code==400

def test_ti_and_pastor_can_operate_kids_without_legacy_admin_role():
    with s.db() as db:
        db.execute('INSERT INTO platform_admins VALUES(3)')
        db.execute('INSERT INTO pastoral_users VALUES(4)')
    for uid in (3,4):
        c=client(uid)
        assert len(c.get('/api/children').json())==2
        assert c.get('/api/users').status_code==(200 if uid==3 else 403)
    assert client(4).get('/api/platform/users').status_code==403

def test_legacy_sensitive_migration_preserves_values_without_plaintext():
    from backend.modules.schema import migrate
    from backend.modules.common import decrypt_text
    c=client();pid=person(c)
    with s.db() as db:
        db.execute("DELETE FROM platform_migrations WHERE name='sensitive_fields_v231'")
        db.execute('UPDATE members_people SET address=? WHERE id=?',('Endereço antigo',pid))
        migrate(db)
        value=db.execute('SELECT address FROM members_people WHERE id=?',(pid,)).fetchone()[0]
        assert value.startswith('enc:v1:') and decrypt_text(value)=='Endereço antigo'
        migrate(db)
        assert db.execute('SELECT address FROM members_people WHERE id=?',(pid,)).fetchone()[0]==value

def test_report_filters_and_csv_formula_protection():
    c=client();aid=account(c)
    other=c.post('/api/finance/accounts',json={'name':'=HYPERLINK("example")'}).json()['id']
    report=c.get('/api/finance/report',params={'format':'json','account_id':aid}).json()
    assert [a['id'] for a in report['accounts']]==[aid]
    csv=c.get('/api/finance/report',params={'format':'csv','report_type':'banks'}).text
    assert "'=HYPERLINK" in csv
    assert c.get('/api/finance/report?start_date=wrong').status_code==400
    assert c.get('/api/finance/report?start_date=2026-12-01&end_date=2026-01-01').status_code==400
