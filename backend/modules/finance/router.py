from datetime import date
import io,secrets,json
from fastapi import APIRouter,Depends,Query,UploadFile,File,Response
from pydantic import Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,money,save,archive,current,check_date
router=APIRouter(prefix='/api/finance',tags=['Finance'])
read=module_access('finance');write=module_access('finance',('admin','editor'));admin=module_access('finance',('admin',))
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
        accounts=[dict(r) for r in c.execute("SELECT a.*,a.opening_cents+coalesce((SELECT sum(CASE WHEN e.direction='income' THEN e.amount_cents ELSE -e.amount_cents END) FROM finance_entries e WHERE e.account_id=a.id AND e.active=1),0) balance_cents FROM finance_accounts a WHERE a.active=1 ORDER BY a.name LIMIT 500")]
        entries=[dict(r) for r in c.execute('SELECT e.*,a.name account_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id WHERE e.active=1 AND lower(e.description) LIKE ? ORDER BY e.occurred_on DESC,e.created_at DESC LIMIT 200',('%'+q.lower()+'%',))]
        invoices=[dict(r) for r in c.execute('SELECT * FROM finance_invoices WHERE active=1 AND (lower(supplier) LIKE ? OR lower(number) LIKE ?) ORDER BY issued_on DESC LIMIT 200',('%'+q.lower()+'%','%'+q.lower()+'%'))]
        totals=c.execute("SELECT coalesce(sum(CASE WHEN direction='income' THEN amount_cents ELSE 0 END),0) income_cents,coalesce(sum(CASE WHEN direction='expense' THEN amount_cents ELSE 0 END),0) expense_cents FROM finance_entries WHERE active=1").fetchone()
        return {'accounts':accounts,'entries':entries,'invoices':invoices,'totals':dict(totals),'mode':'manual'}
def persist(kind,data,user,rid=None):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if kind=='accounts':
            if not data.name.strip():fail('name','Informe o nome da conta.')
            values={'name':data.name.strip(),'bank':data.bank.strip(),'opening_cents':money(data.opening_value)}
        elif kind=='entries':
            current(c,'finance_accounts',data.account_id);check_date(data.occurred_on)
            if not data.description.strip():fail('description','Informe a descrição.')
            values={'account_id':data.account_id,'direction':data.direction,'description':data.description.strip(),'occurred_on':str(data.occurred_on),'amount_cents':money(data.amount,True),'category':data.category.strip()}
        else:
            check_date(data.issued_on)
            if not data.number.strip() or not data.supplier.strip():fail('invoice','Informe número e fornecedor.')
            if data.entry_id and not c.execute('SELECT 1 FROM finance_entries WHERE id=?',(data.entry_id,)).fetchone():fail('entry','Lançamento não encontrado.',404)
            if data.file_id and not c.execute('SELECT 1 FROM finance_files WHERE id=?',(data.file_id,)).fetchone():fail('file','Anexo não encontrado.',404)
            values={'number':data.number.strip(),'supplier':data.supplier.strip(),'issued_on':str(data.issued_on),'amount_cents':money(data.amount,True),'entry_id':data.entry_id,'file_id':data.file_id}
        return save(c,'finance_'+kind,'finance',data,values,user,rid)
@router.post('/accounts')
def add_account(data:Account,user=Depends(write)):return persist('accounts',data,user)
@router.put('/accounts/{rid}')
def edit_account(rid:str,data:Account,user=Depends(write)):return persist('accounts',data,user,rid)
@router.post('/entries')
def add_entry(data:Entry,user=Depends(write)):return persist('entries',data,user)
@router.put('/entries/{rid}')
def edit_entry(rid:str,data:Entry,user=Depends(write)):return persist('entries',data,user,rid)
@router.post('/invoices')
def add_invoice(data:Invoice,user=Depends(write)):return persist('invoices',data,user)
@router.put('/invoices/{rid}')
def edit_invoice(rid:str,data:Invoice,user=Depends(write)):return persist('invoices',data,user,rid)
@router.delete('/{kind}/{rid}')
def remove(kind:str,rid:str,version:int=Query(ge=1),user=Depends(admin)):
    if kind not in ('accounts','entries','invoices'):fail('kind','Registro inválido.',404)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if kind=='accounts' and c.execute('SELECT 1 FROM finance_entries WHERE account_id=? AND active=1',(rid,)).fetchone():fail('account','Esta conta possui lançamentos ativos e não pode ser arquivada.',409)
        return archive(c,'finance_'+kind,'finance',rid,version,user)
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
