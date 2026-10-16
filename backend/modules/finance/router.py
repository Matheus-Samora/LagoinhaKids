from datetime import date,timedelta
from decimal import Decimal
import csv,io,secrets,json,html as html_lib
from fastapi import APIRouter,Depends,Query,UploadFile,File,Response
from pydantic import Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,money,save,archive,current,check_date,change,encrypt_text,decrypt_text
router=APIRouter(prefix='/api/finance',tags=['Finance'])
read=module_access('finance');write=module_access('finance',('admin','editor'));admin=module_access('finance',('admin',))

class SafeCsvWriter:
    def __init__(self,stream):self.writer=csv.writer(stream,delimiter=';')
    def writerow(self,values):
        # Exported user text must not become a spreadsheet formula.
        self.writer.writerow(["'"+v if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@')) else v for v in values])

def json_number(value):
    if isinstance(value,Decimal):return int(value) if value==value.to_integral_value() else str(value)
    raise TypeError('Tipo não suportado no relatório financeiro.')

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

def compute_financial_engine(c,accounts,cost_centers,entries,totals):
    today_str=s.today()
    selected={a['id'] for a in accounts}
    entries=[dict(r) for r in c.execute('SELECT * FROM finance_entries WHERE active=1') if r['account_id'] in selected]
    current_balance=sum(int(a.get('balance_cents') or 0) for a in accounts)
    income_paid=int(totals.get('income_cents') or 0)
    expense_paid=int(totals.get('expense_cents') or 0)
    pending_in=int(totals.get('pending_income_cents') or 0)
    pending_out=int(totals.get('pending_expense_cents') or 0)

    # Pre-process by Bank
    bank_map={}
    for a in accounts:
        bname=(a.get('bank') or 'Caixa Interno / Tesouraria').strip()
        slot=bank_map.setdefault(bname,{'bank':bname,'accounts_count':0,'opening_cents':0,'balance_cents':0,'income_cents':0,'expense_cents':0,'pending_in_cents':0,'pending_out_cents':0})
        slot['accounts_count']+=1
        slot['opening_cents']+=int(a.get('opening_cents') or 0)
        slot['balance_cents']+=int(a.get('balance_cents') or 0)

    acc_to_bank={a['id']:(a.get('bank') or 'Caixa Interno / Tesouraria').strip() for a in accounts}
    cat_map={}
    method_map={}
    overdue_count=0
    overdue_cents=0

    for e in entries:
        amt=int(e.get('amount_cents') or 0)
        st=e.get('payment_status') or 'paid'
        direction=e.get('direction') or 'income'
        bname=acc_to_bank.get(e.get('account_id'),'Caixa Interno / Tesouraria')
        bslot=bank_map.setdefault(bname,{'bank':bname,'accounts_count':0,'opening_cents':0,'balance_cents':0,'income_cents':0,'expense_cents':0,'pending_in_cents':0,'pending_out_cents':0})
        if st=='paid':
            if direction=='income':bslot['income_cents']+=amt
            else:bslot['expense_cents']+=amt
        else:
            if direction=='income':bslot['pending_in_cents']+=amt
            else:bslot['pending_out_cents']+=amt
            if e.get('due_date') and str(e['due_date'])<today_str:
                overdue_count+=1
                overdue_cents+=amt

        cat=(e.get('category') or 'Geral').strip()
        cslot=cat_map.setdefault(cat,{'category':cat,'income_cents':0,'expense_cents':0,'count':0})
        cslot['count']+=1
        if direction=='income':cslot['income_cents']+=amt
        else:cslot['expense_cents']+=amt

        m=(e.get('payment_method') or 'pix').strip()
        mslot=method_map.setdefault(m,{'method':m,'total_cents':0,'count':0})
        mslot['total_cents']+=amt
        mslot['count']+=1

    for bslot in bank_map.values():
        bslot['projected_balance_cents']=bslot['balance_cents']+bslot['pending_in_cents']-bslot['pending_out_cents']

    # Scheduled cash flow, using actual due dates, independent of search/list limits.
    def projection(days):
        end=(date.fromisoformat(today_str)+timedelta(days=days)).isoformat()
        return current_balance+sum((1 if e['direction']=='income' else -1)*int(e['amount_cents']) for e in entries if e.get('payment_status')=='pending' and (e.get('due_date') or e['occurred_on'])<=end)
    projected_30d,projected_60d,projected_90d=(projection(d) for d in (30,60,90))
    since=(date.fromisoformat(today_str)-timedelta(days=89)).isoformat()
    recent=[e for e in entries if (e.get('payment_status') or 'paid')=='paid' and since<=e['occurred_on']<=today_str]
    income_paid=sum(int(e['amount_cents']) for e in recent if e['direction']=='income')//3
    expense_paid=sum(int(e['amount_cents']) for e in recent if e['direction']=='expense')//3

    alerts=[]
    if overdue_count>0:
        alerts.append({'level':'warning','title':f'{overdue_count} título(s) vencido(s)','detail':f'Total pendente em atraso: R$ {overdue_cents/100:,.2f}'})
    for cc in cost_centers:
        b_cents=int(cc.get('budget_cents') or 0)
        s_cents=int(cc.get('spent_cents') or 0)
        if b_cents>0 and s_cents>=int(b_cents*0.8):
            pct=round((s_cents/b_cents)*100)
            alerts.append({'level':'danger' if pct>=100 else 'warning','title':f"Orçamento {cc['name']}: {pct}% consumido",'detail':f"Executado R$ {s_cents/100:,.2f} de R$ {b_cents/100:,.2f}"})
    if projected_30d<0:
        alerts.append({'level':'danger','title':'Projeção de caixa negativa em 30 dias','detail':'As obrigações pendentes superam o saldo disponível atual.'})
    if not alerts:
        alerts.append({'level':'ok','title':'Fluxo financeiro equilibrado','detail':'Nenhuma pendência em atraso ou estouro de centro de custo detectado.'})

    return {
        'current_balance_cents':current_balance,
        'projected_30d_cents':projected_30d,
        'projected_60d_cents':projected_60d,
        'projected_90d_cents':projected_90d,
        'monthly_avg_income_cents':income_paid,
        'monthly_avg_expense_cents':expense_paid,
        'overdue_count':overdue_count,
        'overdue_cents':overdue_cents,
        'by_bank':list(bank_map.values()),
        'by_category':sorted(cat_map.values(),key=lambda x:x['income_cents']+x['expense_cents'],reverse=True)[:10],
        'by_method':list(method_map.values()),
        'alerts':alerts
    }

@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        cost_centers=[dict(r) for r in c.execute("SELECT cc.*,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='expense' AND e.active=1),0) spent_cents,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='income' AND e.active=1),0) income_cents FROM finance_cost_centers cc WHERE cc.active=1 ORDER BY cc.name LIMIT 200")]
        accounts=[dict(r) for r in c.execute("SELECT a.*,a.opening_cents+coalesce((SELECT sum(CASE WHEN e.direction='income' THEN e.amount_cents ELSE -e.amount_cents END) FROM finance_entries e WHERE e.account_id=a.id AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) balance_cents FROM finance_accounts a WHERE a.active=1 ORDER BY a.name LIMIT 500")]
        entries=[dict(r) for r in c.execute("SELECT e.*,a.name account_name,coalesce(a.bank,'') account_bank,coalesce(cc.name,'') cost_center_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE e.active=1 AND lower(e.description) LIKE ? ORDER BY e.occurred_on DESC,e.created_at DESC LIMIT 200",('%'+q.lower()+'%',))]
        closings=[]
        for r in c.execute('SELECT sc.*,a.name account_name FROM finance_service_closings sc JOIN finance_accounts a ON a.id=sc.account_id WHERE sc.active=1 ORDER BY sc.service_date DESC,sc.created_at DESC LIMIT 100'):
            d=dict(r);d['notes']=decrypt_text(d.get('notes',''));closings.append(d)
        invoices=[dict(r) for r in c.execute('SELECT * FROM finance_invoices WHERE active=1 AND (lower(supplier) LIKE ? OR lower(number) LIKE ?) ORDER BY issued_on DESC LIMIT 200',('%'+q.lower()+'%','%'+q.lower()+'%'))]
        totals=dict(c.execute("SELECT coalesce(sum(CASE WHEN direction='income' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) income_cents,coalesce(sum(CASE WHEN direction='expense' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) expense_cents,coalesce(sum(CASE WHEN direction='income' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_income_cents,coalesce(sum(CASE WHEN direction='expense' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_expense_cents FROM finance_entries WHERE active=1").fetchone())
        engine=compute_financial_engine(c,accounts,cost_centers,entries,totals)
        return {'cost_centers':cost_centers,'accounts':accounts,'entries':entries,'closings':closings,'invoices':invoices,'totals':totals,'engine':engine,'mode':'predictive_engine'}

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
            if rid and c.execute('SELECT 1 FROM finance_service_closings WHERE entry_id=? AND active=1',(rid,)).fetchone():fail('closing','Edite este lançamento pelo borderô vinculado.',409)
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
            if not rid and data.request_id:
                existing=c.execute('SELECT id FROM finance_service_closings WHERE id=?',(str(data.request_id),)).fetchone()
                if existing:
                    rid=existing['id']
                    old=current(c,'finance_service_closings',rid)
                    if any(old[k]!=v for k,v in {'account_id':data.account_id,'service_name':data.service_name.strip(),'service_date':str(data.service_date),'tithes_cents':money(data.tithes),'offerings_cash_cents':money(data.offerings_cash),'offerings_pix_cents':money(data.offerings_pix),'offerings_card_cents':money(data.offerings_card),'counted_by':data.counted_by.strip(),'verified_by':data.verified_by.strip(),'notes':data.notes.strip()}.items() if k!='notes') or decrypt_text(old['notes'])!=data.notes.strip():fail('duplicate','Solicitação já utilizada.',409)
                    return {'ok':True,'id':rid}
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
            if data.counted_by.strip().casefold()==data.verified_by.strip().casefold():fail('conference','Informe dois responsáveis diferentes.')
            entry_desc=f"Borderô: {data.service_name.strip()} ({data.service_date})"
            existing_entry_id=None
            if rid:
                old_sc=current(c,'finance_service_closings',rid)
                existing_entry_id=old_sc.get('entry_id')
            if existing_entry_id and c.execute('SELECT 1 FROM finance_entries WHERE id=? AND active=1',(existing_entry_id,)).fetchone():
                linked=current(c,'finance_entries',existing_entry_id)
                save(c,'finance_entries','finance',Record(version=linked['version']),{'account_id':data.account_id,'description':entry_desc,'occurred_on':str(data.service_date),'amount_cents':tot_cents},user,existing_entry_id)
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
                'notes':encrypt_text(data.notes.strip()),'entry_id':entry_id
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
        if old['payment_status']=='paid':return {'ok':True,'id':rid}
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
        if t_suffix=='cost_centers' and c.execute('SELECT 1 FROM finance_entries WHERE cost_center_id=? AND active=1',(rid,)).fetchone():fail('cost_center','Este centro possui lançamentos ativos e não pode ser arquivado.',409)
        if t_suffix=='entries' and c.execute('SELECT 1 FROM finance_service_closings WHERE entry_id=? AND active=1',(rid,)).fetchone():fail('closing','Arquive o borderô vinculado para cancelar este lançamento.',409)
        if t_suffix=='service_closings':
            sc=current(c,'finance_service_closings',rid)
            if sc.get('entry_id'):
                en=c.execute('SELECT id,version FROM finance_entries WHERE id=? AND active=1',(sc['entry_id'],)).fetchone()
                if en:archive(c,'finance_entries','finance',en['id'],en['version'],user)
        return archive(c,'finance_'+t_suffix,'finance',rid,version,user)

@router.get('/export.csv')
def export_csv(user=Depends(read)):
    return generate_custom_report(format='csv',report_type='entries',start_date='',end_date='',account_id='',bank='',cost_center_id='',direction='all',payment_status='all',user=user)


@router.get('/report')
def generate_custom_report(
    format:str=Query(default='xlsx',pattern='^(xlsx|xls|csv|json|html)$'),
    report_type:str=Query(default='complete',pattern='^(complete|entries|banks|cost_centers|closings|forecast)$'),
    start_date:str=Query(default='',max_length=20),
    end_date:str=Query(default='',max_length=20),
    account_id:str=Query(default='',max_length=60),
    bank:str=Query(default='',max_length=100),
    cost_center_id:str=Query(default='',max_length=60),
    direction:str=Query(default='all',pattern='^(all|income|expense)$'),
    payment_status:str=Query(default='all',pattern='^(all|paid|pending)$'),
    user=Depends(read)
):
    for value in (start_date,end_date):
        if value:
            try:date.fromisoformat(value)
            except ValueError:fail('date','Informe uma data válida.')
    if start_date and end_date and start_date>end_date:fail('date','A data inicial deve vir antes da final.')
    with s.db() as c:
        accounts=[dict(r) for r in c.execute("SELECT a.*,a.opening_cents+coalesce((SELECT sum(CASE WHEN e.direction='income' THEN e.amount_cents ELSE -e.amount_cents END) FROM finance_entries e WHERE e.account_id=a.id AND e.active=1 AND coalesce(e.payment_status,'paid')='paid'),0) balance_cents FROM finance_accounts a WHERE a.active=1 ORDER BY a.name")]
        cost_centers=[dict(r) for r in c.execute("SELECT cc.*,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='expense' AND e.active=1),0) spent_cents,coalesce((SELECT sum(e.amount_cents) FROM finance_entries e WHERE e.cost_center_id=cc.id AND e.direction='income' AND e.active=1),0) income_cents FROM finance_cost_centers cc WHERE cc.active=1 ORDER BY cc.name")]
        closings=[dict(r) for r in c.execute('SELECT sc.*,a.name account_name,coalesce(a.bank,\'\') account_bank FROM finance_service_closings sc JOIN finance_accounts a ON a.id=sc.account_id WHERE sc.active=1 ORDER BY sc.service_date DESC')]
        for sc in closings:sc['notes']=decrypt_text(sc.get('notes',''))
        if account_id:accounts=[a for a in accounts if a['id']==account_id]
        if bank:accounts=[a for a in accounts if a['bank'].lower()==bank.lower()]
        chosen={a['id'] for a in accounts}
        closings=[sc for sc in closings if sc['account_id'] in chosen and (not start_date or sc['service_date']>=start_date) and (not end_date or sc['service_date']<=end_date)]
        if cost_center_id:cost_centers=[cc for cc in cost_centers if cc['id']==cost_center_id]
        sql="SELECT e.*,a.name account_name,coalesce(a.bank,'') account_bank,coalesce(cc.name,'') cost_center_name FROM finance_entries e JOIN finance_accounts a ON a.id=e.account_id LEFT JOIN finance_cost_centers cc ON cc.id=e.cost_center_id WHERE e.active=1"
        params=[]
        if start_date.strip():
            sql+=" AND e.occurred_on>=?";params.append(start_date.strip()[:10])
        if end_date.strip():
            sql+=" AND e.occurred_on<=?";params.append(end_date.strip()[:10])
        if account_id.strip():
            sql+=" AND e.account_id=?";params.append(account_id.strip())
        if bank.strip():
            sql+=" AND lower(a.bank)=?";params.append(bank.strip().lower())
        if cost_center_id.strip():
            sql+=" AND e.cost_center_id=?";params.append(cost_center_id.strip())
        if direction in ('income','expense'):
            sql+=" AND e.direction=?";params.append(direction)
        if payment_status in ('paid','pending'):
            sql+=" AND coalesce(e.payment_status,'paid')=?";params.append(payment_status)
        sql+=" ORDER BY e.occurred_on DESC,e.created_at DESC"
        entries=[dict(r) for r in c.execute(sql,params).fetchall()]
        totals=dict(c.execute("SELECT coalesce(sum(CASE WHEN direction='income' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) income_cents,coalesce(sum(CASE WHEN direction='expense' AND coalesce(payment_status,'paid')='paid' THEN amount_cents ELSE 0 END),0) expense_cents,coalesce(sum(CASE WHEN direction='income' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_income_cents,coalesce(sum(CASE WHEN direction='expense' AND payment_status='pending' THEN amount_cents ELSE 0 END),0) pending_expense_cents FROM finance_entries WHERE active=1").fetchone())
        engine=compute_financial_engine(c,accounts,cost_centers,entries,totals)

    if format=='json':
        payload={'generated_at':s.now(),'report_type':report_type,'filters':{'start_date':start_date,'end_date':end_date,'account_id':account_id,'bank':bank,'cost_center_id':cost_center_id,'direction':direction,'payment_status':payment_status},'engine':engine,'accounts':accounts,'cost_centers':cost_centers,'entries':entries,'closings':closings}
        return Response(json.dumps(payload,ensure_ascii=False,indent=2,default=json_number).encode('utf-8'),media_type='application/json',headers={'Content-Disposition':f'attachment; filename="lagoinha-finance-{report_type}.json"'})

    if format=='csv':
        buf=io.StringIO();buf.write('\ufeff');writer=SafeCsvWriter(buf)
        if report_type=='banks':
            writer.writerow(['Banco / Instituicao','Conta','Saldo Inicial (R$)','Saldo Atual Liquidado (R$)'])
            for a in accounts:
                writer.writerow([a['bank'] or 'Caixa Interno',a['name'],f"{a['opening_cents']/100:.2f}".replace('.',','),f"{a['balance_cents']/100:.2f}".replace('.',',')])
        elif report_type=='cost_centers':
            writer.writerow(['Centro de Custo','Ministerio','Orcamento (R$)','Saidas (R$)','Entradas (R$)'])
            for cc in cost_centers:
                writer.writerow([cc['name'],cc['ministry'] or 'Geral',f"{cc['budget_cents']/100:.2f}".replace('.',','),f"{cc['spent_cents']/100:.2f}".replace('.',','),f"{cc['income_cents']/100:.2f}".replace('.',',')])
        elif report_type=='closings':
            writer.writerow(['Data','Culto','Conta','Banco','Dizimos (R$)','Espécie (R$)','PIX (R$)','Cartao (R$)','Total (R$)','1o Conferente','2o Conferente'])
            for sc in closings:
                writer.writerow([sc['service_date'],sc['service_name'],sc['account_name'],sc['account_bank'] or '',f"{sc['tithes_cents']/100:.2f}".replace('.',','),f"{sc['offerings_cash_cents']/100:.2f}".replace('.',','),f"{sc['offerings_pix_cents']/100:.2f}".replace('.',','),f"{sc['offerings_card_cents']/100:.2f}".replace('.',','),f"{sc['total_cents']/100:.2f}".replace('.',','),sc['counted_by'],sc['verified_by']])
        else:
            writer.writerow(['Data','Vencimento','Tipo','Status','Banco','Conta','Centro de Custo','Categoria','Metodo','Descricao','Valor (R$)'])
            for r in entries:
                val=f"{r['amount_cents']/100:.2f}".replace('.',',')
                writer.writerow([
                    r['occurred_on'],r['due_date'] or '',
                    'Entrada' if r['direction']=='income' else 'Saida',
                    'Liquidado' if (r['payment_status'] or 'paid')=='paid' else 'Pendente',
                    r.get('account_bank') or 'Caixa',r['account_name'],r['cost_center_name'] or '',r['category'] or '',
                    r['payment_method'] or 'pix',r['description'],val
                ])
        fname='lagoinha-finance-relatorio.csv' if report_type=='entries' else f'lagoinha-finance-{report_type}.csv'
        return Response(buf.getvalue().encode('utf-8'),media_type='text/csv; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="{fname}"'})

    esc=lambda v:html_lib.escape(str(v or ''))
    fmt_brl=lambda cents:f"R$ {int(cents or 0)/100:,.2f}".replace(',','X').replace('.',',').replace('X','.')

    # Build rich HTML table document compatible with both Excel (.xls) and Executive Printable View (html)
    doc=f"""<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Financeiro · Lagoinha Finance</title>
    <style>
     body{{font-family:'Segoe UI',Arial,sans-serif;color:#09090b;margin:24px;}}
     h1{{font-size:20px;margin:0 0 4px;}} h2{{font-size:15px;margin:22px 0 8px;border-bottom:2px solid #18181b;padding-bottom:4px;}}
     .meta{{color:#52525b;font-size:12px;margin-bottom:16px;}}
     table{{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:12px;}}
     th{{background:#18181b;color:#ffffff;text-align:left;padding:8px;border:1px solid #27272a;}}
     td{{padding:7px 8px;border:1px solid #d4d4d8;}}
     .num{{text-align:right;font-weight:700;}} .inc{{color:#166534;}} .exp{{color:#991b1b;}}
     @media print{{.no-print{{display:none;}}}}
    </style></head><body>
    <div class="no-print" style="margin-bottom:16px;"><button onclick="window.print()" style="padding:8px 16px;background:#09090b;color:#fff;border:0;border-radius:8px;cursor:pointer;font-weight:700;">🖨️ Imprimir / Salvar como PDF</button></div>
    <h1>IGREJA BATISTA DA LAGOINHA · LAGOINHA FINANCE</h1>
    <div class="meta">Relatório Financeiro &amp; Previsão de Caixa ({esc(report_type.upper())}) · Emitido em {esc(s.now()[:19].replace('T',' '))}</div>
    <h2>1. Motor de Previsão Financeira &amp; Consolidação</h2>
    <table><thead><tr><th>Indicador</th><th>Valor</th></tr></thead><tbody>
     <tr><td>Saldo Consolidado Atual (Contas &amp; Bancos)</td><td class="num">{fmt_brl(engine['current_balance_cents'])}</td></tr>
     <tr><td>Previsão de Caixa — 30 Dias</td><td class="num">{fmt_brl(engine['projected_30d_cents'])}</td></tr>
     <tr><td>Previsão de Caixa — 60 Dias</td><td class="num">{fmt_brl(engine['projected_60d_cents'])}</td></tr>
     <tr><td>Previsão de Caixa — 90 Dias</td><td class="num">{fmt_brl(engine['projected_90d_cents'])}</td></tr>
    </tbody></table>"""

    if report_type in ('complete','banks','forecast'):
        doc+=f"""<h2>2. Posição Consolidada por Bancos e Contas Vinculadas</h2>
        <table><thead><tr><th>Banco / Instituição</th><th>Contas</th><th>Saldo Abertura</th><th>Entradas Pagas</th><th>Saídas Pagas</th><th>Saldo Atual</th><th>Projeção Líquida</th></tr></thead><tbody>
        {''.join(f"<tr><td>{esc(b['bank'])}</td><td>{b['accounts_count']}</td><td class='num'>{fmt_brl(b['opening_cents'])}</td><td class='num inc'>{fmt_brl(b['income_cents'])}</td><td class='num exp'>{fmt_brl(b['expense_cents'])}</td><td class='num'>{fmt_brl(b['balance_cents'])}</td><td class='num'>{fmt_brl(b['projected_balance_cents'])}</td></tr>" for b in engine['by_bank'])}
        </tbody></table>"""

    if report_type in ('complete','cost_centers'):
        doc+=f"""<h2>3. Execução Orçamentária por Centro de Custo</h2>
        <table><thead><tr><th>Centro de Custo</th><th>Ministério</th><th>Orçamento</th><th>Saídas Realizadas</th><th>Entradas Vinculadas</th></tr></thead><tbody>
        {''.join(f"<tr><td>{esc(cc['name'])}</td><td>{esc(cc['ministry'] or 'Geral')}</td><td class='num'>{fmt_brl(cc['budget_cents'])}</td><td class='num exp'>{fmt_brl(cc['spent_cents'])}</td><td class='num inc'>{fmt_brl(cc['income_cents'])}</td></tr>" for cc in cost_centers)}
        </tbody></table>"""

    if report_type in ('complete','entries'):
        doc+=f"""<h2>4. Extrato Detalhado de Lançamentos ({len(entries)} registros)</h2>
        <table><thead><tr><th>Data</th><th>Vencimento</th><th>Tipo</th><th>Status</th><th>Banco</th><th>Conta</th><th>Centro de Custo</th><th>Categoria</th><th>Método</th><th>Descrição</th><th>Valor</th></tr></thead><tbody>
        {''.join(f"<tr><td>{esc(r['occurred_on'])}</td><td>{esc(r['due_date'] or '—')}</td><td>{'Entrada' if r['direction']=='income' else 'Saída'}</td><td>{'Liquidado' if (r['payment_status'] or 'paid')=='paid' else 'Pendente'}</td><td>{esc(r.get('account_bank') or 'Caixa')}</td><td>{esc(r['account_name'])}</td><td>{esc(r['cost_center_name'] or '—')}</td><td>{esc(r['category'] or '—')}</td><td>{esc(r['payment_method'] or 'pix')}</td><td>{esc(r['description'])}</td><td class='num {'inc' if r['direction']=='income' else 'exp'}'>{fmt_brl(r['amount_cents'])}</td></tr>" for r in entries)}
        </tbody></table>"""

    if report_type in ('complete','closings') and closings:
        doc+=f"""<h2>5. Borderôs de Culto (Dupla Conferência)</h2>
        <table><thead><tr><th>Data</th><th>Culto</th><th>Conta / Banco</th><th>Dízimos</th><th>Espécie</th><th>PIX</th><th>Cartão</th><th>Total</th><th>Conferentes</th></tr></thead><tbody>
        {''.join(f"<tr><td>{esc(sc['service_date'])}</td><td>{esc(sc['service_name'])}</td><td>{esc(sc['account_name'])} ({esc(sc.get('account_bank') or 'Caixa')})</td><td class='num'>{fmt_brl(sc['tithes_cents'])}</td><td class='num'>{fmt_brl(sc['offerings_cash_cents'])}</td><td class='num'>{fmt_brl(sc['offerings_pix_cents'])}</td><td class='num'>{fmt_brl(sc['offerings_card_cents'])}</td><td class='num inc'>{fmt_brl(sc['total_cents'])}</td><td>{esc(sc['counted_by'])} &amp; {esc(sc['verified_by'])}</td></tr>" for sc in closings)}
        </tbody></table>"""

    doc+="</body></html>"
    if format in ('xlsx','xls'):
        from .workbook import from_html
        return Response(from_html(doc),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="lagoinha-finance-{report_type}.xlsx"'})
    if format=='xls':
        return Response(('\ufeff'+doc).encode('utf-8'),media_type='application/vnd.ms-excel; charset=utf-8',headers={'Content-Disposition':f'attachment; filename="lagoinha-finance-{report_type}.xls"'})
    return Response(doc.encode('utf-8'),media_type='text/html; charset=utf-8')

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

