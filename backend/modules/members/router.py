from datetime import date
from fastapi import APIRouter,Depends,Query
from pydantic import Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,save,archive,current,check_date,change
router=APIRouter(prefix='/api/members',tags=['Members'])
read=module_access('members');write=module_access('members',('admin','editor'));admin=module_access('members',('admin',))
class Family(Record):
    name:str=Field(min_length=2,max_length=120)
    joined_on:date|None=None
class Person(Family):
    family_id:str|None=Field(default=None,max_length=40)
    relationship:str=Field(default='',max_length=60)
    birthday:date|None=None
    phone:str=Field(default='',max_length=30)
    email:str=Field(default='',max_length=200)

def values(data):return {k:(v.isoformat() if isinstance(v,date) else v.strip() if isinstance(v,str) else v) for k,v in data.model_dump(exclude={'version','request_id'}).items()}
@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        families=[dict(r) for r in c.execute('SELECT f.*,(SELECT count(*) FROM members_people p WHERE p.family_id=f.id AND p.active=1) member_count FROM members_families f WHERE f.active=1 ORDER BY f.name LIMIT 500')]
        people=[dict(r) for r in c.execute("SELECT p.*,coalesce(f.name,'Sem família vinculada') family_name FROM members_people p LEFT JOIN members_families f ON f.id=p.family_id WHERE p.active=1 AND lower(p.name) LIKE ? ORDER BY p.name LIMIT 200",('%'+q.lower()+'%',))]
        return {'families':families,'people':people,'total_people':c.execute('SELECT count(*) FROM members_people WHERE active=1').fetchone()[0],'total_families':c.execute('SELECT count(*) FROM members_families WHERE active=1').fetchone()[0]}

def persist(kind,data,user,rid=None):
    check_date(data.joined_on)
    if not data.name.strip():fail('name','Informe o nome.')
    if isinstance(data,Person):
        check_date(data.birthday)
        if data.email and ('@' not in data.email or ' ' in data.email):fail('email','Confira o e-mail.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if isinstance(data,Person) and data.family_id:current(c,'members_families',data.family_id)
        return save(c,'members_'+kind,'members',data,values(data),user,rid)
@router.post('/families')
def create_family(data:Family,user=Depends(write)):return persist('families',data,user)
@router.put('/families/{rid}')
def edit_family(rid:str,data:Family,user=Depends(write)):return persist('families',data,user,rid)
@router.post('/people')
def create_person(data:Person,user=Depends(write)):return persist('people',data,user)
@router.put('/people/{rid}')
def edit_person(rid:str,data:Person,user=Depends(write)):return persist('people',data,user,rid)
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
