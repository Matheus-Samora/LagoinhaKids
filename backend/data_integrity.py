"""Personal registrations and reversible archive management; no physical deletion."""
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail
from .platform_access import allowed
from .record_policy import TABLES,manager,global_manager,can_change,check_scope,personal_records
from .modules.common import archive,change,encrypt_text,decrypt_text,check_date,Record,save
from .modules.members.router import SelfRegister,Person,values
import secrets
router=APIRouter(prefix='/api/platform')

@router.get('/my-data')
def my_data(module:str='members',user=Depends(session)):
 with s.db() as c:
  result=personal_records(c,user,module)
  result['registrations']=[dict(r) for r in c.execute('SELECT id,name,family_name,birthday,phone,email,marital_status,profession,address,status,created_at,version FROM members_self_registrations WHERE owner_id=? ORDER BY created_at DESC LIMIT 50',(user['id'],))] if module=='members' else []
  for r in result['registrations']:r['address']=decrypt_text(r.get('address',''))
  result['applications']=[{'id':r['id'],'name':r['target_name'],'status':r['status']} for r in c.execute("SELECT id,target_name,status FROM sector_applications WHERE user_id=? AND target_type=? ORDER BY created_at DESC LIMIT 50",(user['id'],'gc' if module=='members' else 'ministry'))] if module in ('members','ministries') else []
  result['profile']=[{k:(decrypt_text(r[k]) if k=='address' else r[k]) for k in ('id','name','phone','birthday','address','profession','marital_status','version')} for r in c.execute('SELECT * FROM members_people WHERE account_user_id=? AND active=1',(user['id'],))] if module=='members' else []
  return result

@router.post('/my-registration')
def own_registration(data:SelfRegister,user=Depends(session)):
 from .modules.members.router import submit_self_registration
 return submit_self_registration(data,user=user)

@router.put('/my-profile/{rid}')
def own_profile(rid:str,data:SelfRegister,version:int=Query(ge=1),user=Depends(session)):
 with s.db() as c:
  c.execute('BEGIN IMMEDIATE')
  old=c.execute('SELECT * FROM members_people WHERE id=? AND active=1',(rid,)).fetchone()
  if not old:fail('missing','Cadastro não encontrado.',404)
  can_change(c,user,'members',dict(old))
  if old['account_user_id']!=user['id'] and not global_manager(c,user):fail('owner','Este não é seu cadastro pessoal.',403)
  from .modules.common import preserve_omitted
  data=preserve_omitted(data,old)
  check_date(data.birthday)
  if not data.name.strip():fail('name','Informe seu nome.')
  return save(c,'members_people','members',Record(version=version),{'name':data.name.strip(),'birthday':data.birthday.isoformat() if data.birthday else None,'phone':data.phone.strip(),'address':encrypt_text(data.address),'profession':data.profession.strip(),'marital_status':data.marital_status.strip()},user,rid)

@router.delete('/my-registration/{rid}')
def cancel_registration(rid:str,user=Depends(session)):
 with s.db() as c:
  c.execute('BEGIN IMMEDIATE')
  r=c.execute('SELECT * FROM members_self_registrations WHERE id=?',(rid,)).fetchone()
  if not r:fail('missing','Cadastro não encontrado.',404)
  if r['owner_id']!=user['id'] and not global_manager(c,user):fail('owner','Cadastro de outro usuário.',403)
  if r['status']=='approved':fail('approved','O cadastro já foi aprovado. Atualize o perfil pessoal.',409)
  c.execute("UPDATE members_self_registrations SET status='withdrawn' WHERE id=?",(rid,));s.audit(c,user['id'],'members:own_registration_withdrawn:'+rid)
  return {'ok':True}

@router.delete('/my-application/{rid}')
def withdraw_application(rid:str,user=Depends(session)):
 with s.db() as c:
  c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT * FROM sector_applications WHERE id=?',(rid,)).fetchone()
  if not r:fail('missing','Solicitação não encontrada.',404)
  if r['user_id']!=user['id'] and not global_manager(c,user):fail('owner','Solicitação de outro usuário.',403)
  if r['status']!='pending':fail('status','Esta solicitação já foi analisada.',409)
  c.execute("UPDATE sector_applications SET status='withdrawn' WHERE id=?",(rid,));s.audit(c,user['id'],'application_withdrawn:'+rid)
  return {'ok':True}

def table_for(module,kind):
 table=TABLES.get(module,{}).get(kind)
 if not table:fail('kind','Tipo de registro inválido.',404)
 return table

