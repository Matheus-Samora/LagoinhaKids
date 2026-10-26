from ...person_identity import linked_person
from datetime import date
import secrets
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from ...module_security import module_access
from ... import store as s
from ...app import fail,session
from ..common import Record,save,archive,current,check_date,change,encrypt_text,decrypt_text,merge_existing
router=APIRouter(prefix='/api/members',tags=['Members'])
read=module_access('members');write=module_access('members',('admin','editor'));admin=module_access('members',('admin',))
STAGES=('visitor','welcoming','new_convert','gc','baptized','in_training','active_member','serving','leader')

class Cell(Record):
    name:str=Field(min_length=2,max_length=120)
    leader_name:str=Field(default='',max_length=120)
    neighborhood:str=Field(default='',max_length=120)
    meeting_day:str=Field(default='',max_length=80)
    address:str=Field(default='',max_length=240)
    banner_url:str=Field(default='',max_length=500)

class Family(Record):
    name:str=Field(min_length=2,max_length=120)
    joined_on:date|None=None
    cell_id:str|None=Field(default=None,max_length=40)
    neighborhood:str=Field(default='',max_length=120)

class Person(Record):
    name:str=Field(min_length=2,max_length=120)
    joined_on:date|None=None
    family_id:str|None=Field(default=None,max_length=40)
    cell_id:str|None=Field(default=None,max_length=40)
    relationship:str=Field(default='',max_length=60)
    birthday:date|None=None
    phone:str=Field(default='',max_length=30)
    email:str=Field(default='',max_length=200)
    integration_stage:str=Field(default='active_member',max_length=40)
    baptism_date:date|None=None
    origin_church:str=Field(default='',max_length=120)
    marital_status:str=Field(default='',max_length=40)
    profession:str=Field(default='',max_length=100)
    address:str=Field(default='',max_length=240)
    pastoral_notes:str=Field(default='',max_length=600)
    account_user_id:int|None=None

class SelfRegister(BaseModel):
    version:int|None=Field(default=None,ge=1)
    name:str=Field(min_length=2,max_length=120)
    family_name:str=Field(default='',max_length=120)
    birthday:date|None=None
    phone:str=Field(default='',max_length=30)
    email:str=Field(default='',max_length=200)
    marital_status:str=Field(default='',max_length=40)
    profession:str=Field(default='',max_length=100)
    address:str=Field(default='',max_length=240)
    integration_stage:str=Field(default='visitor',max_length=40)
    cell_id:str|None=Field(default=None,max_length=60)

def values(data):
    out={k:(v.isoformat() if isinstance(v,date) else v.strip() if isinstance(v,str) else v) for k,v in data.model_dump(exclude={'version','request_id'}).items()}
    for key in ('pastoral_notes','address'):
        if out.get(key):out[key]=encrypt_text(out[key])
    return out

def _decrypt_person(d:dict)->dict:
    if d.get('pastoral_notes'):d['pastoral_notes']=decrypt_text(d['pastoral_notes'])
    if d.get('address'):d['address']=decrypt_text(d['address'])
    return d

