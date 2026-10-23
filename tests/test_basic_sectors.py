from test_app import records,client
from backend import store as s
from uuid import uuid4

def grant(uid,module,role):
    with s.db() as c:c.execute('INSERT INTO module_access VALUES(?,?,?,1) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role,enabled=1',(uid,module,role))
def family(c,name='Família de teste'):
    r=c.post('/api/members/families',json={'name':name,'joined_on':s.today()});assert r.status_code==200,r.text;return r.json()['id']
def person(c,fid=None):
    r=c.post('/api/members/people',json={'name':'Membro de teste','family_id':fid,'joined_on':s.today(),'birthday':'1990-01-02'});assert r.status_code==200,r.text;return r.json()['id']
def account(c):
    r=c.post('/api/finance/accounts',json={'name':'Conta de teste','opening_value':'100,00'});assert r.status_code==200,r.text;return r.json()['id']
def entry(c,aid,value='10,50',direction='income',request_id=None):
    body={'account_id':aid,'direction':direction,'description':'Lançamento de teste','amount':value,'occurred_on':s.today()}
    if request_id:body['request_id']=request_id
    return c.post('/api/finance/entries',json=body)

def test_family_people_counts_and_edit_conflict():
    c=client(1);fid=family(c);pid=person(c,fid)
    snapshot=c.get('/api/members').json();assert snapshot['families'][0]['member_count']==1
    body={'name':'Nome atualizado','family_id':fid,'version':1}
    assert c.put('/api/members/people/'+pid,json=body).status_code==200
    assert c.put('/api/members/people/'+pid,json=body).status_code==409
    assert c.delete('/api/members/families/'+fid+'?version=1').status_code==409
    assert c.delete('/api/members/people/'+pid+'?version=2').status_code==200
    assert c.get('/api/members').json()['families'][0]['member_count']==0

def test_ministries_reuses_members_minimal_directory_and_multiple_roles():
    admin=client(1);pid=person(admin)
    grant(2,'ministries','editor');leader=client(2)
    assert leader.get('/api/members').status_code==403
    people=leader.get('/api/ministries/people').json();assert set(people[0])=={'id','name'}
    for ministry in ['Music','Intercessão']:
        r=leader.post('/api/ministries/assignments',json={'person_id':pid,'ministry':ministry,'position':'Líder'});assert r.status_code==200,r.text
    assert leader.post('/api/ministries/assignments',json={'person_id':pid,'ministry':'Music'}).status_code==409
    assert leader.post('/api/ministries/assignments',json={'person_id':pid,'ministry':'Unknown'}).status_code==400
    assert len(leader.get('/api/ministries').json()['catalog'])==16
    admin.delete('/api/members/people/'+pid+'?version=1')
    assert leader.get('/api/ministries').json()['assignments']==[]

def test_finance_exact_money_edit_history_idempotency():
    c=client(1);aid=account(c)
    for value,kind in [('0.10','income'),('0.20','income'),('0.15','expense')]:assert entry(c,aid,value,kind).status_code==200
    snapshot=c.get('/api/finance').json();assert snapshot['accounts'][0]['balance_cents']==10015
    key=str(uuid4());r=entry(c,aid,'10,50',request_id=key);assert r.status_code==200
    assert entry(c,aid,'10,50',request_id=key).json()['id']==r.json()['id']
    assert entry(c,aid,'20,50',request_id=key).status_code==409
    rid=r.json()['id'];body={'account_id':aid,'direction':'expense','description':'Corrigido','occurred_on':s.today(),'amount':'3.25','version':1}
    assert c.put('/api/finance/entries/'+rid,json=body).status_code==200
    assert c.put('/api/finance/entries/'+rid,json=body).status_code==409
    history=c.get('/api/finance/history/'+rid).json();assert len(history)==2 and '1050' in history[1]['before_json']
    assert entry(c,aid,'0.001').status_code==400
    assert entry(c,aid,'NaN').status_code==400
    assert entry(c,aid,'0').status_code==400
    assert c.delete('/api/finance/accounts/'+aid+'?version=1').status_code==409

