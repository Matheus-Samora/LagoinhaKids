from datetime import date
import csv,io,secrets,json
from fastapi import APIRouter,Depends,Query,UploadFile,File,Response
from pydantic import Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,money,save,archive,current,check_date,change
router=APIRouter(prefix='/api/finance',tags=['Finance'])
read=module_access('finance');write=module_access('finance',('admin','editor'));admin=module_access('finance',('admin',))

class CostCenter(Record):
    name:str=Field(min_length=2,max_length=120)
    ministry:str=Field(default='',max_length=60)
    budget_value:str=Field(default='0',max_length=30)

class Account(Record):
    name:str=Field(min_length=2,max_length=120)
    bank:str=Field(default='',max_length=100)
    opening_value:str=Field(default='0',max_length=30)

class Entry(Record):
    account_id:str=Field(max_length=40)
    direction:str=Field(pattern='^(income|expense)$')
    description:str=Field(min_length=2,max_length=250)
    occurred_on:date
    amount:str=Field(max_length=30)
    category:str=Field(default='',max_length=80)
    payment_status:str=Field(default='paid',pattern='^(paid|pending)$')
    due_date:date|None=None
    payment_method:str=Field(default='pix',max_length=40)
    cost_center_id:str|None=Field(default=None,max_length=40)

class ServiceClosing(Record):
    service_name:str=Field(min_length=2,max_length=140)
    service_date:date
    account_id:str=Field(max_length=40)
    tithes:str=Field(default='0',max_length=30)
    offerings_cash:str=Field(default='0',max_length=30)
    offerings_pix:str=Field(default='0',max_length=30)
    offerings_card:str=Field(default='0',max_length=30)
    counted_by:str=Field(min_length=2,max_length=120)
    verified_by:str=Field(min_length=2,max_length=120)
    notes:str=Field(default='',max_length=400)

class Invoice(Record):
    number:str=Field(min_length=1,max_length=80)
    supplier:str=Field(min_length=2,max_length=160)
    issued_on:date
    amount:str=Field(max_length=30)
    entry_id:str|None=Field(default=None,max_length=40)
    file_id:str|None=Field(default=None,max_length=40)

@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        cost_centers=[dict(r) for r in c.execute("SELECT cc.*,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='expense' AND e.active=1),0) spent_cents,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='income' AND e.active=1),0) income_cents FROM finance_cost_centers cc WHERE cc.active=1 ORDER BY cc.name LIMIT 200")]
        accounts=[dict(r) for r in c.execute("SELECT a.*,a.opening_cents+coalesce((SELECT sum(CASE WHEN e.direction='income' THEN e.amount_cents ELSE -e.amount_cents END) FROM finance_entries e WHERE e.account_id=a.id AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) balance_cents FROM finance_accounts a WHERE a.active=1 ORDER BY a.name LIMIT 500")]
        entries=[dict(r) for r in c.execute("SELECT e.*,a.name account_name,coalesce(cc.name,'') cost_center_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE e.active=1 AND lower(e.description) LIKE ? ORDER BY e.occurred_on DESC,e.created_at DESC LIMIT 200",('%'+q.lower()+'%',))]
        closings=[dict(r) for r in c.execute('SELECT sc.*,a.name account_name FROM finance_service_closings sc JOIN finance_accounts a ON a.id=sc.account_id WHERE sc.active=1 ORDER BY sc.service_date DESC,sc.created_at DESC LIMIT 100')]
        invoices=[dict(r) for r in c.execute('SELECT * FROM finance_invoices WHERE active=1 AND (lower(supplier) LIKE ? OR lower(number) LIKE ?) ORDER BY issued_on DESC LIMIT 200',('%'+q.lower()+'%','%'+q.lower()+'%'))]
        totals=c.execute("SELECT coalesce(sum(CASE WHEN direction='income' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) income_cents,coalesce(sum(CASE WHEN direction='expense' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) expense_cents,coalesce(sum(CASE WHEN direction='income' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_income_cents,coalesce(sum(CASE WHEN direction='expense' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_expense_cents FROM finance_entries WHERE active=1").fetchone()
        return {'cost_centers':cost_centers,'accounts':accounts,'entries':entries,'closings':closings,'invoices':invoices,'totals':dict(totals),'mode':'manual'}