@router.get('')
def listing(q:str=Query(default='',max_length=100),page:int=Query(default=1,ge=1),limit:int=Query(default=50,ge=1,le=200),user=Depends(module_access('members'))):
    with s.db() as c:
        from ...record_policy import manager,personal_records
        from ...record_policy import allowed
        if not allowed(c,user,'members') and not manager(c,user,'members'):return personal_records(c,user,'members')
        cells=[dict(r) for r in c.execute('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count,(SELECT count(*) FROM members_families f WHERE f.cell_id=mc.id AND f.active=1) family_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name LIMIT 300')]
        families=[dict(r) for r in c.execute("SELECT f.*,coalesce(mc.name,'') cell_name,(SELECT count(*) FROM members_people p WHERE f.id=p.family_id AND p.active=1) member_count FROM members_families f LEFT JOIN members_cells mc ON mc.id=f.cell_id WHERE f.active=1 ORDER BY f.name LIMIT 500")]
        people=[_decrypt_person(dict(r)) for r in c.execute("SELECT p.*,coalesce(f.name,'Sem família vinculada') family_name,coalesce(mc.name,'') cell_name FROM members_people p LEFT JOIN members_families f ON f.id=p.family_id LEFT JOIN members_cells mc ON mc.id=p.cell_id WHERE p.active=1 AND lower(p.name) LIKE ? ORDER BY p.name,p.id LIMIT ? OFFSET ?",('%'+q.lower()+'%',limit+1,(page-1)*limit))]
        has_more=len(people)>limit;people=people[:limit]
        from ...record_policy import global_manager
        if not global_manager(c,user):
            from ...privacy import operational_person
            people=[operational_person(person,user) for person in people]
            for person in people:person.pop('pastoral_notes',None)
        self_regs=[_decrypt_person(dict(r)) for r in c.execute("SELECT * FROM members_self_registrations WHERE status='pending' ORDER BY created_at DESC LIMIT 100")]
        if not global_manager(c,user):
            for reg in self_regs:
                if reg.get('owner_id')!=user['id']:
                    for key in ('birthday','phone','email','address','marital_status','profession','family_name'):reg.pop(key,None)
        gc_apps=[]
        for r in c.execute("SELECT * FROM sector_applications WHERE target_type='gc' AND status='pending' ORDER BY created_at DESC LIMIT 100"):
            d=dict(r);d['notes']=decrypt_text(d.get('notes',''))
            if not global_manager(c,user) and d.get('user_id')!=user['id']:
                for key in ('email','phone','notes'):d.pop(key,None)
            gc_apps.append(d)
        my_p=linked_person(c,user)
        return {
            'pastoral_notes_allowed':bool(global_manager(c,user)),
            'page':page,'has_more':has_more,
            'statistics':{'stages':{r['integration_stage']:r['n'] for r in c.execute('SELECT integration_stage,count(*) n FROM members_people WHERE active=1 GROUP BY integration_stage')},'birthdays_month':c.execute("SELECT count(*) FROM members_people WHERE active=1 AND substr(birthday,6,2)=?",(s.today()[5:7],)).fetchone()[0] if global_manager(c,user) else None},
            'cells':cells,
            'families':families,
            'people':people,
            'self_registrations':self_regs,
            'gc_applications':gc_apps,
            'total_people':c.execute('SELECT count(*) FROM members_people WHERE active=1').fetchone()[0],
            'total_families':c.execute('SELECT count(*) FROM members_families WHERE active=1').fetchone()[0],
            'total_cells':c.execute('SELECT count(*) FROM members_cells WHERE active=1').fetchone()[0],
            'my_person_id':my_p['id'] if my_p else None
        }

