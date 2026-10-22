"""Scoped workspaces for daily tasks, calendars, groups and governance."""
import calendar,csv,io,json,secrets,time
from datetime import date,datetime,timedelta
from uuid import UUID
from fastapi import APIRouter,Depends,Query,UploadFile,File,BackgroundTasks
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail,email,PUBLIC_URL
from .platform_access import allowed,platform_admin,is_pastor
from .record_policy import global_manager,manager,check_scope,visible_announcement
from .modules.common import current,save,Record,encrypt_text,decrypt_text,change,money

router=APIRouter(prefix='/api/workspace',tags=['Operational workspace'])

def authority(c,u,module):
    if not allowed(c,u,module) or not manager(c,u,module):fail('forbidden','Acesso exclusivo da liderança autorizada.',403)

def central(c,u):
    if not platform_admin(c,u['id']):fail('platform_admin','Acesso exclusivo de TI.',403)

def group_access(c,u,gid,write=False):
    current(c,'members_cells',gid)
    leader=bool(c.execute('SELECT 1 FROM gc_leaders WHERE cell_id=? AND user_id=?',(gid,u['id'])).fetchone())
    if not global_manager(c,u) and not leader and not (allowed(c,u,'members') and manager(c,u,'members')):fail('gc_scope','GC fora do seu escopo de liderança.',403)

def own_person(c,u):
    return c.execute('SELECT * FROM members_people WHERE account_user_id=? AND active=1',(u['id'],)).fetchone()

def date_time(value):
    try:
        parsed=datetime.fromisoformat(value)
        if parsed.tzinfo is None:parsed=parsed.replace(tzinfo=datetime.fromisoformat(s.now()).tzinfo)
        return parsed.astimezone(__import__('zoneinfo').ZoneInfo('America/Sao_Paulo'))
    except (ValueError,TypeError):fail('date','Informe data e horário válidos.')

@router.get('/tasks')
def tasks(u=Depends(session)):
    result=[]
    with s.db() as c:
        p=own_person(c,u)
        if p:
            for r in c.execute("SELECT * FROM ministries_schedules WHERE person_id=? AND active=1 AND status='pending' AND service_date>=? ORDER BY service_date,service_time LIMIT 100",(p['id'],s.today())):
                result.append({'id':'schedule:'+r['id'],'kind':'schedule','title':r['title'],'detail':r['ministry'],'due':r['service_date'],'url':'/ministries#schedules','context_id':r['id']})
        for r in c.execute("SELECT id,target_name,status FROM sector_applications WHERE user_id=? AND status='pending' LIMIT 100",(u['id'],)):
            result.append({'id':'application:'+r['id'],'kind':'application','title':r['target_name'],'detail':'Aguardando análise','url':'/membro#ministries','context_id':r['id']})
        for r in c.execute("SELECT j.*,p.name person_name FROM member_journey j JOIN members_people p ON p.id=j.person_id WHERE p.active=1 AND j.responsible_id=? AND j.next_action!='' ORDER BY j.due_on LIMIT 100",(u['id'],)):
            result.append({'id':'journey:'+r['id'],'kind':'journey','title':r['next_action'],'detail':r['person_name'],'due':r['due_on'],'url':'/members#operations'})
        for mod in ('members','ministries'):
            if allowed(c,u,mod) and manager(c,u,mod):
                kind='gc' if mod=='members' else 'ministry'
                for r in c.execute("SELECT * FROM sector_applications WHERE target_type=? AND status='pending' ORDER BY created_at LIMIT 100",(kind,)):
                    if mod=='ministries':
                        try:check_scope(c,u,mod,{'ministry':r['target_name']})
                        except Exception:continue
                    result.append({'id':'review:'+r['id'],'kind':'review','title':'Avaliar candidatura','detail':r['member_name']+' · '+r['target_name'],'context_id':r['id'],'url':'/'+mod+'#operations'})
        if global_manager(c,u):
            issues=c.execute("SELECT count(*) FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id WHERE ch.archived=0 AND ch.room_id IS NOT NULL AND (r.id IS NULL OR r.active=0)").fetchone()[0]
            if issues:result.append({'id':'integrity:rooms','kind':'integrity','title':'Regularizar vínculos de turma','detail':str(issues)+' cadastro(s)','url':'/systems#operations'})
        for r in c.execute("SELECT a.* FROM platform_announcements a WHERE a.active=1 AND a.require_ack=1 AND (a.publish_at IS NULL OR a.publish_at<=?) AND (a.expires_at IS NULL OR a.expires_at>?) AND NOT EXISTS(SELECT 1 FROM notice_acknowledgements n WHERE n.announcement_id=a.id AND n.user_id=?) ORDER BY a.created_at LIMIT 100",(s.now(),s.now(),u['id'])):
            if visible_announcement(c,u,dict(r)):result.append({'id':'ack:'+r['id'],'kind':'ack','title':r['title'],'detail':'Confirmação de leitura','context_id':r['id'],'url':'/membro#announcements'})
    return {'items':result,'count':len(result)}

@router.get('/calendar')
def unified_calendar(start:date|None=None,end:date|None=None,u=Depends(session),ministry:str='',status:str='',person_id:str=''):
    start=start or date.fromisoformat(s.today());end=end or start+timedelta(days=60)
    if end<start or (end-start).days>366:fail('range','Escolha um período de até 366 dias.')
    events=[]
    with s.db() as c:
        p=own_person(c,u)
        if allowed(c,u,'ministries') or p:
            for row in c.execute('SELECT ms.*,p.name person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.active=1 AND ms.service_date>=? AND ms.service_date<=? ORDER BY ms.service_date,ms.service_time LIMIT 1000',(str(start),str(end))):
                r=dict(row)
                if (ministry and r['ministry']!=ministry) or (status and r['status']!=status) or (person_id and r['person_id']!=person_id):continue
                if not (allowed(c,u,'ministries') and manager(c,u,'ministries')) and (not p or r['person_id']!=p['id']):continue
                try:check_scope(c,u,'ministries',r)
                except Exception:continue
                events.append({'id':'schedule:'+r['id'],'kind':'schedule','title':r['title'],'starts_at':r['service_date']+'T'+r['service_time']+(':00' if len(r['service_time'])==5 else '')+'-03:00','duration':r['duration_minutes'],'detail':r['ministry']+' · '+r['person_name'],'status':r['status'],'url':'/ministries#schedules'})
        if allowed(c,u,'kids'):
            from .app import room_allowed
            for row in c.execute('SELECT l.*,r.name room_name FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.active=1 AND r.active=1 AND l.starts_at>=? AND l.starts_at<? ORDER BY l.starts_at LIMIT 1000',(str(start),str(end+timedelta(days=1)))):
                if u['role']=='parent':
                    if not c.execute('SELECT 1 FROM reservations b JOIN children ch ON ch.id=b.child_id WHERE b.lesson_id=? AND b.confirmed=1 AND ch.archived=0 AND (ch.parent_id=? OR EXISTS(SELECT 1 FROM family_links f WHERE f.child_id=ch.id AND f.user_id=? AND f.active=1))',(row['id'],u['id'],u['id'])).fetchone():continue
                elif not room_allowed(c,u,row['room_id']):continue
                events.append({'id':'lesson:'+str(row['id']),'kind':'lesson','title':row['room_name'],'starts_at':row['starts_at'],'ends_at':row['ends_at'],'url':'/kids#lessons'})
            for row in c.execute('SELECT id,title,starts_at,ends_at FROM events WHERE active=1 AND starts_at>=? AND starts_at<? ORDER BY starts_at LIMIT 500',(str(start),str(end+timedelta(days=1)))):
                events.append(dict(row,kind='event',url='/kids#events'))
    return {'items':sorted(events,key=lambda r:date_time(r['starts_at'])),'start':str(start),'end':str(end)}

class Availability(BaseModel):
    starts_at:str=Field(max_length=40)
    ends_at:str=Field(max_length=40)
    reason:str=Field(default='',max_length=160)

@router.get('/availability')
def availability(u=Depends(session)):
    with s.db() as c:return [dict(r,reason=decrypt_text(r['reason'])) for r in c.execute('SELECT * FROM personal_availability WHERE user_id=? ORDER BY starts_at DESC LIMIT 100',(u['id'],))]

