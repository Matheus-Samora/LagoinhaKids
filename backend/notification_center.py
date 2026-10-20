"""Unified inbox and user-controlled push policy; no private data in lock-screen payloads."""
import json
from datetime import datetime,timedelta,timezone
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail

router=APIRouter(prefix='/api/notification-center',tags=['Notifications'])
CATEGORIES={'urgent':('Chamados da salinha','high',1800),'tasks':('Solicitações e respostas','normal',604800),'announcements':('Comunicados','normal',604800),'activity':('Presenças e atualizações','low',86400),'system':('Conta e sistema','normal',86400)}
KINDS={'urgent':('urgent_call','please_pickup','pickup_ready'),'tasks':('sector_application','ministry_approved','gc_approved','arriving','consent_request'),'announcements':('announcement','event_announcement'),'activity':('attendance','lesson_update','discipleship','event_registration')}
DEFAULTS={'push_enabled':True,'urgent':True,'tasks':True,'announcements':True,'activity':False,'system':True,'quiet_enabled':False,'quiet_start':'22:00','quiet_end':'07:00'}


def metadata(notice):
    kind=notice.get('kind','')
    category=next((key for key,kinds in KINDS.items() if kind in kinds),'system')
    label,priority,ttl=CATEGORIES[category]
    sector=notice.get('sector','')
    route='/'+sector if sector in ('finance','members','ministries') else '/membro' if notice.get('child_id') is None and category in ('tasks','announcements') else '/kids#notifications'
    if kind in ('event_announcement','event_registration'):route='/kids#events'
    elif kind=='ministry_approved':route='/ministries'
    elif kind=='gc_approved':route='/members'
    return {'category':category,'category_label':label,'priority':priority,'url':route,'ttl':ttl,'channel':'lagoinha_'+category}


def preferences(c,uid):
    row=c.execute('SELECT settings FROM notification_preferences WHERE user_id=?',(uid,)).fetchone()
    try: stored=json.loads(row['settings']) if row else {}
    except (ValueError,TypeError):stored={}
    return {**DEFAULTS,**{k:v for k,v in stored.items() if k in DEFAULTS}}


def push_policy(c,notice,now=None):
    """Return (send, retry_delay, reason); suppression never deletes the inbox record."""
    now=now or datetime.now(timezone.utc)
    meta=metadata(notice)
    if not c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(notice['user_id'],)).fetchone():return False,0,'inactive_user'
    if notice.get('kind')=='urgent_call' and not c.execute("SELECT 1 FROM paging_requests WHERE child_id=? AND status IN ('active','on_my_way')",(notice.get('child_id'),)).fetchone():return False,0,'resolved_call'
    if notice.get('read_at'):return False,0,'already_read'
    try:
        created=datetime.fromisoformat(notice['created_at'])
        if created.tzinfo is None:created=created.replace(tzinfo=timezone.utc)
        if (now-created).total_seconds()>meta['ttl']:return False,0,'expired'
    except (KeyError,ValueError,TypeError):return False,0,'invalid_timestamp'
    prefs=preferences(c,notice['user_id'])
    if not prefs['push_enabled'] or not prefs[meta['category']]:return False,0,'user_preference'
    if prefs['quiet_enabled'] and meta['category']!='urgent':
        local=now.astimezone(timezone(timedelta(hours=-3)))
        minute=local.hour*60+local.minute
        start=sum(int(v)*m for v,m in zip(prefs['quiet_start'].split(':'),(60,1)))
        end=sum(int(v)*m for v,m in zip(prefs['quiet_end'].split(':'),(60,1)))
        quiet=(start<=minute<end) if start<end else (minute>=start or minute<end) if start!=end else False
        if quiet:return False,max(60,((end-minute)%1440)*60-local.second),'quiet_hours'
    return True,0,'ready'


class PreferencesInput(BaseModel):
    push_enabled:bool=True
    urgent:bool=True
    tasks:bool=True
    announcements:bool=True
    activity:bool=False
    system:bool=True
    quiet_enabled:bool=False
    quiet_start:str=Field(default='22:00',pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    quiet_end:str=Field(default='07:00',pattern=r'^([01]\d|2[0-3]):[0-5]\d$')


@router.get('/preferences')
def get_preferences(user=Depends(session)):
    with s.db() as c:return {'settings':preferences(c,user['id']),'timezone':'America/Sao_Paulo','categories':[{'id':key,'label':value[0]} for key,value in CATEGORIES.items()]}


@router.put('/preferences')
def save_preferences(data:PreferencesInput,user=Depends(session)):
    if data.quiet_enabled and data.quiet_start==data.quiet_end:fail('quiet_hours','Escolha horários diferentes para início e fim.')
    with s.db() as c:
        c.execute('INSERT INTO notification_preferences(user_id,settings,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET settings=excluded.settings,updated_at=excluded.updated_at',(user['id'],json.dumps(data.model_dump()),s.now()))
    return {'ok':True,'settings':data.model_dump()}


@router.get('')
def inbox(before:int|None=Query(default=None,ge=1),category:str='all',unread:bool=False,limit:int=Query(default=30,ge=1,le=100),user=Depends(session)):
    if category!='all' and category not in CATEGORIES:fail('category','Categoria inválida.')
    where='user_id=?';params=[user['id']]
    if before:where+=' AND id<?';params.append(before)
    if unread:where+=' AND read_at IS NULL'
    if category in KINDS:
        kinds=KINDS[category];where+=' AND kind IN ('+','.join('?' for _ in kinds)+')';params.extend(kinds)
    elif category=='system':
        kinds=[k for values in KINDS.values() for k in values];where+=' AND kind NOT IN ('+','.join('?' for _ in kinds)+')';params.extend(kinds)
    with s.db() as c:
        count=c.execute('SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()['n']
        rows=[dict(r) for r in c.execute('SELECT * FROM notifications WHERE '+where+' ORDER BY id DESC LIMIT ?',(*params,limit+1))]
    more=len(rows)>limit;rows=rows[:limit]
    return {'items':[{**row,**metadata(row)} for row in rows],'unread_count':count,'next_before':rows[-1]['id'] if more else None}


@router.post('/read-all')
def read_all(user=Depends(session)):
    with s.db() as c:c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE user_id=? AND read_at IS NULL',(s.now(),user['id']))
    return {'ok':True}


@router.post('/{nid}/read')
def read_one(nid:int,user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone():fail('notice','Notificação não encontrada.',404)
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?',(s.now(),nid,user['id']))
    return {'ok':True}


@router.get('/summary')
def summary(user=Depends(session)):
    with s.db() as c:
        count=c.execute('SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()['n']
        row=c.execute('SELECT id FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 1',(user['id'],)).fetchone()
    return {'unread_count':count,'latest_id':row['id'] if row else None}


@router.get('/{nid}')
def notification_detail(nid:int,user=Depends(session)):
    with s.db() as c:
        row=c.execute('SELECT * FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone()
        if not row:fail('notice','Notificação não encontrada.',404)
        item=dict(row)
    return {**item,**metadata(item)}