def persist(kind,data,user,rid=None):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if kind=='cost_centers':
            if not data.name.strip():fail('name','Informe o nome do centro de custo.')
            values={'name':data.name.strip(),'ministry':data.ministry.strip(),'budget_cents':money(data.budget_value)}
        elif kind=='accounts':
            if not data.name.strip():fail('name','Informe o nome da conta.')
            values={'name':data.name.strip(),'bank':data.bank.strip(),'opening_cents':money(data.opening_value)}
        elif kind=='entries':
            current(c,'finance_accounts',data.account_id)
            if data.cost_center_id:current(c,'finance_cost_centers',data.cost_center_id)
            if data.payment_status=='paid':check_date(data.occurred_on)
            if not data.description.strip():fail('description','Informe a descrição.')
            values={
                'account_id':data.account_id,'direction':data.direction,'description':data.description.strip(),
                'occurred_on':str(data.occurred_on),'amount_cents':money(data.amount,True),'category':data.category.strip(),
                'payment_status':data.payment_status,'due_date':str(data.due_date) if data.due_date else None,
                'payment_method':data.payment_method.strip() or 'pix','cost_center_id':data.cost_center_id or None
            }
        elif kind=='service_closings':
            current(c,'finance_accounts',data.account_id)
            check_date(data.service_date)
            if not data.service_name.strip():fail('service_name','Informe o nome do culto/celebração.')
            if not data.counted_by.strip() or not data.verified_by.strip():fail('conference','Informe os dois responsáveis pela dupla conferência.')
            t_cents=money(data.tithes)
            c_cents=money(data.offerings_cash)
            p_cents=money(data.offerings_pix)
            k_cents=money(data.offerings_card)
            if any(v<0 for v in (t_cents,c_cents,p_cents,k_cents)):fail('amount','Valores não podem ser negativos.')
            tot_cents=t_cents+c_cents+p_cents+k_cents
            if tot_cents<=0:fail('amount','O total do borderô deve ser maior que zero.')
            entry_desc=f"Borderô: {data.service_name.strip()} ({data.service_date})"
            existing_entry_id=None
            if rid:
                old_sc=current(c,'finance_service_closings',rid)
                existing_entry_id=old_sc.get('entry_id')
            if existing_entry_id and c.execute('SELECT 1 FROM finance_entries WHERE id=? AND active=1',(existing_entry_id,)).fetchone():
                c.execute('UPDATE finance_entries SET account_id=?,description=?,occurred_on=?,amount_cents=?,version=version+1 WHERE id=?',(data.account_id,entry_desc,str(data.service_date),tot_cents,existing_entry_id))
                entry_id=existing_entry_id
            else:
                entry_res=save(c,'finance_entries','finance',Record(),{
                    'account_id':data.account_id,'direction':'income','description':entry_desc,
                    'occurred_on':str(data.service_date),'amount_cents':tot_cents,'category':'Borderô de Culto',
                    'payment_status':'paid','due_date':None,'payment_method':'multi','cost_center_id':None
                },user)
                entry_id=entry_res['id']
            values={
                'service_name':data.service_name.strip(),'service_date':str(data.service_date),'account_id':data.account_id,
                'tithes_cents':t_cents,'offerings_cash_cents':c_cents,'offerings_pix_cents':p_cents,'offerings_card_cents':k_cents,
                'total_cents':tot_cents,'counted_by':data.counted_by.strip(),'verified_by':data.verified_by.strip(),
                'notes':data.notes.strip(),'entry_id':entry_id
            }
        else:
            check_date(data.issued_on)
            if not data.number.strip() or not data.supplier.strip():fail('invoice','Informe número e fornecedor.')
            if data.entry_id and not c.execute('SELECT 1 FROM finance_entries WHERE id=?',(data.entry_id,)).fetchone():fail('entry','Lançamento não encontrado.',404)
            if data.file_id and not c.execute('SELECT 1 FROM finance_files WHERE id=?',(data.file_id,)).fetchone():fail('file','Anexo não encontrado.',404)
            values={'number':data.number.strip(),'supplier':data.supplier.strip(),'issued_on':str(data.issued_on),'amount_cents':money(data.amount,True),'entry_id':data.entry_id,'file_id':data.file_id}
        return save(c,'finance_'+kind,'finance',data,values,user,rid)

