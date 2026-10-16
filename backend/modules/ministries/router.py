from datetime import date,time
from urllib.parse import urlsplit
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from ...module_security import module_access
from ...platform_access import platform_admin,is_pastor
from ... import store as s
from ...app import fail
from ..common import Record,save,archive,current,check_date,encrypt_text,decrypt_text
router=APIRouter(prefix='/api/ministries',tags=['Ministries'])
CATALOG=('Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link','Future','Gourmet','Champions','DNA','Sonoplastia')
WORSHIP_ROLES=('Ministro de Louvor','Vocal / Backing Vocal','Tecladista','Baterista','Guitarrista','Violonista','Baixista','Cordas / Sopros','Diretor Musical','VS / Tracks')
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

class WorshipBandSlot(BaseModel):
    person_id:str=Field(max_length=40)
    instrument:str=Field(min_length=2,max_length=80)

class WorshipScaleCreate(BaseModel):
    title:str=Field(min_length=2,max_length=120)
    service_date:date
    service_time:str=Field(default='18:00',max_length=20)
    repertoire_title:str=Field(default='',max_length=140)
    repertoire_notes:str=Field(default='',max_length=400)
    repertoire_url:str=Field(default='',max_length=400)
    members:list[WorshipBandSlot]=Field(min_length=1,max_length=25)

def check_ministry_scope(c,user,ministry):
    if platform_admin(c,user['id']) or is_pastor(c,user['id']):return
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
        rows=[dict(r) for r in c.execute('SELECT a.*,p.name person_name,coalesce(p.phone,\'\') person_phone FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id WHERE a.active=1 AND p.active=1 AND lower(p.name) LIKE ? ORDER BY a.ministry,a.is_leader DESC,p.name LIMIT 300',('%'+q.lower()+'%',))]
        schedules=[dict(r) for r in c.execute('SELECT ms.*,p.name person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.active=1 AND p.active=1 ORDER BY ms.service_date ASC,ms.service_time ASC,ms.ministry ASC LIMIT 300')]
        resources=[dict(r) for r in c.execute('SELECT * FROM ministries_resources WHERE active=1 ORDER BY ministry ASC,created_at DESC LIMIT 200')]
        counts=[dict(r) for r in c.execute('SELECT ministry,count(*) total,sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry')]
        row=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
        scope=(row['scope'] or '').strip() if row and not platform_admin(c,user['id']) and not is_pastor(c,user['id']) else ''
        apps=[]
        for r in c.execute("SELECT * FROM sector_applications WHERE target_type='ministry' AND status='pending' ORDER BY created_at DESC LIMIT 100"):
            if scope and r['target_name']!=scope:continue
            d=dict(r);d['notes']=decrypt_text(d.get('notes',''));apps.append(d)
        if scope:
            rows=[r for r in rows if r['ministry']==scope]
            schedules=[r for r in schedules if r['ministry']==scope]
            resources=[r for r in resources if r['ministry']==scope]
            counts=[r for r in counts if r['ministry']==scope]
        return {
            'assignments':rows,
            'schedules':schedules,
            'resources':resources,
            'catalog':(scope,) if scope else CATALOG,
            'worship_roles':WORSHIP_ROLES,
            'counts':counts,
            'user_scope':scope,
            'applications':apps
        }

