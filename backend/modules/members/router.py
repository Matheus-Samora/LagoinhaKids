from datetime import date
import secrets
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,save,archive,current,check_date,change
router=APIRouter(prefix='/api/members',tags=['Members'])
read=module_access('members');write=module_access('members',('admin','editor'));admin=module_access('members',('admin',))
STAGES=('visitor','new_convert','baptized','in_training','active_member','leader')

class Cell(Record):
    name:str=Field(min_length=2,max_length=120)
    leader_name:str=Field(default='',max_length=120)
    neighborhood:str=Field(default='',max_length=120)
    meeting_day:str=Field(default='',max_length=80)

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

class SelfRegister(BaseModel):
    name:str=Field(min_length=2,max_length=120)
    family_name:str=Field(default='',max_length=120)
    birthday:date|None=None
    phone:str=Field(default='',max_length=30)
    email:str=Field(default='',max_length=200)
    marital_status:str=Field(default='',max_length=40)
    profession:str=Field(default='',max_length=100)
    address:str=Field(default='',max_length=240)
    integration_stage:str=Field(default='visitor',max_length=40)

def values(data):return {k:(v.isoformat() if isinstance(v,date) else v.strip() if isinstance(v,str) else v) for k,v in data.model_dump(exclude={'version','request_id'}).items()}

@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        cells=[dict(r) for r in c.execute('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count,(SELECT count(*) FROM members_families f WHERE f.cell_id=mc.id AND f.active=1) family_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name LIMIT 300')]
        families=[dict(r) for r in c.execute("SELECT f.*,coalesce(mc.name,'') cell_name,(SELECT count(*) FROM members_people p WHERE p.family_id=f.id AND p.active=1) member_count FROM members_families f LEFT JOIN members_cells mc ON mc.id=f.cell_id WHERE f.active=1 ORDER BY f.name LIMIT 500")]
        people=[dict(r) for r in c.execute("SELECT p.*,coalesce(f.name,'Sem família vinculada') family_name,coalesce(mc.name,'') cell_name FROM members_people p LEFT JOIN members_families f ON f.id=p.family_id LEFT JOIN members_cells mc ON mc.id=p.cell_id WHERE p.active=1 AND lower(p.name) LIKE ? ORDER BY p.name LIMIT 200",('%'+q.lower()+'%',))]
        self_regs=[dict(r) for r in c.execute("SELECT * FROM members_self_registrations WHERE status='pending' ORDER BY created_at DESC LIMIT 100")]
        return {
            'cells':cells,
            'families':families,
            'people':people,
            'self_registrations':self_regs,
            'total_people':c.execute('SELECT count(*) FROM members_people WHERE active=1').fetchone()[0],
            'total_families':c.execute('SELECT count(*) FROM members_families WHERE active=1').fetchone()[0],
            'total_cells':c.execute('SELECT count(*) FROM members_cells WHERE active=1').fetchone()[0]
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
        return save(c,'members_'+kind,'members',data,values(data),user,rid)

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
def edit_person(rid:str,data:Person,user=Depends(write)):return persist('people',data,user,rid)

@router.post('/self-register')
def submit_self_registration(data:SelfRegister):
    if not data.name.strip():fail('name','Informe seu nome completo.')
    check_date(data.birthday)
    if data.email and ('@' not in data.email or ' ' in data.email):fail('email','Confira o e-mail.')
    stage=data.integration_stage if data.integration_stage in STAGES else 'visitor'
    rid=secrets.token_hex(16)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute(
            'INSERT INTO members_self_registrations(id,name,family_name,birthday,phone,email,marital_status,profession,address,integration_stage,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
            (rid,data.name.strip(),data.family_name.strip(),data.birthday.isoformat() if data.birthday else None,data.phone.strip(),data.email.strip(),data.marital_status.strip(),data.profession.strip(),data.address.strip(),stage,'pending',s.now())
        )
    return {'id':rid,'ok':True,'message':'Cadastro enviado para a secretaria com sucesso!'}

@router.post('/self-registrations/{rid}/approve')
def approve_self_registration(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        reg=c.execute("SELECT * FROM members_self_registrations WHERE id=? AND status='pending'",(rid,)).fetchone()
        if not reg:fail('missing','Solicitação pendente não encontrada.',404)
        fam_id=None
        fam_name=(reg['family_name'] or '').strip()
        if fam_name:
            existing=c.execute('SELECT id FROM members_families WHERE lower(name)=? AND active=1',(fam_name.lower(),)).fetchone()
            if existing:fam_id=existing['id']
            else:
                fam_res=save(c,'members_families','members',Family(name=fam_name,joined_on=date.today()),{'name':fam_name,'joined_on':s.today(),'cell_id':None,'neighborhood':''},user)
                fam_id=fam_res['id']
        person_vals={
            'name':reg['name'],'joined_on':s.today(),'family_id':fam_id,'cell_id':None,
            'relationship':'Titular','birthday':reg['birthday'],'phone':reg['phone'] or '',
            'email':reg['email'] or '','integration_stage':reg['integration_stage'] or 'visitor',
            'baptism_date':None,'origin_church':'','marital_status':reg['marital_status'] or '',
            'profession':reg['profession'] or '','address':reg['address'] or '','pastoral_notes':'Auto-cadastro aprovado'
        }
        p_res=save(c,'members_people','members',Person(name=reg['name']),person_vals,user)
        c.execute("UPDATE members_self_registrations SET status='approved' WHERE id=?",(rid,))
        s.audit(c,user['id'],'members:self_reg_approved:'+rid)
        return {'ok':True,'person_id':p_res['id'],'family_id':fam_id}

@router.delete('/self-registrations/{rid}')
def reject_self_registration(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        c.execute("UPDATE members_self_registrations SET status='rejected' WHERE id=?",(rid,))
        s.audit(c,user['id'],'members:self_reg_rejected:'+rid)
        return {'ok':True}

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