def validate_links(c,module,kind,row,restoring=False):
 rid=row['id']
 if restoring:
  if module=='members' and kind=='people' and row.get('account_user_id') and c.execute('SELECT 1 FROM members_people WHERE account_user_id=? AND active=1',(row['account_user_id'],)).fetchone():fail('duplicate','Esta conta já possui outro cadastro pessoal ativo.',409)
  links={'members':{'people':(('family_id','members_families'),('cell_id','members_cells')),'families':(('cell_id','members_cells'),)},'ministries':{'assignments':(('person_id','members_people'),),'schedules':(('person_id','members_people'),)},'finance':{'entries':(('account_id','finance_accounts'),('cost_center_id','finance_cost_centers')),'closings':(('account_id','finance_accounts'),),'invoices':(('entry_id','finance_entries'),)}}
  for field,parent in links.get(module,{}).get(kind,()):
   if row.get(field) and not c.execute(f'SELECT 1 FROM {parent} WHERE id=? AND active=1',(row[field],)).fetchone():fail('reference','Restaure primeiro o cadastro relacionado.',409)
  if module=='ministries' and kind=='assignments' and c.execute('SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1',(row['person_id'],row['ministry'])).fetchone():fail('duplicate','Este vínculo já está ativo.',409)
  if module=='ministries' and kind=='schedules' and c.execute("SELECT 1 FROM ministries_schedules WHERE person_id=? AND service_date=? AND service_time=? AND active=1 AND status!='declined'",(row['person_id'],row['service_date'],row['service_time'])).fetchone():fail('schedule','Já existe uma escala ativa nesse horário.',409)
 else:
  links={('members','cells'):(('members_people','cell_id'),('members_families','cell_id')),('members','families'):(('members_people','family_id'),),('members','people'):(('ministries_assignments','person_id'),('ministries_schedules','person_id')),('finance','accounts'):(('finance_entries','account_id'),('finance_service_closings','account_id')),('finance','cost-centers'):(('finance_entries','cost_center_id'),),('finance','entries'):(('finance_service_closings','entry_id'),('finance_invoices','entry_id'))}
  for child,field in links.get((module,kind),()):
   if c.execute(f'SELECT 1 FROM {child} WHERE {field}=? AND active=1',(rid,)).fetchone():fail('reference','Há registros ativos vinculados. Resolva os vínculos antes de arquivar.',409)

@router.get('/archives/{module}')
def archived(module:str,page:int=Query(1,ge=1,le=100000),user=Depends(session)):
 if module not in TABLES:fail('module','Setor inválido.',404)
 with s.db() as c:
  if not allowed(c,user,module):fail('module_access','Acesso ao setor não autorizado.',403)
  result=[]
  for kind,table in TABLES[module].items():
   clauses=['active=0'];params=[]
   if not manager(c,user,module):clauses+=['created_by=?'];params.append(user['id'])
   if module=='ministries' and not global_manager(c,user):
    scope=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
    if scope and scope['scope']:clauses+=['ministry=?'];params.append(scope['scope'])
   for r in c.execute(f"SELECT * FROM {table} WHERE "+' AND '.join(clauses)+' ORDER BY created_at DESC LIMIT 50 OFFSET ?',(*params,(page-1)*50)):
    d=dict(r);result.append({'id':d['id'],'kind':kind,'version':d['version'],'label':d.get('name') or d.get('title') or d.get('description') or d.get('service_name') or d.get('number') or kind})
  return {'items':result,'page':page,'has_more':len(result)>=50}

class Mutation(BaseModel):version:int=Field(ge=1)
@router.post('/records/{module}/{kind}/{rid}/archive')
def archive_record(module:str,kind:str,rid:str,data:Mutation,user=Depends(session)):
 table=table_for(module,kind)
 with s.db() as c:
  c.execute('BEGIN IMMEDIATE');raw=c.execute(f'SELECT * FROM {table} WHERE id=? AND active=1',(rid,)).fetchone()
  if not raw:fail('missing','Registro não encontrado.',404)
  row=dict(raw);can_change(c,user,module,row);validate_links(c,module,kind,row)
  if row['version']!=data.version:fail('conflict','O registro mudou. Atualize a tela.',409)
  if module=='finance' and kind=='closings' and row.get('entry_id'):
   entry=c.execute('SELECT * FROM finance_entries WHERE id=? AND active=1',(row['entry_id'],)).fetchone()
   if entry:archive(c,'finance_entries','finance',entry['id'],entry['version'],user)
  return archive(c,table,module,rid,data.version,user)

@router.post('/records/{module}/{kind}/{rid}/restore')
def restore_record(module:str,kind:str,rid:str,data:Mutation,user=Depends(session)):
 table=table_for(module,kind)
 with s.db() as c:
  c.execute('BEGIN IMMEDIATE');raw=c.execute(f'SELECT * FROM {table} WHERE id=? AND active=0',(rid,)).fetchone()
  if not raw:fail('missing','Registro arquivado não encontrado.',404)
  row=dict(raw);can_change(c,user,module,row)
  if row['version']!=data.version:fail('conflict','O registro mudou. Atualize a tela.',409)
  validate_links(c,module,kind,row,True)
  if module=='finance' and kind=='entries' and c.execute('SELECT 1 FROM finance_service_closings WHERE entry_id=?',(rid,)).fetchone():fail('closing','Restaure pelo fechamento do culto vinculado.',409)
  if module=='finance' and kind=='closings' and row.get('entry_id'):
   entry=c.execute('SELECT * FROM finance_entries WHERE id=?',(row['entry_id'],)).fetchone()
   if not entry:fail('closing','Lançamento vinculado não encontrado.',409)
   if not entry['active']:
    can_change(c,user,'finance',dict(entry));validate_links(c,'finance','entries',dict(entry),True)
    c.execute('UPDATE finance_entries SET active=1,version=version+1 WHERE id=?',(entry['id'],));change(c,'finance',entry['id'],'restored',user,dict(entry),dict(entry,active=1,version=entry['version']+1))
  changed=c.execute(f'UPDATE {table} SET active=1,version=version+1 WHERE id=? AND version=? AND active=0',(rid,data.version))
  if changed.rowcount!=1:fail('conflict','O registro mudou. Atualize a tela.',409)
  change(c,module,rid,'restored',user,row,dict(row,active=1,version=row['version']+1))
  return {'ok':True}
