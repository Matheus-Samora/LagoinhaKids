from datetime import date
from fastapi import APIRouter,Depends,Query
from pydantic import Field
from ...module_security import module_access
from ... import store as s
from ...app import fail
from ..common import Record,save,archive,current,check_date
router=APIRouter(prefix='/api/ministries',tags=['Ministries'])
CATALOG=('Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link Future','Gourmet','Champions','DNA','Sonoplastia')
read=module_access('ministries');write=module_access('ministries',('admin','editor'));admin=module_access('ministries',('admin',))
class Assignment(Record):
    person_id:str=Field(max_length=40)
    ministry:str=Field(max_length=40)
    position:str=Field(default='Integrante',min_length=2,max_length=100)
    started_on:date|None=None
@router.get('/people')
def people(q:str=Query(default='',max_length=100),user=Depends(read)):
    # Deliberate minimal directory sharing; no birth dates, contacts or Kids data.
    with s.db() as c:return [dict(r) for r in c.execute("SELECT id,name FROM members_people WHERE active=1 AND lower(name) LIKE ? ORDER BY name LIMIT 200",('%'+q.lower()+'%',))]
@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        rows=[dict(r) for r in c.execute('SELECT a.*,p.name person_name FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id WHERE a.active=1 AND p.active=1 AND lower(p.name) LIKE ? ORDER BY a.ministry,p.name LIMIT 200',('%'+q.lower()+'%',))]
        counts=[dict(r) for r in c.execute('SELECT ministry,count(*) total FROM ministries_assignments WHERE active=1 GROUP BY ministry')]
        return {'assignments':rows,'catalog':CATALOG,'counts':counts}
def persist(data,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.position.strip():fail('position','Informe a função.')
    check_date(data.started_on)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');current(c,'members_people',data.person_id)
        if c.execute('SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1 AND id!=?',(data.person_id,data.ministry,rid or str(data.request_id or ''))).fetchone():fail('duplicate','Esta pessoa já possui um vínculo ativo neste ministério.',409)
        return save(c,'ministries_assignments','ministries',data,{'person_id':data.person_id,'ministry':data.ministry,'position':data.position.strip(),'started_on':str(data.started_on) if data.started_on else None},user,rid)
@router.post('/assignments')
def create(data:Assignment,user=Depends(write)):return persist(data,user)
@router.put('/assignments/{rid}')
def edit(rid:str,data:Assignment,user=Depends(write)):return persist(data,user,rid)
@router.delete('/assignments/{rid}')
def remove(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');return archive(c,'ministries_assignments','ministries',rid,version,user)