@router.post('/availability')
def add_availability(data:Availability,u=Depends(session)):
    a,b=date_time(data.starts_at),date_time(data.ends_at)
    if b<=a or b-a>timedelta(days=366):fail('range','Período de indisponibilidade inválido.')
    rid=secrets.token_hex(16)
    with s.db() as c:
        c.execute('INSERT INTO personal_availability VALUES(?,?,?,?,?,?)',(rid,u['id'],a.isoformat(),b.isoformat(),encrypt_text(data.reason),s.now()))
        s.audit(c,u['id'],'availability_created:'+rid)
    return {'id':rid,'ok':True}

@router.delete('/availability/{rid}')
def remove_availability(rid:str,u=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM personal_availability WHERE id=? AND user_id=?',(rid,u['id'])).fetchone():fail('missing','Registro não encontrado.',404)
        c.execute('DELETE FROM personal_availability WHERE id=?',(rid,));s.audit(c,u['id'],'availability_removed:'+rid)
    return {'ok':True}

@router.get('/groups')
def groups(u=Depends(session)):
    with s.db() as c:
        rows=c.execute('SELECT g.* FROM members_cells g WHERE g.active=1 ORDER BY g.name').fetchall();items=[]
        for row in rows:
            try:group_access(c,u,row['id'])
            except Exception:continue
            items.append({'id':row['id'],'name':row['name'],'meeting_day':row['meeting_day'],'member_count':c.execute('SELECT count(*) FROM members_people WHERE active=1 AND cell_id=?',(row['id'],)).fetchone()[0]})
        return items

class Leader(BaseModel):user_id:int
@router.put('/groups/{gid}/leaders')
def assign_leader(gid:str,data:Leader,u=Depends(session)):
    with s.db() as c:
        authority(c,u,'members');current(c,'members_cells',gid)
        if not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(data.user_id,)).fetchone():fail('missing','Conta ativa não encontrada.',404)
        c.execute('INSERT INTO gc_leaders VALUES(?,?) ON CONFLICT(cell_id,user_id) DO NOTHING',(gid,data.user_id));s.audit(c,u['id'],'gc_leader_assigned:'+gid+':'+str(data.user_id))
    return {'ok':True}

@router.delete('/groups/{gid}/leaders/{uid}')
def revoke_leader(gid:str,uid:int,u=Depends(session)):
    with s.db() as c:
        authority(c,u,'members');c.execute('DELETE FROM gc_leaders WHERE cell_id=? AND user_id=?',(gid,uid));s.audit(c,u['id'],'gc_leader_revoked:'+gid+':'+str(uid))
    return {'ok':True}

@router.get('/groups/search')
def search_groups(q:str=Query('',max_length=80),day:str=Query('',max_length=30),u=Depends(session)):
    with s.db() as c:
        return [dict(r) for r in c.execute("SELECT id,name,neighborhood,meeting_day FROM members_cells WHERE active=1 AND (lower(name) LIKE ? OR lower(neighborhood) LIKE ?) AND lower(meeting_day) LIKE ? ORDER BY name LIMIT 100",('%'+q.lower()+'%','%'+q.lower()+'%','%'+day.lower()+'%'))]

@router.get('/groups/{gid}')
def group_detail(gid:str,u=Depends(session)):
    with s.db() as c:
        group_access(c,u,gid)
        return {'people':[dict(r) for r in c.execute('SELECT id,name FROM members_people WHERE cell_id=? AND active=1 ORDER BY name',(gid,))],'meetings':[dict(r,notes=decrypt_text(r['notes'])) for r in c.execute('SELECT m.*,(SELECT count(*) FROM gc_attendance a WHERE a.meeting_id=m.id AND a.present=1) present_count FROM gc_meetings m WHERE m.cell_id=? ORDER BY m.held_on DESC LIMIT 100',(gid,))],'leaders':[dict(r) for r in c.execute('SELECT u.id,u.name FROM gc_leaders l JOIN users u ON u.id=l.user_id WHERE l.cell_id=? AND u.active=1',(gid,))]}

class Meeting(BaseModel):
    request_id:UUID
    title:str=Field(min_length=2,max_length=120)
    held_on:date
    notes:str=Field(default='',max_length=500)
    present_ids:list[str]=Field(default_factory=list,max_length=500)

@router.post('/groups/{gid}/meetings')
def meeting(gid:str,data:Meeting,u=Depends(session)):
    if data.held_on>date.fromisoformat(s.today()):fail('date','Registre a presença após o encontro.')
    rid=str(data.request_id)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');group_access(c,u,gid,True)
        old=c.execute('SELECT * FROM gc_meetings WHERE id=?',(rid,)).fetchone()
        if old:
            existing={r[0] for r in c.execute('SELECT person_id FROM gc_attendance WHERE meeting_id=? AND present=1',(rid,))}
            if old['cell_id']==gid and old['created_by']==u['id'] and old['title']==data.title and old['held_on']==str(data.held_on) and decrypt_text(old['notes'])==data.notes and existing==set(data.present_ids):return {'ok':True,'id':rid}
            fail('duplicate','Solicitação já utilizada.',409)
        permitted={r[0] for r in c.execute('SELECT id FROM members_people WHERE cell_id=? AND active=1',(gid,))}
        if not set(data.present_ids)<=permitted:fail('scope','Participante de outro GC.',403)
        c.execute('INSERT INTO gc_meetings(id,cell_id,title,held_on,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',(rid,gid,data.title,str(data.held_on),encrypt_text(data.notes),u['id'],s.now()))
        for pid in set(data.present_ids):c.execute('INSERT INTO gc_attendance VALUES(?,?,1)',(rid,pid))
        s.audit(c,u['id'],'gc_meeting_created:'+rid)
    return {'ok':True,'id':rid}

class Journey(BaseModel):
    request_id:UUID
    person_id:str=Field(max_length=40)
    stage:str=Field(pattern='^(visitor|welcoming|new_convert|gc|baptized|in_training|active_member|serving|leader)$')
    next_action:str=Field(default='',max_length=200)
    due_on:date|None=None
    responsible_id:int|None=None
    notes:str=Field(default='',max_length=500)

@router.get('/journeys')
def journeys(u=Depends(session)):
    with s.db() as c:
        authority(c,u,'members')
        return [dict(r,notes=decrypt_text(r['notes'])) for r in c.execute('SELECT j.*,p.name person_name FROM member_journey j JOIN members_people p ON p.id=j.person_id WHERE p.active=1 ORDER BY j.created_at DESC LIMIT 200')]

@router.post('/journeys')
def add_journey(data:Journey,u=Depends(session)):
    rid=str(data.request_id)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'members');old=current(c,'members_people',data.person_id)
        previous=c.execute('SELECT * FROM member_journey WHERE id=?',(rid,)).fetchone()
        if previous:
            vals={'person_id':data.person_id,'stage':data.stage,'next_action':data.next_action,'due_on':str(data.due_on) if data.due_on else None,'responsible_id':data.responsible_id,'notes':data.notes}
            if previous['created_by']==u['id'] and all(decrypt_text(previous[k])==v if isinstance(v,str) else previous[k]==v for k,v in vals.items()):return {'ok':True,'id':rid}
            fail('duplicate','Solicitação já utilizada com outros dados.',409)
        if data.responsible_id and not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(data.responsible_id,)).fetchone():fail('responsible','Responsável inválido.')
        c.execute('INSERT INTO member_journey(id,person_id,stage,next_action,due_on,responsible_id,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(rid,data.person_id,data.stage,data.next_action,str(data.due_on) if data.due_on else None,data.responsible_id,encrypt_text(data.notes),u['id'],s.now()))
        c.execute('UPDATE members_people SET integration_stage=?,version=version+1 WHERE id=?',(data.stage,data.person_id));change(c,'members',data.person_id,'journey',u,old,current(c,'members_people',data.person_id))
    return {'ok':True,'id':rid}

class Review(BaseModel):
    stage:str=Field(pattern='^(triage|conversation|training|ready|withdrawn)$')
    responsible_id:int|None=None
    due_on:date|None=None
    note:str=Field(default='',max_length=500)

@router.post('/applications/{rid}/review')
def review(rid:str,data:Review,u=Depends(session)):
    with s.db() as c:
        row=c.execute('SELECT * FROM sector_applications WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Candidatura não encontrada.',404)
        if data.stage=='withdrawn' and row['user_id']==u['id']:
            if row['status']!='pending':fail('state','A candidatura já foi concluída.',409)
            c.execute("UPDATE sector_applications SET status='withdrawn' WHERE id=?",(rid,))
        else:
            mod='members' if row['target_type']=='gc' else 'ministries';authority(c,u,mod)
            if mod=='ministries':check_scope(c,u,mod,{'ministry':row['target_name']})
        if data.responsible_id and not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(data.responsible_id,)).fetchone():fail('responsible','Conta inválida.')
        c.execute('INSERT INTO workflow_reviews VALUES(?,?,?,?,?,?,?,?)',(secrets.token_hex(16),rid,data.stage,data.responsible_id,str(data.due_on) if data.due_on else None,encrypt_text(data.note),u['id'],s.now()))
        s.audit(c,u['id'],'application_review:'+rid+':'+data.stage)
    return {'ok':True}