def persist(data,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.position.strip():fail('position','Informe a função.')
    if data.training_status not in TRAINING_STATUSES:fail('training_status','Status de trilha inválido.')
    check_date(data.started_on)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        if rid:check_ministry_scope(c,user,current(c,'ministries_assignments',rid)['ministry'])
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
    try:time.fromisoformat(data.service_time)
    except ValueError:fail('time','Informe um horário válido.')
    if data.status not in SCHEDULE_STATUSES:fail('status','Status de escala inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        if rid:check_ministry_scope(c,user,current(c,'ministries_schedules',rid)['ministry'])
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

@router.post('/worship-scale')
def create_worship_scale(data:WorshipScaleCreate,user=Depends(write)):
    if not data.title.strip():fail('title','Informe a identificação do culto.')
    try:time.fromisoformat(data.service_time)
    except ValueError:fail('time','Informe um horário válido.')
    if data.repertoire_url and urlsplit(data.repertoire_url).scheme not in ('https','http'):fail('url','Use um link HTTP ou HTTPS.')
    s_date=str(data.service_date)
    s_time=data.service_time.strip() or '18:00'
    created_ids=[]
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,'Music')
        seen_people=set()
        for slot in data.members:
            pid=slot.person_id.strip()
            inst=slot.instrument.strip() or 'Integrante'
            if not pid or pid in seen_people:continue
            seen_people.add(pid)
            p_row=current(c,'members_people',pid)
            conflict=c.execute(
                "SELECT ministry,title FROM ministries_schedules WHERE person_id=? AND service_date=? AND service_time=? AND active=1 AND status!='declined'",
                (pid,s_date,s_time)
            ).fetchone()
            if conflict:
                fail('schedule_conflict',f"Conflito de escala: {p_row['name']} ({inst}) já está escalado(a) em {conflict['ministry']} ({conflict['title']}) em {s_date} às {s_time}.",409)
            # Ensure musician is also registered in Music ministry with their instrument if not already
            if not c.execute("SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry='Music' AND active=1",(pid,)).fetchone():
                save(c,'ministries_assignments','ministries',Record(),{'person_id':pid,'ministry':'Music','position':inst,'started_on':s.today(),'is_leader':0,'training_status':'certified'},user)
            res=save(c,'ministries_schedules','ministries',Record(),{
                'title':data.title.strip(),'ministry':'Music','person_id':pid,
                'role_notes':inst,'service_date':s_date,'service_time':s_time,'status':'confirmed'
            },user)
            created_ids.append(res['id'])
        if not created_ids:
            fail('members','Selecione ao menos um integrante da banda para montar a escala.')
        if data.repertoire_title.strip():
            save(c,'ministries_resources','ministries',Record(),{
                'ministry':'Music','title':f"{data.repertoire_title.strip()} ({s_date} {s_time})",
                'category':'repertorio','notes':data.repertoire_notes.strip(),'resource_url':data.repertoire_url.strip()
            },user)
    return {'ok':True,'created':len(created_ids),'ids':created_ids}

@router.post('/applications/{rid}/approve')
def approve_ministry_application(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        app=c.execute("SELECT * FROM sector_applications WHERE id=? AND target_type='ministry' AND status='pending'",(rid,)).fetchone()
        if not app:fail('missing','Candidatura pendente não encontrada.',404)
        ministry=app['target_name']
        check_ministry_scope(c,user,ministry)
        person=None
        if app['email']:
            person=c.execute('SELECT * FROM members_people WHERE lower(email)=? AND active=1',(app['email'].lower(),)).fetchone()
        if not person:
            person=c.execute('SELECT * FROM members_people WHERE lower(name)=? AND active=1',(app['member_name'].lower(),)).fetchone()
        if person:
            pid=person['id']
            if app['phone'] and not person.get('phone'):
                c.execute('UPDATE members_people SET phone=?,version=version+1 WHERE id=?',(app['phone'],pid))
        else:
            p_res=save(c,'members_people','members',Record(),{
                'name':app['member_name'],'joined_on':s.today(),'family_id':None,'cell_id':None,
                'relationship':'Titular','birthday':None,'phone':app['phone'] or '',
                'email':app['email'] or '','integration_stage':'active_member',
                'baptism_date':None,'origin_church':'','marital_status':'',
                'profession':'','address':'','pastoral_notes':encrypt_text(f'Aprovado para o ministério {ministry}')
            },user)
            pid=p_res['id']
        role_pos=(app['role_desired'] or 'Integrante').strip()
        existing_assign=c.execute('SELECT id,version FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1',(pid,ministry)).fetchone()
        if existing_assign:
            c.execute('UPDATE ministries_assignments SET position=?,version=version+1 WHERE id=?',(role_pos,existing_assign['id']))
            assign_id=existing_assign['id']
        else:
            a_res=save(c,'ministries_assignments','ministries',Record(),{
                'person_id':pid,'ministry':ministry,'position':role_pos,
                'started_on':s.today(),'is_leader':0,'training_status':'in_training'
            },user)
            assign_id=a_res['id']
        c.execute("UPDATE sector_applications SET status='approved',reviewed_by=? WHERE id=?",(user['id'],rid))
        if app['user_id']:
            c.execute("INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,'ministries','viewer',1) ON CONFLICT(user_id,module) DO UPDATE SET enabled=1",(app['user_id'],))
            c.execute("INSERT INTO module_scopes(user_id,module,scope) VALUES(?,'ministries',?) ON CONFLICT(user_id,module) DO NOTHING",(app['user_id'],ministry))
            c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?,?)',(
                app['user_id'],None,'ministry_approved',
                f'🙌 Candidatura Aprovada · Ministério {ministry}',
                f"Parabéns, {app['member_name']}! Sua participação no ministério {ministry} ({role_pos}) foi aprovada pela liderança. Seu acesso ao setor já está liberado!",
                user['id'],s.now()
            ))
        s.audit(c,user['id'],f'ministries:app_approved:{ministry}:{rid}')
        return {'ok':True,'person_id':pid,'assignment_id':assign_id}

@router.delete('/applications/{rid}')
def reject_ministry_application(rid:str,user=Depends(write)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        app=c.execute("SELECT * FROM sector_applications WHERE id=? AND target_type='ministry'",(rid,)).fetchone()
        if app:
            check_ministry_scope(c,user,app['target_name'])
        c.execute("UPDATE sector_applications SET status='rejected',reviewed_by=? WHERE id=? AND target_type='ministry'",(user['id'],rid))
        s.audit(c,user['id'],'ministries:app_rejected:'+rid)
        return {'ok':True}

def persist_resource(data:Resource,user,rid=None):
    if data.ministry not in CATALOG:fail('ministry','Selecione um ministério disponível.')
    if not data.title.strip():fail('title','Informe o título do material ou repertório.')
    if data.resource_url and urlsplit(data.resource_url).scheme not in ('https','http'):fail('url','Use um link HTTP ou HTTPS.')
    cat=data.category if data.category in RESOURCE_CATEGORIES else 'roteiro'
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        check_ministry_scope(c,user,data.ministry)
        if rid:check_ministry_scope(c,user,current(c,'ministries_resources',rid)['ministry'])
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