def persist(kind,data,user,rid=None):
    if not data.name.strip():fail('name','Informe o nome.')
    if hasattr(data,'joined_on'):check_date(data.joined_on)
    if isinstance(data,Person):
        check_date(data.birthday)
        check_date(data.baptism_date)
        if data.email and ('@' not in data.email or ' ' in data.email):fail('email','Confira o e-mail.')
        if data.integration_stage not in STAGES:fail('integration_stage','Estágio de integração inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if getattr(data,'cell_id',None):current(c,'members_cells',data.cell_id)
        if isinstance(data,Person) and data.family_id:current(c,'members_families',data.family_id)
        from ...record_policy import global_manager
        provided=set(data.model_fields_set)
        if isinstance(data,Person) and not global_manager(c,user) and 'account_user_id' in provided:
            fail('profile_link','Somente TI e pastores podem vincular cadastros a contas de acesso.',403)
        if isinstance(data,Person) and rid and not global_manager(c,user):
            from ...privacy import own_person,PROFILE_FIELDS
            old=current(c,'members_people',rid)
            if not own_person(old,user):
                protected=provided & PROFILE_FIELDS
                if protected:fail('profile_privacy','Dados pessoais de outros membros são restritos à administração e aos pastores.',403)
        data=merge_existing(c,'members_'+kind,data,user,rid)
        payload=values(data)
        if isinstance(data,Person) and not global_manager(c,user):
            if 'pastoral_notes' in provided and data.pastoral_notes.strip():fail('pastoral_notes','Anotações pastorais são exclusivas de TI e Pastores.',403)
            payload.pop('pastoral_notes',None)
        return save(c,'members_'+kind,'members',data,payload,user,rid)

@router.post('/cells')
def create_cell(data:Cell,user=Depends(write)):return persist('cells',data,user)
@router.put('/cells/{rid}')
def edit_cell(rid:str,data:Cell,user=Depends(write)):return persist('cells',data,user,rid)
@router.delete('/cells/{rid}')
def delete_cell(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute('UPDATE members_people SET cell_id=NULL WHERE cell_id=?',(rid,))
        c.execute('UPDATE members_families SET cell_id=NULL WHERE cell_id=?',(rid,))
        return archive(c,'members_cells','members',rid,version,user)

@router.post('/families')
def create_family(data:Family,user=Depends(write)):return persist('families',data,user)
@router.put('/families/{rid}')
def edit_family(rid:str,data:Family,user=Depends(write)):return persist('families',data,user,rid)
@router.post('/people')
def create_person(data:Person,user=Depends(write)):return persist('people',data,user)
@router.put('/people/{rid}')
def edit_person(rid:str,data:Person,user=Depends(read)):
    with s.db() as c:
        from ...record_policy import manager
        is_mgr=manager(c,user,'members')
        if not is_mgr:
            p_row=current(c,'members_people',rid)
            is_self=(p_row['account_user_id']==user['id'] or (p_row['email'] and p_row['email'].lower()==user['email'].lower()))
            if not is_self:
                fail('forbidden','Você só pode alterar seus próprios dados de membro.',403)
    return persist('people',data,user,rid)

@router.post('/self-register')
def submit_self_registration(data:SelfRegister,user=Depends(session)):
    if not data.name.strip():fail('name','Informe seu nome completo.')
    check_date(data.birthday)
    if data.email and ('@' not in data.email or ' ' in data.email):fail('email','Confira o e-mail.')
    from ...record_policy import manager
    with s.db() as c:responsible=manager(c,user,'members')
    if not responsible:data=data.model_copy(update={'email':user['email'],'integration_stage':'visitor'})
    stage=data.integration_stage if data.integration_stage in STAGES else 'visitor'
    rid=secrets.token_hex(16)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        existing=c.execute("SELECT * FROM members_self_registrations WHERE owner_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1",(user['id'],)).fetchone()
        if existing:
            from ..common import preserve_omitted
            data=preserve_omitted(data,existing)
            stage=data.integration_stage if data.integration_stage in STAGES else 'visitor'
        fields={'name':data.name.strip(),'family_name':data.family_name.strip(),'birthday':data.birthday.isoformat() if data.birthday else None,'phone':data.phone.strip(),'email':data.email.strip(),'marital_status':data.marital_status.strip(),'profession':data.profession.strip(),'address':encrypt_text(data.address),'integration_stage':stage}
        if existing:
            rid=existing['id']
            if all(existing[k]==v for k,v in fields.items() if k!='address') and decrypt_text(existing['address'])==data.address.strip():return {'id':rid,'ok':True,'message':'Cadastro já enviado para análise.'}
            if data.version!=existing['version']:fail('conflict','Seu cadastro mudou. Recarregue antes de salvar.',409)
            c.execute('UPDATE members_self_registrations SET '+','.join(k+'=?' for k in fields)+',version=version+1 WHERE id=? AND version=?',(*fields.values(),rid,data.version))
        else:
            c.execute('INSERT INTO members_self_registrations(id,'+','.join(fields)+",status,created_at,owner_id) VALUES("+','.join('?' for _ in range(len(fields)+4))+')',(rid,*fields.values(),'pending',s.now(),user['id']))
        after=c.execute('SELECT * FROM members_self_registrations WHERE id=?',(rid,)).fetchone()
        change(c,'members',rid,'registration_updated' if existing else 'registration_created',user,dict(existing) if existing else None,dict(after))
        if data.cell_id:
            cell=c.execute('SELECT id,name FROM members_cells WHERE id=? AND active=1',(data.cell_id.strip(),)).fetchone()
            if cell and not c.execute("SELECT 1 FROM sector_applications WHERE user_id=? AND target_type='gc' AND target_id=? AND status='pending'",(user['id'],cell['id'])).fetchone():
                c.execute(
                    'INSERT INTO sector_applications(id,user_id,member_name,phone,email,target_type,target_id,target_name,role_desired,notes,status,reviewed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (secrets.token_hex(16),user['id'],data.name.strip(),data.phone.strip(),data.email.strip(),'gc',cell['id'],cell['name'],'Participante de GC',encrypt_text('Solicitado via ficha de auto-cadastro'),'pending',None,s.now())
                )
    return {'id':rid,'ok':True,'message':'Cadastro enviado para a secretaria com sucesso!'}

@router.post('/self-registrations/{rid}/approve')
def approve_self_registration(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        reg=c.execute("SELECT * FROM members_self_registrations WHERE id=? AND status='pending'",(rid,)).fetchone()
        if not reg:fail('missing','Solicitação pendente não encontrada.',404)
        linked=c.execute('SELECT * FROM members_people WHERE account_user_id=? AND active=1',(reg['owner_id'],)).fetchall() if reg['owner_id'] is not None else []
        if len(linked)>1:fail('identity','Há cadastros duplicados desta conta. Solicite revisão à TI.',409)
        old=dict(linked[0]) if linked else None
        fam_id=old['family_id'] if old else None
        fam_name=(reg['family_name'] or '').strip()
        # A surname is not proof of family identity. Preserve explicit links.
        if fam_name and not fam_id:
            fam_id=save(c,'members_families','members',Family(name=fam_name),{'name':fam_name,'joined_on':None,'cell_id':None,'neighborhood':''},user)['id']
        person_vals={
            'name':reg['name'],'joined_on':None,'family_id':fam_id,'cell_id':None,
            'relationship':'Titular','birthday':reg['birthday'],'phone':reg['phone'] or '',
            'email':reg['email'] or '','integration_stage':reg['integration_stage'] or 'visitor',
            'baptism_date':None,'origin_church':'','marital_status':reg['marital_status'] or '',
            'profession':reg['profession'] or '','address':reg['address'] or '',
            'pastoral_notes':encrypt_text('Auto-cadastro aprovado')
        }
        if old:
            # Complete the explicit account record without erasing ministry/GC history.
            person_vals={k:(old[k] if k not in ('name','family_id') and old.get(k) not in (None,'') else v) for k,v in person_vals.items()}
        p_res=save(c,'members_people','members',Person(name=reg['name'],version=old['version'] if old else None),person_vals,user,old['id'] if old else None)
        if reg['owner_id'] is not None:
            c.execute('UPDATE members_people SET created_by=?,account_user_id=? WHERE id=?',(reg['owner_id'],reg['owner_id'],p_res['id']))
        c.execute("UPDATE members_self_registrations SET status='approved',person_id=? WHERE id=?",(p_res['id'],rid))
        s.audit(c,user['id'],'members:self_reg_approved:'+rid)
        return {'ok':True,'person_id':p_res['id'],'family_id':fam_id}

@router.delete('/self-registrations/{rid}')
def reject_self_registration(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        row=c.execute('SELECT status FROM members_self_registrations WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Solicitação não encontrada.',404)
        if row['status']=='rejected':return {'ok':True}
        if row['status']!='pending':fail('state','A solicitação já foi concluída.',409)
        c.execute("UPDATE members_self_registrations SET status='rejected' WHERE id=?",(rid,))
        s.audit(c,user['id'],'members:self_reg_rejected:'+rid)
        return {'ok':True}

@router.post('/gc-applications/{rid}/approve')
def approve_gc_application(rid:str,user=Depends(write)):
    from ...application_workflow import decide
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        return decide(c,user,rid,True)

@router.delete('/gc-applications/{rid}')
def reject_gc_application(rid:str,user=Depends(write)):
    from ...application_workflow import decide
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        return decide(c,user,rid,False)

@router.delete('/families/{rid}')
def delete_family(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM members_people WHERE family_id=? AND active=1',(rid,)).fetchone():fail('family','Transfira ou arquive os integrantes antes de arquivar a família.',409)
        return archive(c,'members_families','members',rid,version,user)
@router.delete('/people/{rid}')
def delete_person(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        result=archive(c,'members_people','members',rid,version,user)
        for row in c.execute('SELECT * FROM ministries_assignments WHERE person_id=? AND active=1',(rid,)).fetchall():
            archive(c,'ministries_assignments','ministries',row['id'],row['version'],user)
        return result




@router.get('/hall')
def hall_of_members(q:str=Query(default='',max_length=100),ministry:str=Query(default='',max_length=50),cell_id:str=Query(default='',max_length=50),user=Depends(session)):
    from ...hall import directory,participant
    participant(user)
    return directory(q=q,ministry=ministry,page=1,user=user)