@router.get('/applications/{rid}/history')
def application_history(rid:str,u=Depends(session)):
    with s.db() as c:
        row=c.execute('SELECT * FROM sector_applications WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Candidatura não encontrada.',404)
        if row['user_id']!=u['id']:
            mod='members' if row['target_type']=='gc' else 'ministries';authority(c,u,mod)
            if mod=='ministries':check_scope(c,u,mod,{'ministry':row['target_name']})
        return [{'stage':r['stage'],'due_on':r['due_on'],'created_at':r['created_at']} for r in c.execute('SELECT * FROM workflow_reviews WHERE application_id=? ORDER BY created_at',(rid,))]

@router.post('/announcements/{rid}/acknowledge')
def acknowledge(rid:str,u=Depends(session)):
    with s.db() as c:
        row=c.execute('SELECT * FROM platform_announcements WHERE id=? AND active=1',(rid,)).fetchone()
        if not row or not visible_announcement(c,u,dict(row)) or (row['publish_at'] and row['publish_at']>s.now()) or (row['expires_at'] and row['expires_at']<=s.now()):fail('missing','Comunicado indisponível.',404)
        c.execute('INSERT INTO notice_acknowledgements VALUES(?,?,?) ON CONFLICT(announcement_id,user_id) DO NOTHING',(rid,u['id'],s.now()));s.audit(c,u['id'],'announcement_acknowledged:'+rid)
    return {'ok':True}

@router.get('/integrity')
def integrity(u=Depends(session)):
    with s.db() as c:
        central(c,u)
        orphan=[dict(r) for r in c.execute("SELECT ch.id,ch.name,ch.room_id FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id WHERE ch.archived=0 AND ch.room_id IS NOT NULL AND (r.id IS NULL OR r.active=0)")]
        duplicates=[dict(r) for r in c.execute("SELECT lower(name) name,count(*) count FROM members_people WHERE active=1 GROUP BY lower(name) HAVING count(*)>1 ORDER BY count(*) DESC LIMIT 100")]
        incomplete=c.execute("SELECT count(*) FROM members_people WHERE active=1 AND (birthday IS NULL OR phone='' OR account_user_id IS NULL)").fetchone()[0]
        return {'invalid_rooms':orphan,'duplicate_names':duplicates,'incomplete_people':incomplete,'automatic_changes':False}

@router.get('/access-matrix')
def access_matrix(u=Depends(session)):
    with s.db() as c:
        from .platform_access import MODULES
        result=[]
        for mod in MODULES:
            enabled=allowed(c,u,mod);edit=enabled and manager(c,u,mod)
            scope=c.execute('SELECT scope FROM module_scopes WHERE user_id=? AND module=?',(u['id'],mod)).fetchone()
            result.append({'module':mod,'view':enabled,'create_shared':bool(edit),'edit_shared':bool(edit),'export':bool(edit),'scope':scope['scope'] if scope else '', 'own_profile':True})
        return {'modules':result,'platform_admin':bool(platform_admin(c,u['id'])),'pastor':bool(is_pastor(c,u['id']))}

@router.get('/audit')
def audit(q:str=Query('',max_length=100),module:str='',action:str=Query('',max_length=80),start:date|None=None,end:date|None=None,page:int=Query(1,ge=1),u=Depends(session)):
    if module and module not in ('members','ministries','kids','finance','systems'):fail('module','Setor inválido.')
    with s.db() as c:
        central(c,u);clauses=['1=1'];params=[]
        if q:clauses.append("(lower(coalesce(u.name,'')) LIKE ? OR lower(a.action) LIKE ?)");params.extend(['%'+q.lower()+'%']*2)
        if action:clauses.append('a.action LIKE ?');params.append('%'+action+'%')
        if module:clauses.append('a.action LIKE ?');params.append('%'+module+'%')
        if start:clauses.append('a.created_at>=?');params.append(str(start))
        if end:clauses.append('a.created_at<?');params.append(str(end+timedelta(days=1)))
        where=' AND '.join(clauses)
        count=c.execute('SELECT count(*) FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE '+where,params).fetchone()[0]
        rows=[dict(r) for r in c.execute("SELECT a.id,a.action,a.created_at,coalesce(u.name,'Sistema') actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor WHERE "+where+' ORDER BY a.id DESC LIMIT 50 OFFSET ?',(*params,(page-1)*50))]
        for r in rows:r['label']=' · '.join(r['action'].split(':')[:2]).replace('_',' ')
        return {'items':rows,'total':count,'page':page,'has_more':page*50<count}

@router.get('/deliveries')
def deliveries(u=Depends(session)):
    with s.db() as c:
        central(c,u)
        return [dict(r) for r in c.execute("SELECT n.id,n.kind,n.created_at,n.read_at,o.status,o.attempts,o.last_error,o.delivered_at FROM notifications n LEFT JOIN outbox o ON o.notification_id=n.id ORDER BY n.id DESC LIMIT 100")]

class InviteUser(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    email:str=Field(max_length=200)
    send_email:bool=False

def create_invitation(c,data,u):
    address=email(data.email)
    if len(data.name.strip())<2:fail('name','Informe o nome completo.')
    if c.execute('SELECT 1 FROM users WHERE email=?',(address,)).fetchone():fail('exists','Conta já existente. Use a migração de acesso individual.',409)
    uid=c.execute("INSERT INTO users(name,email,password,role,activation_required,created_at) VALUES(?,?,?,'parent',1,?)",(data.name.strip(),address,s.password_hash(secrets.token_urlsafe(48)),s.now())).lastrowid
    token=secrets.token_urlsafe(40);c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest(token),uid,'activation',int(time.time())+172800));s.audit(c,u['id'],'account_invitation_created:'+str(uid))
    return {'ok':True,'id':uid,'url':PUBLIC_URL+'/#reset='+token,'expires_in_hours':48,'email_queued':data.send_email}

@router.post('/invitations')
def invitation(data:InviteUser,tasks:BackgroundTasks,u=Depends(session)):
    from .features import mail_ready,send_recovery_mail
    if data.send_email and not mail_ready():fail('mail','SMTP indisponível. Gere o link para entrega individual.',503)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');central(c,u);result=create_invitation(c,data,u)
    if data.send_email:tasks.add_task(send_recovery_mail,email(data.email),'Ative seu acesso — Lagoinha Systems','Defina sua senha em até 48 horas: '+result['url'])
    return result

class Activation(BaseModel):
    user_id:int
    confirm:bool=False

@router.post('/invitations/migrate')
def migrate_account(data:Activation,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');central(c,u)
        if data.user_id==u['id']:fail('self','Use a troca de senha da sua conta.',409)
        row=c.execute('SELECT id FROM users WHERE id=? AND active=1',(data.user_id,)).fetchone()
        if not row:fail('missing','Conta ativa não encontrada.',404)
        if not data.confirm:return {'requires_confirmation':True,'impact':'Revoga sessões e exige ativação individual. Confirme primeiro o e-mail com a pessoa.'}
        c.execute('UPDATE users SET activation_required=1 WHERE id=?',(data.user_id,));c.execute('DELETE FROM sessions WHERE user_id=?',(data.user_id,))
        c.execute('DELETE FROM auth_tokens WHERE user_id=?',(data.user_id,));token=secrets.token_urlsafe(40)
        c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest(token),data.user_id,'activation',int(time.time())+172800));s.audit(c,u['id'],'account_activation_required:'+str(data.user_id))
    return {'ok':True,'url':PUBLIC_URL+'/#reset='+token,'expires_in_hours':48}


