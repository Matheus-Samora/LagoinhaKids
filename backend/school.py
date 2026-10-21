from datetime import datetime,date,timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter,Depends
from pydantic import BaseModel,Field
from . import store as s
from .app import session,staff,admin,fail,room_allowed,child_allowed,child_visible

router=APIRouter(prefix='/api')
TZ=ZoneInfo('America/Sao_Paulo')
def current_time():return datetime.now(TZ)
def age_on(birth,day):
    b=date.fromisoformat(str(birth));d=date.fromisoformat(str(day)[:10])
    return d.year-b.year-((d.month,d.day)<(b.month,b.day))
def validate_birth(birth):
    if not 0<=age_on(birth,s.today())<=17:fail('birthday','Informe o nascimento de uma criança de até 17 anos.')
def room_for_edit(c,user,rid):
    r=c.execute('SELECT * FROM rooms WHERE id=?',(rid,)).fetchone()
    if not r:fail('missing','Turma não encontrada.',404)
    if not room_allowed(c,user,rid):fail('forbidden','Você só pode gerenciar suas próprias turmas.',403)
    return r
def publish_notice(c,actor,ch,title,message):
    if ch['parent_id']:c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?,?)',(ch['parent_id'],ch['id'],'lesson_update',title,message,actor,s.now()))

class RoomIn(BaseModel):
    name:str=Field(min_length=2,max_length=80)
    min_age:int=Field(ge=0,le=17)
    max_age:int=Field(ge=0,le=17)
    capacity:int=Field(ge=1,le=100)
    owner_id:int|None=None
    teacher_id:int|None=None
    monitor_id:int|None=None
    version:int|None=Field(default=None,ge=1)
    cover_url:str|None=Field(default='',max_length=500)
def validate_room(c,data,user,is_edit=False):
    if not data.name.strip() or data.max_age<data.min_age:fail('room','Confira o nome e a faixa etária.')
    if data.cover_url and not (data.cover_url.startswith('https://') or data.cover_url.startswith('/api/media/') or data.cover_url.startswith('/')):
        fail('cover','A imagem de capa deve usar HTTPS ou ser enviada pelo app.')
    owner=data.teacher_id or data.owner_id or user['id']
    if not is_edit and user['role']!='admin' and owner!=user['id']:fail('owner','Você só pode criar turmas em seu próprio nome.',403)
    if not c.execute('SELECT 1 FROM users WHERE id=? AND role IN ("teacher","admin") AND active=1',(owner,)).fetchone():fail('owner','Escolha um professor ou administrador ativo.')
    if data.monitor_id and not c.execute('SELECT 1 FROM users WHERE id=? AND active=1 AND role IN ("teacher","admin")',(data.monitor_id,)).fetchone():
        fail('monitor','Monitor inválido.')
    return owner
def sync_owner(c,rid,owner):
    room=c.execute('SELECT monitor_id FROM rooms WHERE id=?',(rid,)).fetchone()
    c.execute('DELETE FROM teacher_rooms WHERE room_id=?',(rid,))
    role_row = c.execute('SELECT role FROM users WHERE id=?',(owner,)).fetchone()
    if role_row and role_row[0]=='teacher':
        c.execute('INSERT OR IGNORE INTO teacher_rooms VALUES(?,?)',(owner,rid))
    if room and room['monitor_id']:
        c.execute('INSERT OR IGNORE INTO teacher_rooms VALUES(?,?)',(room['monitor_id'],rid))

