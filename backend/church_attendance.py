"""Service attendance with server-side time and geofence validation."""
import math
from datetime import datetime,timedelta
from uuid import UUID
from zoneinfo import ZoneInfo
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail
from .record_policy import manager,global_manager
from .person_identity import linked_person
from .modules.common import encrypt_text,decrypt_text

router=APIRouter(prefix='/api/workspace/church-attendance',tags=['Church attendance'])
ZONE=ZoneInfo('America/Sao_Paulo')
def clock():return datetime.now(ZONE)
def stamp(value):
    try:
        parsed=datetime.fromisoformat(value)
        if parsed.tzinfo is None:parsed=parsed.replace(tzinfo=ZONE)
        return parsed.astimezone(ZONE)
    except (ValueError,TypeError):fail('date','Informe uma data e horário válidos.')
def manage(c,u):
    if not manager(c,u,'members'):fail('permission','A gestão de presença é exclusiva da liderança de Members, pastores e TI.',403)
def event(c,rid):
    row=c.execute('SELECT * FROM church_services WHERE id=?',(rid,)).fetchone()
    if not row:fail('missing','Culto não encontrado.',404)
    return dict(row)
def in_window(row,now):return stamp(row['opens_at'])<=now<=stamp(row['closes_at'])
def distance(lat1,lon1,lat2,lon2):
    a,b=math.radians(lat1),math.radians(lat2)
    h=math.sin((b-a)/2)**2+math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 6371000*2*math.asin(min(1,math.sqrt(h)))

class Service(BaseModel):
    request_id:UUID
    version:int=Field(default=1,ge=1)
    title:str=Field(min_length=2,max_length=120)
    starts_at:str=Field(max_length=40)
    ends_at:str=Field(max_length=40)
    location:str=Field(min_length=2,max_length=180)
    latitude:float=Field(ge=-90,le=90,allow_inf_nan=False)
    longitude:float=Field(ge=-180,le=180,allow_inf_nan=False)
    radius_m:int=Field(default=150,ge=30,le=1000)
    early_minutes:int=Field(default=15,ge=0,le=180)
    late_minutes:int=Field(default=30,ge=0,le=480)

def values(data):
    if len(data.title.strip())<2 or len(data.location.strip())<2:fail('required','Informe nome e local do culto.')
    start,end=stamp(data.starts_at),stamp(data.ends_at)
    if end<=start or end-start>timedelta(hours=12):fail('period','O fim deve ser após o início, com duração máxima de 12 horas.')
    return (data.title.strip(),start.isoformat(),end.isoformat(),data.location.strip(),data.latitude,data.longitude,data.radius_m,
            (start-timedelta(minutes=data.early_minutes)).isoformat(),min(end,start+timedelta(minutes=data.late_minutes)).isoformat())

@router.get('')
def listing(start:str='',end:str='',u=Depends(session)):
    now=clock()
    try:
        a=datetime.fromisoformat(start).date() if start else (now-timedelta(days=7)).date()
        b=datetime.fromisoformat(end).date() if end else (now+timedelta(days=60)).date()
    except ValueError:fail('date','Use datas válidas nos filtros.')
    if b<a or (b-a).days>366:fail('period','Selecione um período de até um ano.')
    with s.db() as c:
        admin=manager(c,u,'members');person=linked_person(c,u)
        rows=[]
        for r in c.execute('SELECT * FROM church_services WHERE starts_at>=? AND starts_at<? ORDER BY starts_at LIMIT 200',(str(a),str(b+timedelta(days=1)))):
            d=dict(r)
            if not admin and not d['active']:continue
            own=c.execute('SELECT checked_at,method,voided FROM church_presences WHERE service_id=? AND person_id=?',(d['id'],person['id'] if person else '')).fetchone()
            d.update({'can_checkin':bool(d['active'] and in_window(d,now)),'my_presence':dict(own) if own and not own['voided'] else None,'automatic_blocked':bool(own and own['voided'])})
            if admin:d['present_count']=c.execute('SELECT count(*) FROM church_presences WHERE service_id=? AND voided=0',(d['id'],)).fetchone()[0]
            else:d.pop('created_by',None)
            rows.append(d)
        return {'items':rows,'manager':admin,'can_remove_others':global_manager(c,u),'linked_member':bool(person),
                'my_person_id':person['id'] if person else None,'auto_enabled':bool(c.execute('SELECT church_auto_checkin FROM users WHERE id=?',(u['id'],)).fetchone()[0]),'server_time':now.isoformat(),'timezone':'America/Sao_Paulo'}