def test_finance_invoices_files_protected_and_invalid_uploads():
    c=client(1);aid=account(c);rid=entry(c,aid).json()['id']
    pdf=b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF'
    r=c.post('/api/finance/files',files={'file':('nota.pdf',pdf,'application/pdf')});assert r.status_code==200,r.text
    fid=r.json()['id'];url=r.json()['url']
    body={'number':'123','supplier':'Fornecedor de teste','amount':'10,50','issued_on':s.today(),'entry_id':rid,'file_id':fid}
    inv=c.post('/api/finance/invoices',json=body);assert inv.status_code==200,inv.text
    assert c.get(url).content==pdf
    assert client(3).get(url).status_code==403
    from fastapi.testclient import TestClient
    from backend.app import app
    assert TestClient(app).get(url).status_code==401
    assert c.post('/api/finance/files',files={'file':('nota.pdf',b'%PDF-broken','application/pdf')}).status_code==400
    assert c.post('/api/finance/files',files={'file':('script.html',b'<script>bad</script>','text/html')}).status_code==400

def test_sector_viewer_no_writes_editor_no_archives_systems_ti_only():
    c=client(1);fid=family(c);grant(3,'members','viewer');viewer=client(3)
    assert viewer.get('/api/members').status_code==200
    assert viewer.post('/api/members/people',json={'name':'Not allowed'}).status_code==403
    assert viewer.get('/systems').status_code==403
    grant(2,'members','editor');editor=client(2)
    assert editor.post('/api/members/people',json={'name':'Editor allowed'}).status_code==200
    assert editor.delete('/api/members/families/'+fid+'?version=1').status_code==403
    assert editor.get('/api/platform/users').status_code==403

def test_invoice_upload_only_finance_writers_and_csrf_required():
    grant(3,'finance','viewer');viewer=client(3)
    assert viewer.post('/api/finance/files',files={'file':('a.pdf',b'%PDF-1.4\n%%EOF','application/pdf')}).status_code==403
    admin=client(1);admin.headers.pop('X-CSRF-Token')
    assert admin.post('/api/finance/accounts',json={'name':'CSRF protected'}).status_code==403

def test_members_cells_and_self_registration_approval():
    c=client(1)
    cell_res=c.post('/api/members/cells',json={'name':'GC Savassi','leader_name':'Pr. Lucas','neighborhood':'Savassi','meeting_day':'Quarta 20h'})
    assert cell_res.status_code==200,cell_res.text
    cell_id=cell_res.json()['id']
    reg=c.post('/api/members/self-register',json={'name':'Visitante Novo','family_name':'Família Novo','phone':'31999990000','integration_stage':'visitor'})
    assert reg.status_code==200,reg.text
    reg_id=reg.json()['id']
    snap=c.get('/api/members').json()
    assert len(snap['self_registrations'])==1
    app_res=c.post(f'/api/members/self-registrations/{reg_id}/approve')
    assert app_res.status_code==200,app_res.text
    pid=app_res.json()['person_id']
    assert c.put(f'/api/members/people/{pid}',json={'name':'Visitante Novo','cell_id':cell_id,'integration_stage':'baptized','version':1}).status_code==200
    snap2=c.get('/api/members').json()
    assert next(x for x in snap2['cells'] if x['id']==cell_id)['member_count']==1
    assert snap2['self_registrations']==[]

def test_ministries_schedules_conflict_and_resources():
    c=client(1);pid=person(c)
    s1=c.post('/api/ministries/schedules',json={'title':'Culto Domingo','ministry':'Music','person_id':pid,'role_notes':'Vocal','service_date':'2026-12-20','service_time':'18:00','status':'confirmed'})
    assert s1.status_code==200,s1.text
    s2=c.post('/api/ministries/schedules',json={'title':'Culto Domingo','ministry':'Future','person_id':pid,'service_date':'2026-12-20','service_time':'18:00','status':'confirmed'})
    assert s2.status_code==409
    s3=c.post('/api/ministries/schedules',json={'title':'Culto Manhã','ministry':'Future','person_id':pid,'service_date':'2026-12-20','service_time':'10:00','status':'confirmed'})
    assert s3.status_code==200
    res=c.post('/api/ministries/resources',json={'ministry':'Music','title':'Repertório Domingo','category':'repertorio','notes':'Tom G'})
    assert res.status_code==200
    snap=c.get('/api/ministries').json()
    assert len(snap['schedules'])==2 and len(snap['resources'])==1

