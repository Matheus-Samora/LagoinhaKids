"""Notification classification and delivery policy, independent from HTTP routes."""
import json
from datetime import datetime,timedelta,timezone
from . import store as s

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