@router.post('/journeys/{rid}/complete')
def complete_journey(rid:str,u=Depends(session)):
    with s.db() as c:
        row=c.execute('SELECT * FROM member_journey WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Acompanhamento não encontrado.',404)
        if row['responsible_id']!=u['id']:authority(c,u,'members')
        c.execute("UPDATE member_journey SET next_action='',version=version+1 WHERE id=?",(rid,));s.audit(c,u['id'],'journey_action_completed:'+rid)
    return {'ok':True}

@router.get('/calendar.ics')
def calendar_feed(start:date|None=None,end:date|None=None,u=Depends(session),ministry:str='',status:str='',person_id:str=''):
    from .calendar_export import calendar as make_calendar
    from fastapi.responses import Response
    events=unified_calendar(start,end,u,ministry,status,person_id)['items'];parts=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lagoinha Systems//Agenda//PT-BR','CALSCALE:GREGORIAN']
    for event in events:
        begin=date_time(event['starts_at']);finish=date_time(event['ends_at']) if event.get('ends_at') else begin+timedelta(minutes=event.get('duration',60))
        text=make_calendar(str(event['id']),event['title'],begin.isoformat(),finish.isoformat(),event.get('detail','')).body.decode()
        parts.append(text[text.index('BEGIN:VEVENT'):text.index('END:VEVENT')+len('END:VEVENT')])
    parts.append('END:VCALENDAR')
    return Response('\r\n'.join(parts)+'\r\n',media_type='text/calendar',headers={'Content-Disposition':'attachment; filename="lagoinha-agenda.ics"'})

class Transfer(BaseModel):
    request_id:UUID
    source_id:str=Field(max_length=40)
    target_id:str=Field(max_length=40)
    amount:str=Field(max_length=30)
    occurred_on:date