def test_finance_cost_centers_closings_settle_and_csv():
    c=client(1);aid=account(c)
    cc=c.post('/api/finance/cost-centers',json={'name':'Reforma Kids','ministry':'Kids','budget_value':'1000,00'})
    assert cc.status_code==200
    cc_id=cc.json()['id']
    pend=c.post('/api/finance/entries',json={'account_id':aid,'cost_center_id':cc_id,'direction':'expense','description':'Pintura','occurred_on':s.today(),'due_date':'2026-12-31','amount':'250,00','payment_status':'pending'})
    assert pend.status_code==200
    pid=pend.json()['id']
    snap=c.get('/api/finance').json()
    assert snap['totals']['pending_expense_cents']==25000
    assert snap['accounts'][0]['balance_cents']==10000
    assert 'engine' in snap and 'projected_30d_cents' in snap['engine']
    assert c.post(f'/api/finance/entries/{pid}/settle').status_code==200
    snap2=c.get('/api/finance').json()
    assert snap2['totals']['pending_expense_cents']==0
    assert snap2['accounts'][0]['balance_cents']==-15000
    sc=c.post('/api/finance/closings',json={'service_name':'Culto Domingo 18h','service_date':s.today(),'account_id':aid,'tithes':'500,00','offerings_pix':'150,00','counted_by':'Tesoureiro A','verified_by':'Diácono B'})
    assert sc.status_code==200,sc.text
    snap3=c.get('/api/finance').json()
    assert snap3['accounts'][0]['balance_cents']==50000
    csv_res=c.get('/api/finance/export.csv')
    assert csv_res.status_code==200 and 'Borderô: Culto Domingo 18h' in csv_res.text
    xls_res=c.get('/api/finance/report?format=xls&report_type=complete')
    assert xls_res.status_code==200 and xls_res.content.startswith(b'PK')

def test_v230_worship_scale_candidacies_pastor_and_encryption():
    admin=client(1);member=client(3)
    # 1. Explicit catalog import; reads must never seed records.
    from backend.modules.schema import ensure_official_gcs
    with s.db() as c:ensure_official_gcs(c)
    # Verify banners and separate Link/Future ministries.
    comm=member.get('/api/platform/community').json()
    gc_names={g['name'] for g in comm['cells']}
    assert {'GC Ide','GC Emanuel','GC Fé','GC Betel','GC Rocket','GC Legacy','GC Propósito','GC Aviva'}.issubset(gc_names)
    min_names={m['name'] for m in comm['ministries']}
    assert 'Link' in min_names and 'Future' in min_names and 'Champions' in min_names and 'Link Future' not in min_names

    # 2. Member applies to Music ministry as Tecladista -> Leader gets notified and approves
    app_res=member.post('/api/platform/apply',json={'target_type':'ministry','target_name':'Music','role_desired':'Tecladista','phone':'33999991111','notes':'Toco teclado há 5 anos'})
    assert app_res.status_code==200
    app_id=app_res.json()['id']
    min_snap=admin.get('/api/ministries').json()
    assert any(a['id']==app_id for a in min_snap['applications'])
    approve_res=admin.post(f'/api/ministries/applications/{app_id}/approve')
    assert approve_res.status_code==200
    pid=approve_res.json()['person_id']

    # 3. Worship Scale Builder creates multi-instrument scale
    p2=person(admin)
    ws_res=admin.post('/api/ministries/worship-scale',json={
        'title':'Culto de Celebração Domingo',
        'service_date':'2026-12-27',
        'service_time':'18:00',
        'repertoire_title':'Setlist Domingo Noite',
        'repertoire_notes':'1. Bondade de Deus (G)',
        'members':[{'person_id':pid,'instrument':'Tecladista'},{'person_id':p2,'instrument':'Baterista'}]
    })
    assert ws_res.status_code==200 and ws_res.json()['created']==2

    # 4. Pastor role has access to all sectors without being Central IT Admin
    assert admin.patch('/api/platform/users/2',json={'pastor':True}).status_code==200
    pastor=client(2)
    me_pastor=pastor.get('/api/platform/me').json()
    assert me_pastor['pastor'] is True and me_pastor['platform_admin'] is False
    assert all(m['enabled'] for m in me_pastor['modules'])
    assert pastor.get('/api/finance').status_code==200
    assert pastor.get('/api/members').status_code==200
    assert pastor.get('/api/ministries').status_code==200
    assert pastor.get('/api/platform/users').status_code==403