@router.get('/rooms')
def rooms(user=Depends(session)):
    with s.db() as c:
        rows=c.execute('''
            SELECT r.*,
                   coalesce(ut.name, u.name, 'Equipe Lagoinha Kids') owner_name,
                   coalesce(ut.name, u.name, 'Equipe Lagoinha Kids') teacher_name,
                   coalesce(ut.avatar_url, '') teacher_avatar,
                   coalesce(um.name, '') monitor_name,
                   coalesce(um.avatar_url, '') monitor_avatar
            FROM rooms r
            LEFT JOIN users u ON u.id=r.created_by
            LEFT JOIN users ut ON ut.id=coalesce(r.teacher_id, r.created_by)
            LEFT JOIN users um ON um.id=r.monitor_id
            WHERE r.active=1
            ORDER BY r.name
        ''').fetchall()
        if user['role']=='parent':return [{k:r[k] for k in ('id','name','min_age','max_age','capacity','color','cover_url','owner_name','teacher_id','teacher_name','teacher_avatar','monitor_id','monitor_name','monitor_avatar')} for r in rows]
        result=[]
        for r in rows:
            if not room_allowed(c,user,r['id']):continue
            total=c.execute('SELECT count(*) FROM children ch WHERE ch.archived=0 AND (ch.room_id=? OR EXISTS(SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=ch.id AND b.confirmed=1 AND l.room_id=? AND l.active=1))',(r['id'],r['id'])).fetchone()[0]
            present=c.execute('SELECT count(*) FROM attendance a JOIN children ch ON ch.id=a.child_id WHERE ch.archived=0 AND ch.room_id=? AND a.day=? AND a.status="present"',(r['id'],s.today())).fetchone()[0]
            teachers=[dict(t) for t in c.execute('SELECT u.id,u.name,coalesce(u.staff_role,"teacher") staff_role FROM users u JOIN teacher_rooms tr ON tr.user_id=u.id WHERE tr.room_id=? AND u.active=1',(r['id'],))]
            result.append(dict(r)|{'total':total,'present':present,'teachers':teachers})
        return result
@router.post('/rooms')
def create_room(data:RoomIn,user=Depends(staff)):
    with s.db() as c:
        owner=validate_room(c,data,user,is_edit=False)
        t_id=data.teacher_id or owner
        m_id=data.monitor_id
        rid=c.execute('INSERT INTO rooms(name,min_age,max_age,capacity,color,cover_url,created_by,teacher_id,monitor_id) VALUES(?,?,?,?,?,?,?,?,?)',(data.name.strip(),data.min_age,data.max_age,data.capacity,'#27272a',data.cover_url or '',owner,t_id,m_id)).lastrowid
        sync_owner(c,rid,owner);s.audit(c,user['id'],'room_created')
    return {'id':rid}
