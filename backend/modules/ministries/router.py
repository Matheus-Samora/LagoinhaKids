from datetime import date
from fastapi import APIRouter,Depends,Query
from pydantic import Field
from ...module_security import module_access
from ...platform_access import platform_admin
from ... import store as s
from ...app import fail
from ..common import Record,save,archive,current,check_date
router=APIRouter(prefix='/api/ministries',tags=['Ministries'])
CATALOG=('Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link Future','Gourmet','Champions','DNA','Sonoplastia')
TRAINING_STATUSES=('certified','in_training','pending')
SCHEDULE_STATUSES=('confirmed','pending','declined')
RESOURCE_CATEGORIES=('repertorio','roteiro','checklist','documento')
read=module_access('ministries');write=module_access('ministries',('admin','editor'));admin=module_access('ministries',('admin',))

class Assignment(Record):
    person_id:str=Field(max_length=40)
    ministry:str=Field(max_length=40)
    position:str=Field(default='Integrante',min_length=2,max_length=100)
    started_on:date|None=None
    is_leader:bool=False
    training_status:str=Field(default='certified',max_length=40)

class Schedule(Record):
    title:str=Field(min_length=2,max_length=120)
    ministry:str=Field(max_length=40)
    person_id:str=Field(max_length=40)
    role_notes:str=Field(default='',max_length=160)
    service_date:date
    service_time:str=Field(default='18:00',max_length=20)
    status:str=Field(default='confirmed',max_length=30)

class Resource(Record):
    ministry:str=Field(max_length=40)
    title:str=Field(min_length=2,max_length=140)
    category:str=Field(default='roteiro',max_length=40)
    notes:str=Field(default='',max_length=400)
    resource_url:str=Field(default='',max_length=400)

def check_ministry_scope(c,user,ministry):
    if platform_admin(c,user['id']):return
    row=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
    scope=(row['scope'] or '').strip() if row else ''
    if scope and scope!=ministry:
        fail('ministry_scope',f'Seu perfil está restrito à coordenação do ministério {scope}.',403)

@router.get('/people')
def people(q:str=Query(default='',max_length=100),user=Depends(read)):
    # Deliberate minimal directory sharing; no birth dates, contacts or Kids data.
    with s.db() as c:return [dict(r) for r in c.execute("SELECT id,name FROM members_people WHERE active=1 AND lower(name) LIKE ? ORDER BY name LIMIT 200",('%'+q.lower()+'%',))]

@router.get('')
def listing(q:str=Query(default='',max_length=100),user=Depends(read)):
    with s.db() as c:
        rows=[dict(r) for r in c.execute('SELECT a.*,p.name person_name FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id WHERE a.active=1 AND p.active=1 AND lower(p.name) LIKE ? ORDER BY a.ministry,a.is_leader DESC,p.name LIMIT 300',('%'+q.lower()+'%',))]
        schedules=[dict(r) for r in c.execute('SELECT ms.*,p.name person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.active=1 AND p.active=1 ORDER BY ms.service_date ASC,ms.service_time ASC,ms.ministry ASC LIMIT 300')]
        resources=[dict(r) for r in c.execute('SELECT * FROM ministries_resources WHERE active=1 ORDER BY ministry ASC,created_at DESC LIMIT 200')]
        counts=[dict(r) for r in c.execute('SELECT ministry,count(*) total,sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry')]
        row=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
        scope=(row['scope'] or '').strip() if row and not platform_admin(c,user['id']) else ''
        return {'assignments':rows,'schedules':schedules,'resources':resources,'catalog':CATALOG,'counts':counts,'user_scope':scope}

def persist(data,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.position.strip():fail('position','Informe a função.')
    if data.training_status not in TRAINING_STATUSES:fail('training_status','Status de trilha inválido.')
    check_date(data.started_on)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        current(c,'members_people',data.person_id)
        if c.execute('SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1 AND id!=?',(data.person_id,data.ministry,rid or str(data.request_id or ''))).fetchone():fail('duplicate','Esta pessoa já possui um vínculo ativo neste ministério.',409)
        return save(c,'ministries_assignments','ministries',data,{'person_id':data.person_id,'ministry':data.ministry,'position':data.position.strip(),'started_on':str(data.started_on) if data.started_on else None,'is_leader':1 if data.is_leader else 0,'training_status':data.training_status},user,rid)

@router.post('/assignments')
def create(data:Assignment,user=Depends(write)):return persist(data,user)
@router.put('/assignments/{rid}')
def edit(rid:str,data:Assignment,user=Depends(write)):return persist(data,user,rid)
@router.delete('/assignments/{rid}')
def remove(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=current(c,'ministries_assignments',rid)
        check_ministry_scope(c,user,old['ministry'])
        return archive(c,'ministries_assignments','ministries',rid,version,user)

def persist_schedule(data:Schedule,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.title.strip():fail('title','Informe o culto ou evento da escala.')
    if data.status not in SCHEDULE_STATUSES:fail('status','Status de escala inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        current(c,'members_people',data.person_id)
        if data.status!='declined':
            conflict=c.execute(
                "SELECT ministry,title FROM ministries_schedules WHERE person_id=? AND service_date=? AND service_time=? AND active=1 AND status!='declined' AND id!=?",
                (data.person_id,str(data.service_date),data.service_time.strip(),rid or str(data.request_id or ''))
            ).fetchone()
            if conflict:
                fail('schedule_conflict',f"Conflito de escala: voluntário já escalado em {conflict['ministry']} ({conflict['title']}) neste mesmo dia e horário.",409)
        vals={
            'title':data.title.strip(),'ministry':data.ministry,'person_id':data.person_id,
            'role_notes':data.role_notes.strip(),'service_date':str(data.service_date),
            'service_time':data.service_time.strip() or '18:00','status':data.status
        }
        return save(c,'ministries_schedules','ministries',data,vals,user,rid)

@router.post('/schedules')
def create_schedule(data:Schedule,user=Depends(write)):return persist_schedule(data,user)
@router.put('/schedules/{rid}')
def edit_schedule(rid:str,data:Schedule,user=Depends(write)):return persist_schedule(data,user,rid)
@router.delete('/schedules/{rid}')
def remove_schedule(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=current(c,'ministries_schedules',rid)
        check_ministry_scope(c,user,old['ministry'])
        return archive(c,'ministries_schedules','ministries',rid,version,user)

def persist_resource(data:Resource,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.title.strip():fail('title','Informe o título do material ou repertório.')
    cat=data.category if data.category in RESOURCE_CATEGORIES else 'roteiro'
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        vals={
            'ministry':data.ministry,'title':data.title.strip(),'category':cat,
            'notes':data.notes.strip(),'resource_url':data.resource_url.strip()
        }
        return save(c,'ministries_resources','ministries',data,vals,user,rid)

@router.post('/resources')
def create_resource(data:Resource,user=Depends(write)):return persist_resource(data,user)
@router.put('/resources/{rid}')
def edit_resource(rid:str,data:Resource,user=Depends(write)):return persist_resource(data,user,rid)
@router.delete('/resources/{rid}')
def remove_resource(rid:str,version:int=Query(ge=1),user=Depends(admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=current(c,'ministries_resources',rid)
        check_ministry_scope(c,user,old['ministry'])
        return archive(c,'ministries_resources','ministries',rid,version,user)