@router.post('')
def create(data:Service,u=Depends(session)):
    fields=values(data);rid=str(data.request_id)
    with s.db() as c:
        manage(c,u);c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM church_services WHERE id=?',(rid,)).fetchone()
        if old:
            keys=('title','starts_at','ends_at','location','latitude','longitude','radius_m','opens_at','closes_at')
            if old['created_by']==u['id'] and tuple(old[k] for k in keys)==fields:return {'id':rid,'ok':True}
            fail('conflict','Solicitação já utilizada. Atualize a lista.',409)
        c.execute('INSERT INTO church_services(id,title,starts_at,ends_at,location,latitude,longitude,radius_m,opens_at,closes_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(rid,*fields,u['id'],s.now()))
        s.audit(c,u['id'],'church_service_created:'+rid)
    return {'id':rid,'ok':True}

@router.put('/{rid}')
def update(rid:str,data:Service,u=Depends(session)):
    fields=values(data)
    with s.db() as c:
        manage(c,u);c.execute('BEGIN IMMEDIATE');row=event(c,rid)
        if str(data.request_id)!=rid:fail('id','Identificador divergente.')
        if row['version']!=data.version:fail('conflict','Outra pessoa alterou este culto. Atualize antes de salvar.',409)
        c.execute('UPDATE church_services SET title=?,starts_at=?,ends_at=?,location=?,latitude=?,longitude=?,radius_m=?,opens_at=?,closes_at=?,version=version+1 WHERE id=?',(*fields,rid))
        s.audit(c,u['id'],'church_service_updated:'+rid)
    return {'ok':True}

@router.delete('/{rid}')
def cancel(rid:str,version:int=Query(ge=1),u=Depends(session)):
    with s.db() as c:
        manage(c,u);c.execute('BEGIN IMMEDIATE');row=event(c,rid)
        if not global_manager(c,u) and row['created_by']!=u['id']:fail('owner','Somente TI, pastores ou quem criou podem cancelar este culto.',403)
        if row['version']!=version:fail('conflict','Culto alterado. Atualize a lista.',409)
        c.execute('UPDATE church_services SET active=0,version=version+1 WHERE id=?',(rid,));s.audit(c,u['id'],'church_service_cancelled:'+rid)
    return {'ok':True}

class Preference(BaseModel):enabled:bool
@router.patch('/preferences/automatic')
def preferences(data:Preference,u=Depends(session)):
    with s.db() as c:
        if data.enabled and not linked_person(c,u,review=True):fail('member','Vincule seu cadastro de membro antes de ativar.',409)
        c.execute('UPDATE users SET church_auto_checkin=? WHERE id=?',(int(data.enabled),u['id']))
        s.audit(c,u['id'],'church_auto_checkin:'+str(data.enabled))
    return {'ok':True,'enabled':data.enabled}

class Position(BaseModel):
    automatic:bool=False
    latitude:float=Field(ge=-90,le=90,allow_inf_nan=False)
    longitude:float=Field(ge=-180,le=180,allow_inf_nan=False)
    accuracy:float=Field(gt=0,le=10000,allow_inf_nan=False)
    captured_at:float=Field(allow_inf_nan=False)

@router.post('/{rid}/check-in')
def checkin(rid:str,data:Position,u=Depends(session)):
    now=clock()
    if not -15<=now.timestamp()-data.captured_at/1000<=60:fail('stale','A localização expirou. Obtenha uma nova posição.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');row=event(c,rid)
        person=linked_person(c,u,review=True)
        if not person:fail('member','Seu cadastro de membro precisa estar vinculado à conta.',409)
        if data.automatic and not c.execute('SELECT church_auto_checkin FROM users WHERE id=?',(u['id'],)).fetchone()[0]:fail('consent','Check-in automático desativado nesta conta.',409)
        if not row['active'] or not in_window(row,now):fail('window','O check-in está fora do horário permitido.',409)
        meters=distance(data.latitude,data.longitude,row['latitude'],row['longitude'])
        if data.accuracy>min(100,row['radius_m']/2) or meters+data.accuracy>row['radius_m']:
            fail('location','Localização fora da área ou imprecisa. Aproxime-se do local e tente novamente.',409)
        old=c.execute('SELECT * FROM church_presences WHERE service_id=? AND person_id=?',(rid,person['id'])).fetchone()
        if data.automatic and old and old['voided']:fail('withdrawn','Presença removida. Confirme novamente de forma explícita, se desejar.',409)
        if old and not old['voided']:return {'ok':True,'already_present':True,'checked_at':old['checked_at']}
        c.execute('INSERT INTO church_presences(service_id,person_id,user_id,method,checked_at,actor,service_version,voided) VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(service_id,person_id) DO UPDATE SET user_id=excluded.user_id,method=excluded.method,checked_at=excluded.checked_at,actor=excluded.actor,service_version=excluded.service_version,voided=0,reason=\'\'',(rid,person['id'],u['id'],'location',now.isoformat(),u['id'],row['version']))
        s.audit(c,u['id'],'church_presence_location:'+rid)
    return {'ok':True,'already_present':False,'checked_at':now.isoformat()}

@router.get('/people/search')
def people(q:str=Query(min_length=2,max_length=100),u=Depends(session)):
    with s.db() as c:
        manage(c,u)
        return [dict(r) for r in c.execute('SELECT id,name FROM members_people WHERE active=1 AND lower(name) LIKE lower(?) ORDER BY name LIMIT 40',('%'+q+'%',))]

@router.get('/{rid}/presences')
def roster(rid:str,page:int=Query(default=1,ge=1),u=Depends(session)):
    with s.db() as c:
        manage(c,u);event(c,rid)
        total=c.execute('SELECT count(*) FROM church_presences WHERE service_id=? AND voided=0',(rid,)).fetchone()[0]
        rows=c.execute('SELECT a.person_id,p.name,a.method,a.checked_at,a.reason FROM church_presences a JOIN members_people p ON p.id=a.person_id WHERE a.service_id=? AND a.voided=0 ORDER BY a.checked_at DESC LIMIT 50 OFFSET ?',(rid,(page-1)*50))
        return {'items':[dict(r,reason=decrypt_text(r['reason'])) for r in rows],'total':total,'page':page}

class Manual(BaseModel):
    person_id:str=Field(min_length=1,max_length=100)
    reason:str=Field(min_length=10,max_length=300)
@router.post('/{rid}/manual')
def manual(rid:str,data:Manual,u=Depends(session)):
    if len(data.reason.strip())<10:fail('reason','Explique o motivo em pelo menos 10 caracteres.')
    with s.db() as c:
        manage(c,u);c.execute('BEGIN IMMEDIATE');row=event(c,rid)
        if not row['active']:fail('inactive','Este culto está cancelado.',409)
        if not c.execute('SELECT 1 FROM members_people WHERE id=? AND active=1',(data.person_id,)).fetchone():fail('member','Membro não encontrado.',404)
        old=c.execute('SELECT voided FROM church_presences WHERE service_id=? AND person_id=?',(rid,data.person_id)).fetchone()
        if old and not old['voided']:return {'ok':True,'already_present':True}
        c.execute('INSERT INTO church_presences(service_id,person_id,method,checked_at,actor,reason,service_version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(service_id,person_id) DO UPDATE SET method=excluded.method,checked_at=excluded.checked_at,actor=excluded.actor,reason=excluded.reason,service_version=excluded.service_version,voided=0',(rid,data.person_id,'manual',s.now(),u['id'],encrypt_text(data.reason.strip()),row['version']))
        s.audit(c,u['id'],'church_presence_manual:'+rid+':'+data.person_id)
    return {'ok':True}

@router.delete('/{rid}/presences/{pid}')
def remove_presence(rid:str,pid:str,u=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');own=linked_person(c,u)
        if not global_manager(c,u) and (not own or own['id']!=pid):fail('permission','Somente TI, pastores ou a própria pessoa podem remover a presença.',403)
        changed=c.execute('UPDATE church_presences SET voided=1 WHERE service_id=? AND person_id=? AND voided=0',(rid,pid)).rowcount
        if not changed:fail('missing','Presença não encontrada.',404)
        s.audit(c,u['id'],'church_presence_voided:'+rid+':'+pid)
    return {'ok':True}
