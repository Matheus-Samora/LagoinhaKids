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