@router.post('/cost-centers')
def add_cost_center(data:CostCenter,user=Depends(write)):return persist('cost_centers',data,user)
@router.put('/cost-centers/{rid}')
def edit_cost_center(rid:str,data:CostCenter,user=Depends(write)):return persist('cost_centers',data,user,rid)
@router.post('/accounts')
def add_account(data:Account,user=Depends(write)):return persist('accounts',data,user)
@router.put('/accounts/{rid}')
def edit_account(rid:str,data:Account,user=Depends(write)):return persist('accounts',data,user,rid)
@router.post('/entries')
def add_entry(data:Entry,user=Depends(write)):return persist('entries',data,user)
@router.put('/entries/{rid}')
def edit_entry(rid:str,data:Entry,user=Depends(write)):return persist('entries',data,user,rid)
@router.post('/entries/{rid}/settle')
def settle_entry(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=current(c,'finance_entries',rid)
        c.execute("UPDATE finance_entries SET payment_status='paid',occurred_on=?,version=version+1 WHERE id=?",(s.today(),rid))
        change(c,'finance',rid,'settled',user,old,current(c,'finance_entries',rid))
        return {'ok':True,'id':rid}
@router.post('/closings')
def add_closing(data:ServiceClosing,user=Depends(write)):return persist('service_closings',data,user)
@router.put('/closings/{rid}')
def edit_closing(rid:str,data:ServiceClosing,user=Depends(write)):return persist('service_closings',data,user,rid)
@router.post('/invoices')
def add_invoice(data:Invoice,user=Depends(write)):return persist('invoices',data,user)
@router.put('/invoices/{rid}')
def edit_invoice(rid:str,data:Invoice,user=Depends(write)):return persist('invoices',data,user,rid)

@router.delete('/{kind}/{rid}')
def remove(kind:str,rid:str,version:int=Query(ge=1),user=Depends(admin)):
    table_map={'accounts':'accounts','entries':'entries','invoices':'invoices','cost-centers':'cost_centers','closings':'service_closings'}
    if kind not in table_map:fail('kind','Registro inválido.',404)
    t_suffix=table_map[kind]
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if t_suffix=='accounts' and c.execute('SELECT 1 FROM finance_entries WHERE account_id=? AND active=1',(rid,)).fetchone():fail('account','Esta conta possui lançamentos ativos e não pode ser arquivada.',409)
        if t_suffix=='cost_centers':c.execute('UPDATE finance_entries SET cost_center_id=NULL WHERE cost_center_id=?',(rid,))
        if t_suffix=='service_closings':
            sc=current(c,'finance_service_closings',rid)
            if sc.get('entry_id'):
                en=c.execute('SELECT id,version FROM finance_entries WHERE id=? AND active=1',(sc['entry_id'],)).fetchone()
                if en:archive(c,'finance_entries','finance',en['id'],en['version'],user)
        return archive(c,'finance_'+t_suffix,'finance',rid,version,user)

@router.get('/export.csv')
def export_csv(user=Depends(read)):
    with s.db() as c:
        rows=c.execute("SELECT e.*,a.name account_name,coalesce(cc.name,'') cost_center_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE e.active=1 ORDER BY e.occurred_on DESC,e.created_at DESC").fetchall()
    buf=io.StringIO()
    buf.write('\ufeff')
    writer=csv.writer(buf,delimiter=';')
    writer.writerow(['Data','Vencimento','Tipo','Status','Conta','Centro de Custo','Categoria','Metodo','Descricao','Valor (R$)'])
    for r in rows:
        val=f"{r['amount_cents']/100:.2f}".replace('.',',')
        writer.writerow([
            r['occurred_on'],r['due_date'] or '',
            'Entrada' if r['direction']=='income' else 'Saida',
            'Liquidado' if (r['payment_status'] or 'paid')=='paid' else 'Pendente',
            r['account_name'],r['cost_center_name'] or '',r['category'] or '',
            r['payment_method'] or 'pix',r['description'],val
        ])
    return Response(buf.getvalue().encode('utf-8'),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':'attachment; filename="lagoinha-finance-relatorio.csv"'})

@router.get('/history/{rid}')
def history(rid:str,user=Depends(admin)):
    with s.db() as c:return [dict(r) for r in c.execute("SELECT action,before_json,after_json,created_at FROM module_changes WHERE module='finance' AND record_id=? ORDER BY created_at",(rid,))]
@router.post('/files')
async def upload(file:UploadFile=File(...),user=Depends(write)):
    raw=await file.read(10*1024*1024+1)
    if not raw or len(raw)>10*1024*1024:fail('size','Envie um PDF ou imagem de até 10 MB.',413)
    mime='application/pdf';ext='pdf'
    if raw.startswith(b'%PDF-'):
        if b'%%EOF' not in raw[-2048:]:fail('pdf','O PDF parece incompleto. Envie novamente.')
    else:
        from PIL import Image,ImageOps,UnidentifiedImageError
        try:
            image=Image.open(io.BytesIO(raw))
            if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>12000000:fail('image','Use JPG, PNG ou WebP de até 12 megapixels.')
            image=ImageOps.exif_transpose(image).convert('RGB');image.thumbnail((2000,2000))
            out=io.BytesIO();image.save(out,'WEBP',quality=88);raw=out.getvalue();mime='image/webp';ext='webp'
        except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError):fail('file','Formato inválido. Use PDF, JPG, PNG ou WebP.')
    fid=secrets.token_hex(16)
    with s.db() as c:
        c.execute('INSERT INTO finance_files(id,filename,content_type,data,created_at) VALUES(?,?,?,?,?)',(fid,'nota-'+fid+'.'+ext,mime,raw,s.now()))
        s.audit(c,user['id'],'finance:file_uploaded:'+fid)
    return {'id':fid,'url':'/api/finance/files/'+fid}
@router.get('/files/{fid}')
def download(fid:str,user=Depends(read)):
    with s.db() as c:row=c.execute('SELECT * FROM finance_files WHERE id=?',(fid,)).fetchone()
    if not row:fail('file','Arquivo não encontrado.',404)
    return Response(bytes(row['data']),media_type=row['content_type'],headers={'Cache-Control':'private, no-store','Content-Disposition':'inline; filename="'+row['filename']+'"','X-Content-Type-Options':'nosniff'})