@router.post('/finance/transfers')
def transfer(data:Transfer,u=Depends(session)):
    from .modules.common import check_date
    check_date(data.occurred_on);amount=money(data.amount,True);rid=str(data.request_id)
    if data.source_id==data.target_id:fail('accounts','Selecione duas contas diferentes.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance')
        previous=c.execute('SELECT * FROM finance_transfers WHERE id=?',(rid,)).fetchone()
        if previous:
            if (previous['source_id'],previous['target_id'],previous['amount_cents'],previous['occurred_on'])!=(data.source_id,data.target_id,amount,str(data.occurred_on)):fail('duplicate','Solicitação já utilizada.',409)
            return {'ok':True,'id':rid}
        accounts=[current(c,'finance_accounts',aid) for aid in (data.source_id,data.target_id)]
        if any(a['require_approval'] for a in accounts):fail('approval','Transfira somente após aprovar as movimentações; esta conta exige conferência separada.',409)
        ids=[]
        for aid,direction in ((data.source_id,'expense'),(data.target_id,'income')):
            result=save(c,'finance_entries','finance',Record(),{'account_id':aid,'direction':direction,'description':'Transferência entre contas','occurred_on':str(data.occurred_on),'amount_cents':amount,'category':'Transferência interna','payment_status':'paid','payment_method':'transfer','due_date':None,'cost_center_id':None},u)
            ids.append(result['id'])
        c.execute('INSERT INTO finance_transfers(id,source_id,target_id,amount_cents,occurred_on,out_entry,in_entry,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(rid,data.source_id,data.target_id,amount,str(data.occurred_on),ids[0],ids[1],u['id'],s.now()));s.audit(c,u['id'],'finance_transfer_created:'+rid)
    return {'ok':True,'id':rid}

class Recurrence(BaseModel):
    request_id:UUID
    account_id:str=Field(max_length=40)
    direction:str=Field(pattern='^(income|expense)$')
    description:str=Field(min_length=2,max_length=200)
    amount:str=Field(max_length=30)
    next_on:date

@router.get('/finance/operations')
def finance_operations(u=Depends(session)):
    with s.db() as c:
        authority(c,u,'finance')
        return {'accounts':[dict(r) for r in c.execute('SELECT id,name,require_approval FROM finance_accounts WHERE active=1 ORDER BY name')],
          'approvals':[dict(r) for r in c.execute("SELECT a.*,e.description,e.amount_cents,e.direction FROM finance_approvals a JOIN finance_entries e ON e.id=a.entry_id WHERE e.active=1 AND a.status='pending' ORDER BY a.created_at LIMIT 100")],
          'statements':[dict(r) for r in c.execute('SELECT l.*,a.name account_name FROM finance_statement_lines l JOIN finance_accounts a ON a.id=l.account_id ORDER BY l.occurred_on DESC LIMIT 100')],
          'recurrences':[dict(r) for r in c.execute('SELECT * FROM finance_recurrences WHERE active=1 ORDER BY next_on LIMIT 100')],
          'transfers':[dict(r) for r in c.execute('SELECT * FROM finance_transfers ORDER BY occurred_on DESC LIMIT 100')]}

@router.post('/finance/recurrences')
def recurrence(data:Recurrence,u=Depends(session)):
    rid=str(data.request_id);cents=money(data.amount,True)
    with s.db() as c:
        authority(c,u,'finance');current(c,'finance_accounts',data.account_id)
        row=c.execute('SELECT * FROM finance_recurrences WHERE id=?',(rid,)).fetchone()
        if row:
            if row['account_id']!=data.account_id or row['amount_cents']!=cents or row['description']!=data.description:fail('duplicate','Solicitação já utilizada.',409)
            return {'ok':True,'id':rid}
        c.execute('INSERT INTO finance_recurrences(id,account_id,direction,description,amount_cents,next_on,active,created_by,created_at,anchor_day) VALUES(?,?,?,?,?,?,1,?,?,?)',(rid,data.account_id,data.direction,data.description,cents,str(data.next_on),u['id'],s.now(),data.next_on.day));s.audit(c,u['id'],'finance_recurrence_created:'+rid)
    return {'ok':True,'id':rid}

class GenerateRecurrence(BaseModel):expected_on:date|None=None

@router.post('/finance/recurrences/{rid}/generate')
def generate_recurrence(rid:str,data:GenerateRecurrence=GenerateRecurrence(),u=Depends(session)):
    from uuid import uuid5,NAMESPACE_URL
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance');row=c.execute('SELECT * FROM finance_recurrences WHERE id=? AND active=1',(rid,)).fetchone()
        if not row:fail('missing','Recorrência não encontrada.',404)
        if data.expected_on and str(data.expected_on)!=row['next_on']:
            prior=str(uuid5(NAMESPACE_URL,rid+'/'+str(data.expected_on)))
            if c.execute('SELECT 1 FROM finance_entries WHERE id=?',(prior,)).fetchone():return {'ok':True,'entry_id':prior}
            fail('conflict','A próxima parcela mudou. Atualize antes de gerar.',409)
        if row['next_on']>s.today():fail('date','A próxima parcela ainda não venceu.',409)
        current(c,'finance_accounts',row['account_id'])
        result=save(c,'finance_entries','finance',Record(request_id=uuid5(NAMESPACE_URL,rid+'/'+row['next_on'])),{'account_id':row['account_id'],'direction':row['direction'],'description':row['description'],'occurred_on':row['next_on'],'due_date':row['next_on'],'amount_cents':row['amount_cents'],'category':'Recorrência mensal','payment_status':'pending','payment_method':'pix','cost_center_id':None},u)
        due=date.fromisoformat(row['next_on']);month=due.month%12+1;year=due.year+(due.month==12);nxt=date(year,month,min(row['anchor_day'],calendar.monthrange(year,month)[1]))
        c.execute('UPDATE finance_recurrences SET next_on=? WHERE id=?',(str(nxt),rid));s.audit(c,u['id'],'finance_recurrence_generated:'+rid)
    return {'ok':True,'entry_id':result['id']}

@router.delete('/finance/recurrences/{rid}')
def stop_recurrence(rid:str,u=Depends(session)):
    with s.db() as c:
        authority(c,u,'finance');c.execute('UPDATE finance_recurrences SET active=0 WHERE id=?',(rid,));s.audit(c,u['id'],'finance_recurrence_stopped:'+rid)
    return {'ok':True}

class ApprovalPolicy(BaseModel):required:bool
@router.put('/finance/accounts/{rid}/approval')
def approval_policy(rid:str,data:ApprovalPolicy,u=Depends(session)):
    with s.db() as c:
        if not global_manager(c,u):fail('forbidden','A política de conferência é exclusiva de TI e pastores.',403)
        current(c,'finance_accounts',rid);c.execute('UPDATE finance_accounts SET require_approval=?,version=version+1 WHERE id=?',(int(data.required),rid));s.audit(c,u['id'],'finance_approval_policy:'+rid+':'+str(data.required))
    return {'ok':True}

@router.post('/finance/entries/{rid}/request-approval')
def request_approval(rid:str,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance');row=current(c,'finance_entries',rid)
        if row['payment_status']!='pending':fail('state','Aprovação se aplica a lançamentos pendentes.',409)
        previous=c.execute('SELECT status FROM finance_approvals WHERE entry_id=?',(rid,)).fetchone()
        if previous:
            existing=c.execute('SELECT * FROM finance_approvals WHERE entry_id=?',(rid,)).fetchone()
            if existing['entry_version']==row['version'] and existing['status'] in ('pending','approved'):return {'ok':True,'status':existing['status']}
            c.execute("UPDATE finance_approvals SET requested_by=?,status='pending',reviewed_by=NULL,reviewed_at=NULL,reason='',entry_version=? WHERE entry_id=?",(u['id'],row['version'],rid))
            s.audit(c,u['id'],'finance_approval_requested_again:'+rid)
            return {'ok':True,'status':'pending'}
        c.execute("INSERT INTO finance_approvals(entry_id,requested_by,status,created_at,entry_version) VALUES(?,?,'pending',?,?)",(rid,u['id'],s.now(),row['version']));s.audit(c,u['id'],'finance_approval_requested:'+rid)
    return {'ok':True,'status':'pending'}

class Decision(BaseModel):
    approve:bool
    reason:str=Field(min_length=3,max_length=300)
@router.post('/finance/entries/{rid}/approve')
def approve_entry(rid:str,data:Decision,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance')
        grant=c.execute("SELECT role FROM module_access WHERE user_id=? AND module='finance' AND enabled=1",(u['id'],)).fetchone()
        if not global_manager(c,u) and (not grant or grant['role']!='admin'):fail('forbidden','A conferência exige administrador financeiro, pastor ou TI.',403)
        entry=current(c,'finance_entries',rid);review=c.execute('SELECT * FROM finance_approvals WHERE entry_id=?',(rid,)).fetchone()
        if not review:fail('missing','Solicite a aprovação primeiro.',404)
        if review['requested_by']==u['id'] or entry['created_by']==u['id']:fail('separation','A conferência deve ser feita por outra pessoa.',403)
        if review['entry_version']!=entry['version']:fail('conflict','O lançamento mudou. Solicite nova conferência.',409)
        if review['status']!='pending':fail('state','Esta solicitação já foi analisada.',409)
        c.execute('UPDATE finance_approvals SET status=?,reason=?,reviewed_by=?,reviewed_at=? WHERE entry_id=?',('approved' if data.approve else 'rejected',encrypt_text(data.reason),u['id'],s.now(),rid));s.audit(c,u['id'],'finance_approval_decided:'+rid)
    return {'ok':True}

@router.post('/finance/statements/preview')
async def preview_statement(file:UploadFile=File(...),u=Depends(session)):
    raw=await file.read(1024*1024+1)
    if len(raw)>1024*1024:fail('size','Use CSV de até 1 MB.')
    with s.db() as c:authority(c,u,'finance')
    try:
        text=raw.decode('utf-8-sig');reader=csv.DictReader(io.StringIO(text),delimiter=';');rows=[]
        if not {'data','valor','descricao','referencia'}<=set(reader.fieldnames or []):fail('format','CSV precisa de data;valor;descricao;referencia.')
        for row in reader:
            if len(rows)>=500:fail('size','Importe até 500 linhas por vez.')
            occurred=str(date.fromisoformat(row['data']));amount=money(row['valor'])
            if not row['referencia'].strip() or not amount:fail('reference','Cada linha precisa de referência bancária e valor diferente de zero.')
            rows.append({'occurred_on':occurred,'amount':row['valor'],'description':row['descricao'][:250],'reference':row['referencia'][:150]})
        return {'rows':rows,'count':len(rows)}
    except (UnicodeDecodeError,ValueError,csv.Error):fail('format','Arquivo CSV inválido. Use UTF-8, separador ; e data AAAA-MM-DD.')

class StatementRow(BaseModel):
    occurred_on:date
    amount:str=Field(max_length=30)
    description:str=Field(min_length=1,max_length=250)
    reference:str=Field(min_length=1,max_length=150)
class Statement(BaseModel):
    account_id:str=Field(max_length=40)
    rows:list[StatementRow]=Field(min_length=1,max_length=500)

@router.post('/finance/statements')
def import_statement(data:Statement,u=Depends(session)):
    added=0
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance');current(c,'finance_accounts',data.account_id)
        for row in data.rows:
            cents=money(row.amount)
            if not cents or row.occurred_on>date.fromisoformat(s.today()):fail('statement','Confira valores e datas do extrato.')
            fingerprint=s.digest(data.account_id+'|'+row.reference.strip())
            old=c.execute('SELECT * FROM finance_statement_lines WHERE fingerprint=?',(fingerprint,)).fetchone()
            if old:
                if old['amount_cents']!=cents or old['occurred_on']!=str(row.occurred_on):fail('conflict','Referência já importada com outros valores.',409)
                continue
            c.execute('INSERT INTO finance_statement_lines(id,account_id,occurred_on,amount_cents,description,reference,fingerprint,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(secrets.token_hex(16),data.account_id,str(row.occurred_on),cents,row.description,row.reference.strip(),fingerprint,u['id'],s.now()));added+=1
        s.audit(c,u['id'],'finance_statement_imported:'+str(added))
    return {'ok':True,'added':added,'duplicates':len(data.rows)-added}

class Match(BaseModel):entry_id:str=Field(max_length=40)
@router.put('/finance/statements/{rid}/match')
def match_statement(rid:str,data:Match,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance');line=c.execute('SELECT * FROM finance_statement_lines WHERE id=?',(rid,)).fetchone()
        if not line:fail('missing','Linha de extrato não encontrada.',404)
        entry=current(c,'finance_entries',data.entry_id)
        signed=entry['amount_cents']*(1 if entry['direction']=='income' else -1)
        if line['account_id']!=entry['account_id'] or line['amount_cents']!=signed:fail('match','Conta, direção e valor devem corresponder.',409)
        if line['entry_id'] and line['entry_id']!=entry['id']:fail('match','Linha já conciliada.',409)
        if c.execute('SELECT 1 FROM finance_statement_lines WHERE entry_id=? AND id!=?',(entry['id'],rid)).fetchone():fail('match','Lançamento já conciliado com outra linha.',409)
        c.execute('UPDATE finance_statement_lines SET entry_id=? WHERE id=?',(entry['id'],rid));s.audit(c,u['id'],'finance_statement_matched:'+rid)
    return {'ok':True}


class Pickup(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    relationship:str=Field(default='',max_length=60)
    identity_hint:str=Field(default='',max_length=8)
    expires_on:date|None=None

@router.get('/children/{cid}/pickups')
def pickup_list(cid:int,u=Depends(session)):
    from .app import child_allowed
    with s.db() as c:
        child_allowed(c,u,cid)
        return [dict(r) for r in c.execute('SELECT id,name,relationship,identity_hint,expires_on FROM pickup_authorizations WHERE child_id=? AND active=1 AND (expires_on IS NULL OR expires_on>=?) ORDER BY name',(cid,s.today()))]

@router.post('/children/{cid}/pickups')
def create_pickup(cid:int,data:Pickup,u=Depends(session)):
    from .app import child_allowed
    if data.expires_on and data.expires_on<date.fromisoformat(s.today()):fail('date','A autorização não pode começar expirada.')
    rid=secrets.token_hex(16)
    with s.db() as c:
        ch=child_allowed(c,u,cid)
        if not global_manager(c,u) and ch['parent_id']!=u['id']:fail('guardian','Somente o responsável principal, TI ou pastor pode autorizar a retirada.',403)
        c.execute('INSERT INTO pickup_authorizations(id,child_id,name,relationship,identity_hint,expires_on,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',(rid,cid,data.name,data.relationship,data.identity_hint,str(data.expires_on) if data.expires_on else None,u['id'],s.now()));s.audit(c,u['id'],'pickup_authorization_created:'+rid,cid)
    return {'ok':True,'id':rid}

@router.delete('/children/{cid}/pickups/{rid}')
def revoke_pickup(cid:int,rid:str,u=Depends(session)):
    from .app import child_allowed
    with s.db() as c:
        ch=child_allowed(c,u,cid)
        if not global_manager(c,u) and ch['parent_id']!=u['id']:fail('guardian','Somente o responsável principal, TI ou pastor pode remover a autorização.',403)
        c.execute('UPDATE pickup_authorizations SET active=0 WHERE id=? AND child_id=?',(rid,cid));s.audit(c,u['id'],'pickup_authorization_revoked:'+rid,cid)
    return {'ok':True}

@router.get('/reception')
def reception(u=Depends(session)):
    from .app import child_visible
    with s.db() as c:
        if u['role'] not in ('teacher','admin'):fail('staff','Acesso exclusivo da equipe.',403)
        result=[]
        for row in c.execute("SELECT ch.*,coalesce(r.name,'Sem turma') room_name,coalesce(a.status,'absent') attendance_status FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id LEFT JOIN attendance a ON a.child_id=ch.id AND a.day=? WHERE ch.archived=0 ORDER BY ch.name LIMIT 1000",(s.today(),)):
            if not child_visible(c,u,row):continue
            reservations=[dict(b) for b in c.execute('SELECT l.id,l.title,l.starts_at,l.ends_at FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.starts_at>=? AND l.starts_at<?',(row['id'],s.today(),str(date.fromisoformat(s.today())+timedelta(days=1))))]
            result.append({'id':row['id'],'name':row['name'],'room_name':row['room_name'],'status':row['attendance_status'],'reservations':reservations,'needs_guardian':not bool(row['parent_id']),'needs_room':not bool(row['room_id'])})
        return {'items':result,'date':s.today()}

from fastapi import Form
@router.post('/materials')
async def material_upload(file:UploadFile=File(...),request_id:UUID=Form(...),title:str=Form(...,min_length=2,max_length=140),ministry:str=Form(...,max_length=40),category:str=Form('documento'),notes:str=Form('',max_length=400),expires_on:date|None=Form(None),u=Depends(session)):
    from .app import MAX_UPLOAD,_prepare_upload,_insert_upload
    from .modules.ministries.router import CATALOG,RESOURCE_CATEGORIES
    from starlette.concurrency import run_in_threadpool
    if ministry not in CATALOG or category not in RESOURCE_CATEGORIES:fail('material','Ministério ou categoria inválido.')
    raw=await file.read(MAX_UPLOAD+1);prepared=await run_in_threadpool(_prepare_upload,raw,file.filename or 'material.pdf')
    def persist():
        rid=str(request_id)
        with s.db() as c:
            c.execute('BEGIN IMMEDIATE');authority(c,u,'ministries');check_scope(c,u,'ministries',{'ministry':ministry})
            old=c.execute('SELECT * FROM ministries_resources WHERE id=?',(rid,)).fetchone()
            if old:
                existing=c.execute('SELECT data FROM media WHERE id=?',(old['file_id'],)).fetchone()
                if old['created_by']==u['id'] and old['title']==title and old['ministry']==ministry and old['category']==category and decrypt_text(old['notes'])==notes and old['expires_on']==(str(expires_on) if expires_on else None) and existing and bytes(existing['data'])==prepared['data']:return {'ok':True,'id':rid}
                fail('duplicate','Solicitação já utilizada.',409)
            media=_insert_upload(c,prepared,u['id'])
            return save(c,'ministries_resources','ministries',Record(request_id=request_id),{'ministry':ministry,'title':title,'category':category,'notes':encrypt_text(notes),'resource_url':'/api/workspace/materials/'+rid+'/file','file_id':media['id'],'owner_id':u['id'],'expires_on':str(expires_on) if expires_on else None},u)
    return await run_in_threadpool(persist)

@router.get('/materials/{rid}/file')
def material_file(rid:str,u=Depends(session)):
    from fastapi.responses import Response
    from urllib.parse import quote
    with s.db() as c:
        if not allowed(c,u,'ministries'):fail('forbidden','Acesso ao ministério não autorizado.',403)
        resource=current(c,'ministries_resources',rid);check_scope(c,u,'ministries',resource)
        if resource['expires_on'] and resource['expires_on']<s.today():fail('expired','Material fora da validade.',410)
        row=c.execute('SELECT * FROM media WHERE id=?',(resource['file_id'],)).fetchone()
        if not row:fail('missing','Arquivo não encontrado.',404)
        return Response(bytes(row['data']),media_type=row['content_type'],headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(row['filename']), 'Cache-Control':'private, no-store'})


@router.get('/responsibles')
def responsibles(module:str='members',u=Depends(session)):
    if module not in ('members','ministries','finance','kids'):fail('module','Setor inválido.')
    with s.db() as c:
        authority(c,u,module)
        return [dict(r) for r in c.execute('SELECT id,name FROM users WHERE active=1 ORDER BY name LIMIT 1000')]

@router.get('/schedules/{rid}/history')
def schedule_history(rid:str,u=Depends(session)):
    with s.db() as c:
        row=current(c,'ministries_schedules',rid);person=own_person(c,u)
        if not person or person['id']!=row['person_id']:
            authority(c,u,'ministries');check_scope(c,u,'ministries',row)
        return [dict(r,reason=decrypt_text(r['reason'])) for r in c.execute('SELECT previous_status,status,reason,created_at FROM schedule_responses WHERE schedule_id=? ORDER BY created_at',(rid,))]

class ReplaceSchedule(BaseModel):
    person_id:str=Field(max_length=40)
    reason:str=Field(min_length=10,max_length=300)
    version:int=Field(ge=1)

@router.post('/schedules/{rid}/replace')
def replace_schedule(rid:str,data:ReplaceSchedule,u=Depends(session)):
    from .modules.ministries.router import Schedule,persist_schedule
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'ministries');old=current(c,'ministries_schedules',rid);check_scope(c,u,'ministries',old)
        if old['version']!=data.version:fail('conflict','A escala mudou. Atualize antes de substituir.',409)
        if not c.execute('SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1',(data.person_id,old['ministry'])).fetchone():fail('assignment','Escolha alguém da equipe do ministério.')
        payload={k:old[k] for k in Schedule.model_fields if k in old}
        payload.update(person_id=data.person_id,status='pending',version=data.version)
        result=persist_schedule(Schedule(**payload),u,rid,connection=c)
        c.execute('INSERT INTO schedule_responses VALUES(?,?,?,?,?,?,?)',(secrets.token_hex(16),rid,u['id'],old['person_id'],data.person_id,encrypt_text(data.reason),s.now()));s.audit(c,u['id'],'schedule_replaced:'+rid)
    return result



def emit_announcement(c,aid,recipients,actor,title,message,sector):
    from .realtime import publish,dispatch_notification_event
    for uid in set(recipients):
        if not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(uid,)).fetchone():continue
        if uid!=actor:
            nid=c.execute('INSERT INTO notifications(user_id,kind,title,message,sender,created_at,sector,context_id) VALUES(?,?,?,?,?,?,?,?)',(uid,'announcement',title,message,actor,s.now(),sector,aid)).lastrowid
            dispatch_notification_event(c,uid,'announcement',title,message,sector=sector,context_id=aid,notification_id=nid)
        publish('announcement:new',{'id':aid,'title':title,'sector':sector},user_id=uid)


def dispatch_due():
    """Bounded worker job; all jobs claim under the existing transaction lock."""
    from .realtime import dispatch_notification_event
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        for row in c.execute("SELECT * FROM platform_announcements WHERE active=1 AND dispatched=0 AND publish_at<=? ORDER BY publish_at LIMIT 30",(s.now(),)).fetchall():
            if row['expires_at'] and row['expires_at']<=s.now():
                c.execute('UPDATE platform_announcements SET dispatched=1 WHERE id=?',(row['id'],));continue
            author=c.execute('SELECT * FROM users WHERE id=? AND active=1',(row['author_id'],)).fetchone()
            if not author or (not global_manager(c,dict(author)) and (row['target_sector']=='all' or not allowed(c,dict(author),row['target_sector']) or not manager(c,dict(author),row['target_sector']))):
                c.execute('UPDATE platform_announcements SET dispatched=1 WHERE id=?',(row['id'],));s.audit(c,None,'announcement_cancelled_access:'+row['id']);continue
            try:recipients=json.loads(row['audience_ids'])
            except (ValueError,TypeError):recipients=[]
            valid=[]
            for uid in recipients:
                person=c.execute('SELECT * FROM users WHERE id=? AND active=1',(uid,)).fetchone()
                if person and visible_announcement(c,dict(person),dict(row)):valid.append(uid)
            emit_announcement(c,row['id'],valid,row['author_id'],row['title'],row['message'],row['target_sector'])
            c.execute('UPDATE platform_announcements SET dispatched=1 WHERE id=?',(row['id'],));s.audit(c,row['author_id'],'announcement_scheduled_dispatched:'+row['id'])
        for row in c.execute("SELECT ms.*,p.account_user_id FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.active=1 AND p.active=1 AND ms.status='pending' AND ms.reminder_enabled=1 AND ms.reminder_sent=0 AND ms.service_date>=? ORDER BY ms.service_date LIMIT 100",(s.today(),)).fetchall():
            starts=date_time(row['service_date']+'T'+row['service_time']);deadline=date_time(row['response_due_at']) if row['response_due_at'] else starts-timedelta(hours=24)
            if date_time(s.now())<deadline or date_time(s.now())>=starts:continue
            uid=row['account_user_id']
            if not uid or not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(uid,)).fetchone():continue
            message='Confirme sua disponibilidade para '+row['title']+'.'
            nid=c.execute('INSERT INTO notifications(user_id,kind,title,message,created_at,sector,context_id) VALUES(?,?,?,?,?,?,?)',(uid,'ministry_schedule','Escala aguardando resposta',message,s.now(),'ministries',row['id'])).lastrowid
            dispatch_notification_event(c,uid,'ministry_schedule','Escala aguardando resposta',message,sector='ministries',context_id=row['id'],notification_id=nid)
            c.execute('UPDATE ministries_schedules SET reminder_sent=1 WHERE id=?',(row['id'],))

@router.get('/audit/changes')
def changes(page:int=Query(1,ge=1),u=Depends(session)):
    with s.db() as c:
        central(c,u)
        rows=[dict(r) for r in c.execute('SELECT id,module,action,record_id,created_at FROM module_changes ORDER BY created_at DESC LIMIT 50 OFFSET ?',((page-1)*50,))]
        return {'items':rows,'page':page}

@router.get('/audit/changes/{rid}')
def change_detail(rid:str,u=Depends(session)):
    with s.db() as c:
        central(c,u);row=c.execute('SELECT * FROM module_changes WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Alteração não encontrada.',404)
        def snapshot(raw):
            return {k:decrypt_text(v) if isinstance(v,str) else v for k,v in json.loads(raw or '{}').items()}
        return {'before':snapshot(row['before_json']),'after':snapshot(row['after_json']),'module':row['module'],'action':row['action']}


class MergePeople(BaseModel):
    source_id:str=Field(max_length=40)
    target_id:str=Field(max_length=40)
    source_version:int=Field(ge=1)
    target_version:int=Field(ge=1)
    reason:str=Field(min_length=15,max_length=300)
    confirm:bool=False

@router.post('/people/merge')
def merge_people(data:MergePeople,u=Depends(session)):
    if data.source_id==data.target_id:fail('merge','Escolha cadastros diferentes.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');central(c,u)
        source=current(c,'members_people',data.source_id);target=current(c,'members_people',data.target_id)
        if source['version']!=data.source_version or target['version']!=data.target_version:fail('conflict','Um cadastro mudou. Revise a fusão novamente.',409)
        if source['account_user_id'] and target['account_user_id'] and source['account_user_id']!=target['account_user_id']:fail('accounts','Cadastros ligados a contas diferentes precisam de revisão de identidade. As contas não serão fundidas.',409)
        preview={'source':{'id':source['id'],'name':source['name']},'target':{'id':target['id'],'name':target['name']},'preserves_history':True,'requires_confirmation':True}
        if not data.confirm:return preview
        schedules=c.execute('SELECT * FROM ministries_schedules WHERE person_id IN (?,?) AND active=1 AND status!=?',(source['id'],target['id'],'declined')).fetchall()
        from datetime import time as clock
        for left in schedules:
            for right in schedules:
                if left['person_id']==right['person_id']:continue
                a=datetime.combine(date.fromisoformat(left['service_date']),clock.fromisoformat(left['service_time']));b=datetime.combine(date.fromisoformat(right['service_date']),clock.fromisoformat(right['service_time']))
                if a<b+timedelta(minutes=right['duration_minutes']) and b<a+timedelta(minutes=left['duration_minutes']):fail('schedule','Resolva escalas sobrepostas antes de fundir os cadastros.',409)
        for assignment in c.execute('SELECT id,ministry FROM ministries_assignments WHERE person_id=? AND active=1',(source['id'],)).fetchall():
            if c.execute('SELECT 1 FROM ministries_assignments WHERE person_id=? AND ministry=? AND active=1',(target['id'],assignment['ministry'])).fetchone():c.execute('UPDATE ministries_assignments SET active=0,version=version+1 WHERE id=?',(assignment['id'],))
        for table in ('ministries_assignments','ministries_schedules','member_journey'):
            c.execute(f'UPDATE {table} SET person_id=? WHERE person_id=?',(target['id'],source['id']))
        for row in c.execute('SELECT * FROM gc_attendance WHERE person_id=?',(source['id'],)).fetchall():
            if not c.execute('SELECT 1 FROM gc_attendance WHERE meeting_id=? AND person_id=?',(row['meeting_id'],target['id'])).fetchone():c.execute('INSERT INTO gc_attendance VALUES(?,?,?)',(row['meeting_id'],target['id'],row['present']))
        c.execute('DELETE FROM gc_attendance WHERE person_id=?',(source['id'],));c.execute('UPDATE members_self_registrations SET person_id=? WHERE person_id=?',(target['id'],source['id']))
        c.execute('UPDATE members_people SET active=0,version=version+1 WHERE id=?',(source['id'],))
        values={key:source[key] for key in ('account_user_id','family_id','cell_id','phone','email','birthday','address','profession','bio','marital_status','joined_on') if not target.get(key) and source.get(key)}
        values['data_source']='reviewed_merge'
        c.execute('UPDATE members_people SET '+','.join(k+'=?' for k in values)+',version=version+1 WHERE id=?',(*values.values(),target['id']))
        change(c,'members',source['id'],'merged_into:'+target['id'],u,source,dict(source,active=0));change(c,'members',target['id'],'merge_reviewed',u,target,current(c,'members_people',target['id']));s.audit(c,u['id'],'person_merge:'+source['id']+':'+target['id']+':'+s.digest(data.reason))
    return {'ok':True,'id':target['id']}




class TeamInvitation(InviteUser):
    staff_role:str=Field(pattern='^(teacher|monitor|admin)$')
    phone:str=Field(default='',max_length=30)
    rooms:list[int]=Field(default_factory=list,max_length=100)

@router.post('/team-invitations')
def team_invitation(data:TeamInvitation,tasks:BackgroundTasks,u=Depends(session)):
    from .features import mail_ready,send_recovery_mail
    if data.send_email and not mail_ready():fail('mail','SMTP indisponível.',503)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');central(c,u)
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1',(rid,)).fetchone() for rid in data.rooms):fail('room','Turma inválida.')
        result=create_invitation(c,data,u);uid=result['id'];role='admin' if data.staff_role=='admin' else 'teacher'
        c.execute('UPDATE users SET role=?,staff_role=?,phone=? WHERE id=?',(role,data.staff_role,data.phone,uid))
        from .platform_access import kids_grant
        kids_grant(c,uid,role)
        for rid in set(data.rooms):c.execute('INSERT INTO teacher_rooms VALUES(?,?) ON CONFLICT(user_id,room_id) DO NOTHING',(uid,rid))
        s.audit(c,u['id'],'team_invitation_created:'+str(uid))
    if data.send_email:tasks.add_task(send_recovery_mail,email(data.email),'Ative seu acesso — Lagoinha Systems','Defina sua senha em até 48 horas: '+result['url'])
    return result


@router.delete('/finance/transfers/{rid}')
def cancel_transfer(rid:str,u=Depends(session)):
    from .modules.common import archive
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance')
        row=c.execute('SELECT * FROM finance_transfers WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Transferência não encontrada.',404)
        if not global_manager(c,u) and row['created_by']!=u['id']:fail('owner','Somente TI e pastores podem cancelar transferências de outras pessoas.',403)
        if not row['active']:return {'ok':True}
        c.execute('UPDATE finance_transfers SET active=0 WHERE id=?',(rid,))
        for key in ('out_entry','in_entry'):
            entry=current(c,'finance_entries',row[key]);archive(c,'finance_entries','finance',entry['id'],entry['version'],u)
        s.audit(c,u['id'],'finance_transfer_cancelled:'+rid)
    return {'ok':True}


class MfaPolicy(BaseModel):required:bool
@router.put('/users/{uid}/mfa-policy')
def mfa_policy(uid:int,data:MfaPolicy,u=Depends(session)):
    with s.db() as c:
        central(c,u);row=c.execute('SELECT mfa_secret FROM users WHERE id=? AND active=1',(uid,)).fetchone()
        if not row:fail('missing','Conta não encontrada.',404)
        if data.required and not row['mfa_secret']:fail('setup','A pessoa precisa configurar o autenticador antes de exigir o segundo fator.',409)
        c.execute('UPDATE users SET mfa_required=? WHERE id=?',(int(data.required),uid));s.audit(c,u['id'],'mfa_policy:'+str(uid)+':'+str(data.required))
    return {'ok':True}

class ServiceTemplate(BaseModel):
    request_id:UUID
    title:str=Field(min_length=2,max_length=120)
    weekday:int=Field(ge=0,le=6)
    service_time:str=Field(max_length=5)
    duration_minutes:int=Field(ge=15,le=480)
@router.get('/services')
def services(u=Depends(session)):
    with s.db() as c:return [dict(r) for r in c.execute('SELECT * FROM service_templates WHERE active=1 ORDER BY weekday,service_time')]
@router.post('/services')
def create_service(data:ServiceTemplate,u=Depends(session)):
    from datetime import time as clock
    try:clock.fromisoformat(data.service_time)
    except ValueError:fail('time','Informe um horário válido.')
    rid=str(data.request_id)
    with s.db() as c:
        authority(c,u,'ministries');old=c.execute('SELECT * FROM service_templates WHERE id=?',(rid,)).fetchone()
        if old:
            if old['created_by']==u['id'] and all(old[k]==getattr(data,k) for k in ('title','weekday','service_time','duration_minutes')):return {'ok':True,'id':rid}
            fail('duplicate','Solicitação já utilizada.',409)
        c.execute('INSERT INTO service_templates(id,title,weekday,service_time,duration_minutes,created_by,created_at) VALUES(?,?,?,?,?,?,?)',(rid,data.title,data.weekday,data.service_time,data.duration_minutes,u['id'],s.now()));s.audit(c,u['id'],'service_template_created:'+rid)
    return {'ok':True,'id':rid}
@router.delete('/services/{rid}')
def remove_service(rid:str,u=Depends(session)):
    with s.db() as c:
        authority(c,u,'ministries');row=c.execute('SELECT * FROM service_templates WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Horário não encontrado.',404)
        if not global_manager(c,u) and row['created_by']!=u['id']:fail('owner','Você só pode arquivar os próprios horários.',403)
        c.execute('UPDATE service_templates SET active=0 WHERE id=?',(rid,));s.audit(c,u['id'],'service_template_archived:'+rid)
    return {'ok':True}


@router.get('/schedules/{rid}/candidates')
def substitute_candidates(rid:str,u=Depends(session)):
    from datetime import time as clock
    with s.db() as c:
        authority(c,u,'ministries');row=current(c,'ministries_schedules',rid);check_scope(c,u,'ministries',row)
        start=datetime.combine(date.fromisoformat(row['service_date']),clock.fromisoformat(row['service_time']));end=start+timedelta(minutes=row['duration_minutes']);result=[]
        for person in c.execute('SELECT DISTINCT p.id,p.name,p.account_user_id FROM members_people p JOIN ministries_assignments a ON a.person_id=p.id WHERE p.active=1 AND a.active=1 AND a.ministry=? AND p.id!=? ORDER BY p.name',(row['ministry'],row['person_id'])):
            conflicts=False
            for other in c.execute("SELECT * FROM ministries_schedules WHERE active=1 AND status!='declined' AND person_id=? AND service_date>=? AND service_date<=? AND id!=?",(person['id'],str(start.date()-timedelta(days=1)),str(end.date()),rid)):
                a=datetime.combine(date.fromisoformat(other['service_date']),clock.fromisoformat(other['service_time']))
                if a<end and a+timedelta(minutes=other['duration_minutes'])>start:conflicts=True;break
            if person['account_user_id']:
                for unavailable in c.execute('SELECT starts_at,ends_at FROM personal_availability WHERE user_id=?',(person['account_user_id'],)):
                    if date_time(unavailable['starts_at']).replace(tzinfo=None)<end and date_time(unavailable['ends_at']).replace(tzinfo=None)>start:conflicts=True;break
            if not conflicts:result.append({'id':person['id'],'name':person['name']})
        return result

@router.post('/materials/{rid}/revision')
async def material_revision(rid:str,file:UploadFile=File(...),version:int=Form(...,ge=1),u=Depends(session)):
    from .app import MAX_UPLOAD,_prepare_upload,_insert_upload
    from starlette.concurrency import run_in_threadpool
    raw=await file.read(MAX_UPLOAD+1);prepared=await run_in_threadpool(_prepare_upload,raw,file.filename or 'material.pdf')
    def persist():
        with s.db() as c:
            c.execute('BEGIN IMMEDIATE');authority(c,u,'ministries');row=current(c,'ministries_resources',rid);check_scope(c,u,'ministries',row)
            if row['version']!=version:fail('conflict','O material mudou. Atualize antes de enviar outra versão.',409)
            media=_insert_upload(c,prepared,u['id'])
            result=save(c,'ministries_resources','ministries',Record(version=version),{'file_id':media['id'],'owner_id':u['id'],'resource_url':'/api/workspace/materials/'+rid+'/file'},u,rid)
        return result
    return await run_in_threadpool(persist)


@router.post('/finance/transfers/{rid}/restore')
def restore_transfer(rid:str,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');authority(c,u,'finance');row=c.execute('SELECT * FROM finance_transfers WHERE id=?',(rid,)).fetchone()
        if not row:fail('missing','Transferência não encontrada.',404)
        if not global_manager(c,u) and row['created_by']!=u['id']:fail('owner','Você só pode restaurar as próprias transferências.',403)
        if row['active']:return {'ok':True}
        for aid in (row['source_id'],row['target_id']):
            account=current(c,'finance_accounts',aid)
            if account['require_approval']:fail('approval','A conta exige conferência. Solicite revisão administrativa antes de restaurar a transferência.',409)
        for eid in (row['out_entry'],row['in_entry']):
            raw=c.execute('SELECT * FROM finance_entries WHERE id=? AND active=0',(eid,)).fetchone()
            if not raw:fail('conflict','As movimentações precisam ser revisadas antes de restaurar.',409)
            old=dict(raw);c.execute('UPDATE finance_entries SET active=1,version=version+1 WHERE id=?',(eid,));change(c,'finance',eid,'restored_transfer',u,old,current(c,'finance_entries',eid))
        c.execute('UPDATE finance_transfers SET active=1 WHERE id=?',(rid,));s.audit(c,u['id'],'finance_transfer_restored:'+rid)
    return {'ok':True}
