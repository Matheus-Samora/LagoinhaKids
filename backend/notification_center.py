"""Unified inbox and user-controlled push policy; no private data in lock-screen payloads."""
import json
from datetime import datetime,timedelta,timezone
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail

router=APIRouter(prefix='/api/notification-center',tags=['Notifications'])
from .notification_policy import CATEGORIES,KINDS,DEFAULTS,metadata,preferences,push_policy


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
    from .realtime import publish
    publish('notification:count', {'unread_count': 0}, user_id=user['id'])
    return {'ok':True}


@router.post('/{nid}/read')
def read_one(nid:int,user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone():fail('notice','Notificação não encontrada.',404)
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?',(s.now(),nid,user['id']))
        from .realtime import publish
        count=c.execute('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()[0]
        publish('notification:count', {'unread_count':count}, user_id=user['id'])
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