@router.patch('/rooms/{rid}')
def edit_room(rid:int,data:RoomIn,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        existing=room_for_edit(c,user,rid)
        from .modules.common import preserve_omitted
        data=preserve_omitted(data,existing)
        if data.version is not None and data.version!=existing['version']:fail('conflict','Esta turma foi alterada. Atualize a tela e confira antes de salvar.',409)
        if user['role']!='admin':
            owner=existing['teacher_id'] or existing['created_by'] or user['id']
        else:
            owner=data.teacher_id or data.owner_id or existing['teacher_id'] or existing['created_by'] or user['id']
        if user['role']!='admin' and data.teacher_id is not None and data.teacher_id!=owner:
            fail('owner','Somente a administração pode transferir a turma.',403)
        data=data.model_copy(update={'owner_id':owner,'teacher_id':owner})
        owner=validate_room(c,data,user,is_edit=True)
        t_id=data.teacher_id or owner
        m_id=data.monitor_id
        maximum=c.execute('SELECT coalesce(max(n),0) FROM (SELECT count(*) n FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE l.room_id=? AND l.active=1 AND l.ends_at>? AND b.confirmed=1 GROUP BY l.id)',(rid,s.now())).fetchone()[0]
        if maximum>data.capacity:fail('capacity','Já existem aulas com mais confirmações que essa capacidade.',409)
        booked=c.execute('SELECT ch.birthday,l.starts_at FROM reservations b JOIN lessons l ON l.id=b.lesson_id JOIN children ch ON ch.id=b.child_id WHERE l.room_id=? AND l.active=1 AND l.ends_at>? AND b.confirmed=1',(rid,s.now())).fetchall()
        if any(not data.min_age<=age_on(row['birthday'],row['starts_at'])<=data.max_age for row in booked):fail('age','A nova faixa etária exclui alunos já confirmados. Ajuste as confirmações antes.',409)
        c.execute('UPDATE rooms SET name=?,min_age=?,max_age=?,capacity=?,cover_url=?,created_by=?,teacher_id=?,monitor_id=?,version=version+1 WHERE id=?',(data.name.strip(),data.min_age,data.max_age,data.capacity,data.cover_url or '',owner,t_id,m_id,rid))
        sync_owner(c,rid,owner);s.audit(c,user['id'],'room_updated')
    return {'ok':True}
@router.delete('/rooms/{rid}')
def archive_room(rid:int,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        room_for_edit(c,user,rid)
        if c.execute('SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE l.room_id=? AND l.active=1 AND l.ends_at>? AND b.confirmed=1',(rid,s.now())).fetchone():fail('bookings','Cancele as aulas com presenças confirmadas antes de excluir a turma.',409)
        if c.execute('SELECT 1 FROM attendance a JOIN children ch ON ch.id=a.child_id WHERE ch.room_id=? AND a.day=? AND a.status="present"',(rid,s.today())).fetchone():fail('present','Há crianças na salinha. Confira as saídas antes de excluir.',409)
        c.execute('UPDATE rooms SET active=0 WHERE id=?',(rid,));c.execute('UPDATE lessons SET active=0 WHERE room_id=? AND ends_at>?',(rid,s.now()));c.execute('DELETE FROM teacher_rooms WHERE room_id=?',(rid,));s.audit(c,user['id'],'room_deleted')
    return {'ok':True}

class ChildIn(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    birthday:date
    room_id:int|None=None
    parent_id:int|None=None
    avatar_url:str|None=Field(default=None,max_length=500)
    allergies:str|None=Field(default='',max_length=250)
    medical_conditions:str|None=Field(default='',max_length=250)
    emergency_medication:str|None=Field(default='',max_length=250)
    special_needs:str|None=Field(default='',max_length=250)
    authorized_pickups:str|None=Field(default='',max_length=250)

def validate_child(c,data,user):
    validate_birth(data.birthday)
    if not data.name.strip():fail('name','Informe o nome da criança.')
    if data.avatar_url and not (data.avatar_url.startswith('https://') or data.avatar_url.startswith('http://') or data.avatar_url.startswith('/api/media/') or data.avatar_url.startswith('/')):
        fail('avatar','A foto da criança deve usar HTTPS ou ser enviada pelo app.')
    if user['role']=='parent':
        if data.parent_id not in (None,user['id']) or data.room_id is not None:fail('parent','O cadastro será vinculado à sua conta. Escolha a turma ao confirmar uma aulinha.',403)
        return user['id'],None
    if data.room_id is None or not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1',(data.room_id,)).fetchone() or not room_allowed(c,user,data.room_id):fail('room','Selecione uma das suas turmas.',403)
    if user['role']!='admin' and data.parent_id:fail('parent','Somente a administração pode vincular outro responsável.',403)
    if data.parent_id and not c.execute('SELECT 1 FROM users WHERE id=? AND role="parent" AND active=1',(data.parent_id,)).fetchone():fail('parent','Responsável inválido.')
    return data.parent_id,data.room_id

@router.get('/children')
def children(lesson_id:int|None=None,user=Depends(session)):
    with s.db() as c:
        if lesson_id is not None:
            lesson=c.execute('SELECT * FROM lessons WHERE id=?',(lesson_id,)).fetchone()
            if not lesson or (user['role']!='parent' and not room_allowed(c,user,lesson['room_id'])):fail('lesson','Aula não permitida.',403)
        rows=c.execute('SELECT ch.id,ch.name,ch.birthday,ch.room_id,ch.parent_id,ch.face_allowed,ch.consent_at,ch.face_template IS NOT NULL face_enrolled,coalesce(r.name,"Ainda sem turma") room_name,coalesce(r.color,"#e4e4e7") color,coalesce(ch.avatar_url,"") avatar_url,u.name parent_name,u.email parent_email,coalesce(a.status,"absent") status,a.in_at,a.out_at,coalesce(ch.allergies,"") allergies,coalesce(ch.medical_conditions,"") medical_conditions,coalesce(ch.emergency_medication,"") emergency_medication,coalesce(ch.special_needs,"") special_needs,coalesce(ch.authorized_pickups,"") authorized_pickups,coalesce(a.claim_code,"") claim_code,coalesce(a.checkout_guardian,"") checkout_guardian FROM children ch LEFT JOIN rooms r ON r.id=ch.room_id LEFT JOIN users u ON u.id=ch.parent_id LEFT JOIN attendance a ON a.child_id=ch.id AND a.day=? WHERE ch.archived=0 AND (?!="parent" OR ch.parent_id=? OR EXISTS(SELECT 1 FROM family_links f WHERE f.child_id=ch.id AND f.user_id=? AND f.active=1)) ORDER BY ch.name',(s.today(),user['role'],user['id'],user['id'])).fetchall()
        result=[]
        for row in rows:
            if not child_visible(c,user,row):continue
            if lesson_id is not None and not c.execute('SELECT 1 FROM reservations WHERE child_id=? AND lesson_id=? AND confirmed=1',(row['id'],lesson_id)).fetchone():continue
            result.append(dict(row))
        return result

@router.post('/children')
def create_child(data:ChildIn,user=Depends(session)):
    with s.db() as c:
        parent,rid=validate_child(c,data,user)
        cid=c.execute('INSERT INTO children(name,birthday,room_id,parent_id,created_at,avatar_url,allergies,medical_conditions,emergency_medication,special_needs,authorized_pickups) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(data.name.strip(),str(data.birthday),rid,parent,s.now(),(data.avatar_url or '').strip(),(data.allergies or '').strip(),(data.medical_conditions or '').strip(),(data.emergency_medication or '').strip(),(data.special_needs or '').strip(),(data.authorized_pickups or '').strip())).lastrowid
        s.audit(c,user['id'],'child_created',cid)
    return {'id':cid}

@router.patch('/children/{cid}')
def edit_child(cid:int,data:ChildIn,user=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=child_allowed(c,user,cid)
        health_fields=('allergies','medical_conditions','emergency_medication','special_needs','authorized_pickups')
        for key in health_fields:
            if key not in data.model_fields_set:data=data.model_copy(update={key:old[key]})
        if user['role']=='teacher' and any((getattr(data,key) or '').strip()!=old[key] for key in health_fields):fail('owner','Cuidados e autorizações devem ser atualizados pela família ou administração.',403)
        if user['role']=='teacher' and old['parent_id'] is not None and (data.name.strip()!=old['name'] or str(data.birthday)!=old['birthday']):
            fail('forbidden','Apenas a família ou a administração pode alterar o nome civil e nascimento da criança.',403)
        parent,rid=validate_child(c,data,user)
        if user['role']!='parent' and data.parent_id is None:parent=old['parent_id']
        booked=c.execute('SELECT r.min_age,r.max_age,l.starts_at FROM reservations b JOIN lessons l ON l.id=b.lesson_id JOIN rooms r ON r.id=l.room_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.ends_at>?',(cid,s.now())).fetchall()
        if any(not r['min_age']<=age_on(data.birthday,r['starts_at'])<=r['max_age'] for r in booked):fail('age','Cancele as aulas incompatíveis antes de alterar o nascimento.',409)
        if user['role']=='parent':
            if old['parent_id']!=user['id']:fail('owner','Somente o responsável principal pode editar o cadastro.',403)
            rid=old['room_id']
        target_avatar=data.avatar_url.strip() if data.avatar_url is not None else (old['avatar_url'] if 'avatar_url' in old.keys() else '')
        c.execute('UPDATE children SET name=?,birthday=?,room_id=?,parent_id=?,avatar_url=?,allergies=?,medical_conditions=?,emergency_medication=?,special_needs=?,authorized_pickups=? WHERE id=?',(data.name.strip(),str(data.birthday),rid,parent,target_avatar,(data.allergies or '').strip(),(data.medical_conditions or '').strip(),(data.emergency_medication or '').strip(),(data.special_needs or '').strip(),(data.authorized_pickups or '').strip(),cid))
        if parent!=old['parent_id']:
            c.execute('UPDATE children SET face_allowed=0,face_template=NULL,consent_at=NULL WHERE id=?',(cid,))
            c.execute('UPDATE family_links SET active=0 WHERE child_id=?',(cid,));c.execute('DELETE FROM family_invites WHERE child_id=?',(cid,))
        s.audit(c,user['id'],'child_updated',cid)
    return {'ok':True}

class ChildAvatarIn(BaseModel):
    avatar_url:str=Field(default='',max_length=500)

@router.post('/children/{cid}/avatar')
def update_child_avatar(cid:int,data:ChildAvatarIn,user=Depends(session)):
    url=data.avatar_url.strip()
    if url and not (url.startswith('https://') or url.startswith('http://') or url.startswith('/api/media/') or url.startswith('/')):
        fail('invalid_url','URL de foto da criança inválida.')
    with s.db() as c:
        child_allowed(c,user,cid)
        c.execute('UPDATE children SET avatar_url=? WHERE id=?',(url,cid))
        s.audit(c,user['id'],'child_avatar_updated',cid)
    return {'ok':True,'avatar_url':url}
@router.delete('/children/{cid}')
def archive_child(cid:int,user=Depends(session)):
    if user['role']=='teacher':fail('forbidden','Somente a família ou a administração pode arquivar o cadastro.',403)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        child=child_allowed(c,user,cid)
        if user['role']=='parent' and child['parent_id']!=user['id']:fail('owner','Somente o responsável principal pode arquivar o cadastro.',403)
        if c.execute('SELECT 1 FROM attendance WHERE child_id=? AND day=? AND status="present"',(cid,s.today())).fetchone():fail('present','A criança está na salinha. Confira a saída antes de arquivar.',409)
        c.execute('DELETE FROM waitlist WHERE child_id=?',(cid,))
        c.execute('UPDATE family_links SET active=0 WHERE child_id=?',(cid,))
        c.execute('UPDATE children SET archived=1,face_allowed=0,face_template=NULL,consent_at=NULL WHERE id=?',(cid,))
        c.execute('UPDATE reservations SET confirmed=0,updated_at=? WHERE child_id=? AND lesson_id IN(SELECT id FROM lessons WHERE ends_at>?)',(s.now(),cid,s.now()));s.audit(c,user['id'],'child_archived',cid)
    return {'ok':True}

class LessonIn(BaseModel):
    room_id:int
    title:str=Field(default='Aulinha',min_length=2,max_length=80)
    starts_at:datetime
    ends_at:datetime
    repeat_weeks:int=Field(default=1,ge=1,le=12)
    teacher_id:int|None=None
    monitor_id:int|None=None
    materials_url:str|None=Field(default='',max_length=500)
    notes:str|None=Field(default='',max_length=2000)
def validate_lesson_staff(c,data,user):
    for uid in (data.teacher_id,data.monitor_id):
        if uid is None:continue
        member=c.execute('SELECT * FROM users WHERE id=? AND active=1 AND role IN ("teacher","admin")',(uid,)).fetchone()
        if not member or not room_allowed(c,dict(member),data.room_id):
            fail('staff','Escolha um membro da equipe vinculado a esta turma.')
    url=(data.materials_url or '').strip()
    if url and not (url.startswith('https://') or url.startswith('/api/media/')):
        fail('materials','Use um link HTTPS ou envie o material pelo aplicativo.')

def normalize_lesson(c,data,user,lid=None):
    if not data.title.strip():fail('title','Informe o nome da aulinha.')
    room=room_for_edit(c,user,data.room_id)
    validate_lesson_staff(c,data,user)
    if not room['active']:fail('room','Turma arquivada.')
    start=(data.starts_at.replace(tzinfo=TZ) if data.starts_at.tzinfo is None else data.starts_at.astimezone(TZ))
    end=(data.ends_at.replace(tzinfo=TZ) if data.ends_at.tzinfo is None else data.ends_at.astimezone(TZ))
    if end<=start or start.date()!=end.date() or end<=current_time():fail('schedule','Informe início e fim no mesmo dia, com término no futuro.')
    if c.execute('SELECT 1 FROM lessons WHERE room_id=? AND active=1 AND starts_at<? AND ends_at>? AND id!=?',(data.room_id,end.isoformat(timespec='seconds'),start.isoformat(timespec='seconds'),lid or -1)).fetchone():fail('overlap','A turma já tem uma aula nesse horário.',409)
    return start.isoformat(timespec='seconds'),end.isoformat(timespec='seconds')
@router.get('/lessons')
def lessons(user=Depends(session)):
    with s.db() as c:
        rows=c.execute('''
            SELECT l.*,
                   r.name room_name, r.min_age, r.max_age, r.capacity,
                   coalesce(ut.name, u.name, 'Equipe Lagoinha Kids') teacher_name,
                   coalesce(ut.avatar_url, '') teacher_avatar,
                   coalesce(um.name, '') monitor_name,
                   coalesce(um.avatar_url, '') monitor_avatar
            FROM lessons l
            JOIN rooms r ON r.id=l.room_id
            LEFT JOIN users u ON u.id=r.created_by
            LEFT JOIN users ut ON ut.id=coalesce(l.teacher_id, r.teacher_id, r.created_by)
            LEFT JOIN users um ON um.id=coalesce(l.monitor_id, r.monitor_id)
            WHERE l.active=1 AND r.active=1 AND l.ends_at>?
            ORDER BY l.starts_at
        ''',(s.now(),)).fetchall()
        result=[]
        for row in rows:
            if user['role']!='parent' and not room_allowed(c,user,row['room_id']):continue
            booked=[dict(b) for b in c.execute('SELECT b.child_id,ch.name FROM reservations b JOIN children ch ON ch.id=b.child_id WHERE b.lesson_id=? AND b.confirmed=1 AND ch.archived=0',(row['id'],))]
            own={r[0] for r in c.execute('SELECT id FROM children WHERE archived=0 AND (parent_id=? OR EXISTS(SELECT 1 FROM family_links f WHERE f.child_id=children.id AND f.user_id=? AND f.active=1))',(user['id'],user['id']))} if user['role']=='parent' else set()
            waiting=[r[0] for r in c.execute('SELECT child_id FROM waitlist WHERE lesson_id=? ORDER BY id',(row['id'],))]
            result.append(dict(row)|{'waiting_children':[cid for cid in waiting if user['role']!='parent' or cid in own],'waiting_count':len(waiting),'confirmed_count':len(booked),'available':max(0,row['capacity']-len(booked)),'confirmed_children':[b['child_id'] for b in booked if user['role']!='parent' or b['child_id'] in own]})
        return result
@router.post('/lessons')
def create_lesson(data:LessonIn,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        target_room=c.execute('SELECT teacher_id, created_by, monitor_id FROM rooms WHERE id=?',(data.room_id,)).fetchone()
        t_id=data.teacher_id or (target_room['teacher_id'] if target_room else None) or (target_room['created_by'] if target_room else None) or user['id']
        m_id=data.monitor_id or (target_room['monitor_id'] if target_room else None)
        ids=[]
        for week in range(data.repeat_weeks):
            occurrence=data.model_copy(update={'starts_at':data.starts_at+timedelta(weeks=week),'ends_at':data.ends_at+timedelta(weeks=week)})
            start,end=normalize_lesson(c,occurrence,user)
            ids.append(c.execute('''
                INSERT INTO lessons(room_id,title,starts_at,ends_at,created_by,teacher_id,monitor_id,materials_url,notes)
                VALUES(?,?,?,?,?,?,?,?,?)
            ''',(data.room_id,data.title.strip(),start,end,user['id'],t_id,m_id,(data.materials_url or '').strip(),(data.notes or '').strip())).lastrowid)
        s.audit(c,user['id'],'lesson_created')
    return {'id':ids[0],'ids':ids}
@router.patch('/lessons/{lid}')
def edit_lesson(lid:int,data:LessonIn,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');old=c.execute('SELECT * FROM lessons WHERE id=? AND active=1',(lid,)).fetchone()
        if not old:fail('missing','Aula não encontrada.',404)
        from .modules.common import preserve_omitted
        data=preserve_omitted(data,old)
        room_for_edit(c,user,old['room_id']);start,end=normalize_lesson(c,data,user,lid)
        booked=c.execute('SELECT ch.* FROM reservations b JOIN children ch ON ch.id=b.child_id WHERE b.lesson_id=? AND b.confirmed=1',(lid,)).fetchall()
        if booked and data.room_id!=old['room_id']:fail('room','Cancele as confirmações antes de trocar a turma.',409)
        for ch in booked:
            if c.execute('SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.id!=? AND l.starts_at<? AND l.ends_at>?',(ch['id'],lid,end,start)).fetchone():fail('overlap','O novo horário conflita com outra aula de um aluno confirmado.',409)
            room=c.execute('SELECT * FROM rooms WHERE id=?',(data.room_id,)).fetchone()
            if not room['min_age']<=age_on(ch['birthday'],start)<=room['max_age']:fail('age','A nova data é incompatível com a idade de um aluno confirmado.',409)
        target_room=c.execute('SELECT teacher_id, created_by, monitor_id FROM rooms WHERE id=?',(data.room_id,)).fetchone()
        t_id=data.teacher_id or (target_room['teacher_id'] if target_room else None) or old['teacher_id'] or user['id']
        m_id=data.monitor_id if data.monitor_id is not None else old['monitor_id']
        c.execute('''
            UPDATE lessons
            SET room_id=?,title=?,starts_at=?,ends_at=?,teacher_id=?,monitor_id=?,materials_url=?,notes=?
            WHERE id=?
        ''',(data.room_id,data.title.strip(),start,end,t_id,m_id,(data.materials_url or '').strip(),(data.notes or '').strip(),lid))
        for ch in booked:publish_notice(c,user['id'],ch,'Horário da aulinha atualizado',f'{data.title}: {start[:10]} às {start[11:16]}. Confira a agenda no aplicativo.')
        s.audit(c,user['id'],'lesson_updated')
    return {'ok':True}
@router.delete('/lessons/{lid}')
def cancel_lesson(lid:int,user=Depends(staff)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        lesson=c.execute('SELECT * FROM lessons WHERE id=?',(lid,)).fetchone()
        if not lesson:fail('missing','Aula não encontrada.',404)
        room_for_edit(c,user,lesson['room_id'])
        for ch in c.execute('SELECT ch.* FROM children ch JOIN reservations b ON b.child_id=ch.id WHERE b.lesson_id=? AND b.confirmed=1',(lid,)).fetchall():publish_notice(c,user['id'],ch,'Aulinha cancelada',f'A aula {lesson["title"]} de {lesson["starts_at"][:10]} foi cancelada pela equipe.')
        c.execute('UPDATE lessons SET active=0 WHERE id=?',(lid,));c.execute('UPDATE reservations SET confirmed=0,updated_at=? WHERE lesson_id=?',(s.now(),lid));s.audit(c,user['id'],'lesson_cancelled')
    return {'ok':True}
class ReservationIn(BaseModel):child_id:int
@router.post('/lessons/{lid}/presence')
def confirm_presence(lid:int,data:ReservationIn,user=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        ch=child_allowed(c,user,data.child_id)
        lesson=c.execute('SELECT l.*,r.min_age,r.max_age,r.capacity,r.active room_active FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.id=?',(lid,)).fetchone()
        if not lesson or not lesson['active'] or not lesson['room_active'] or lesson['ends_at']<=s.now():fail('closed','Esta aulinha não está mais disponível.',409)
        if user['role']!='parent':room_for_edit(c,user,lesson['room_id'])
        if not lesson['min_age']<=age_on(ch['birthday'],lesson['starts_at'])<=lesson['max_age']:fail('age','Esta aulinha não atende à idade da criança.')
        existing=c.execute('SELECT confirmed FROM reservations WHERE lesson_id=? AND child_id=?',(lid,ch['id'])).fetchone()
        if existing and existing['confirmed']:return {'ok':True,'already_confirmed':True}
        if c.execute('SELECT count(*) FROM reservations WHERE lesson_id=? AND confirmed=1',(lid,)).fetchone()[0]>=lesson['capacity']:fail('full','As vagas desta aulinha foram preenchidas.',409)
        if c.execute('SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.starts_at<? AND l.ends_at>?',(ch['id'],lesson['ends_at'],lesson['starts_at'])).fetchone():fail('overlap','A criança já está confirmada em outra aula nesse horário.',409)
        c.execute('DELETE FROM waitlist WHERE lesson_id=? AND child_id=?',(lid,ch['id']))
        c.execute('INSERT INTO reservations VALUES(?,?,?,?,?) ON CONFLICT(lesson_id,child_id) DO UPDATE SET confirmed=1,created_by=excluded.created_by,updated_at=excluded.updated_at',(lid,ch['id'],1,user['id'],s.now()));s.audit(c,user['id'],'lesson_presence_confirmed',ch['id'])
    return {'ok':True,'physical_check_in':False}
@router.delete('/lessons/{lid}/presence/{cid}')
def cancel_presence(lid:int,cid:int,user=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        child_allowed(c,user,cid);lesson=c.execute('SELECT * FROM lessons WHERE id=?',(lid,)).fetchone()
        if not lesson:fail('missing','Aula não encontrada.',404)
        if user['role']!='parent':room_for_edit(c,user,lesson['room_id'])
        if user['role']=='parent' and lesson['ends_at']<=s.now():fail('closed','Esta aula já terminou.',409)
        if user['role']=='parent' and lesson['starts_at'][:10]==s.today() and c.execute('SELECT 1 FROM attendance WHERE child_id=? AND day=? AND status="present"',(cid,s.today())).fetchone():fail('present','A criança está na salinha. Converse com a equipe antes de cancelar.',409)
        c.execute('UPDATE reservations SET confirmed=0,updated_at=? WHERE lesson_id=? AND child_id=?',(s.now(),lid,cid));s.audit(c,user['id'],'lesson_presence_cancelled',cid)
        promote_waitlist(c,lid)
    return {'ok':True}


def promote_waitlist(c,lid):
    lesson=c.execute('SELECT l.*,r.capacity,r.min_age,r.max_age,r.active room_active FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.id=?',(lid,)).fetchone()
    if not lesson or not lesson['active'] or not lesson['room_active'] or lesson['ends_at']<=s.now():return
    count=c.execute('SELECT count(*) FROM reservations WHERE lesson_id=? AND confirmed=1',(lid,)).fetchone()[0]
    for entry in c.execute('SELECT w.*,ch.birthday,ch.parent_id,ch.archived FROM waitlist w JOIN children ch ON ch.id=w.child_id WHERE w.lesson_id=? ORDER BY w.id',(lid,)).fetchall():
        if count>=lesson['capacity']:break
        conflict=c.execute('SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.starts_at<? AND l.ends_at>?',(entry['child_id'],lesson['ends_at'],lesson['starts_at'])).fetchone()
        valid=not entry['archived'] and lesson['min_age']<=age_on(entry['birthday'],lesson['starts_at'])<=lesson['max_age'] and not conflict
        c.execute('DELETE FROM waitlist WHERE id=?',(entry['id'],))
        if valid:
            c.execute('INSERT INTO reservations VALUES(?,?,1,?,?) ON CONFLICT(lesson_id,child_id) DO UPDATE SET confirmed=1,created_by=excluded.created_by,updated_at=excluded.updated_at',(lid,entry['child_id'],entry['actor'],s.now()))
            count+=1
            ch={'id':entry['child_id'],'parent_id':entry['parent_id']}
            publish_notice(c,lesson['created_by'],ch,'Vaga confirmada na aulinha',f'Surgiu uma vaga em {lesson["title"]}, dia {lesson["starts_at"][:10]} às {lesson["starts_at"][11:16]}. Sua participação foi confirmada. Cancele pelo app se não puder comparecer.')
            s.audit(c,entry['actor'],'waitlist_promoted',entry['child_id'])

@router.post('/lessons/{lid}/waitlist')
def join_waitlist(lid:int,data:ReservationIn,user=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');ch=child_allowed(c,user,data.child_id)
        if user['role']!='parent':
            target=c.execute('SELECT room_id FROM lessons WHERE id=?',(lid,)).fetchone()
            if not target:fail('missing','Aulinha não encontrada.',404)
            room_for_edit(c,user,target['room_id'])
        lesson=c.execute('SELECT l.*,r.capacity,r.min_age,r.max_age FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.id=? AND l.active=1 AND r.active=1 AND l.ends_at>?',(lid,s.now())).fetchone()
        if not lesson:fail('closed','Aulinha indisponível.',409)
        if not lesson['min_age']<=age_on(ch['birthday'],lesson['starts_at'])<=lesson['max_age']:fail('age','Faixa etária incompatível.')
        if c.execute('SELECT 1 FROM reservations WHERE lesson_id=? AND child_id=? AND confirmed=1',(lid,ch['id'])).fetchone():fail('confirmed','A criança já está confirmada.',409)
        if c.execute('SELECT count(*) FROM reservations WHERE lesson_id=? AND confirmed=1',(lid,)).fetchone()[0]<lesson['capacity']:fail('available','Há vagas. Confirme a presença diretamente.',409)
        c.execute('INSERT OR IGNORE INTO waitlist(lesson_id,child_id,actor,created_at) VALUES(?,?,?,?)',(lid,ch['id'],user['id'],s.now()));s.audit(c,user['id'],'waitlist_joined',ch['id'])
    return {'ok':True}
@router.delete('/lessons/{lid}/waitlist/{cid}')
def leave_waitlist(lid:int,cid:int,user=Depends(session)):
    with s.db() as c:
        child_allowed(c,user,cid)
        c.execute('DELETE FROM waitlist WHERE lesson_id=? AND child_id=?',(lid,cid))
    return {'ok':True}
