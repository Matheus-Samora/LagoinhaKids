from datetime import datetime,timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter,Depends
from fastapi.responses import Response
from . import store as s
from .app import session,room_allowed,fail

router=APIRouter(prefix='/api')
def utc(value):
    dt=datetime.fromisoformat(value)
    if dt.tzinfo is None:dt=dt.replace(tzinfo=ZoneInfo('America/Sao_Paulo'))
    return dt.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
def escape(value):return str(value).replace('\\','\\\\').replace('\r','').replace('\n','\\n').replace(';','\\;').replace(',','\\,')
def calendar(uid,title,start,end,location):
    lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lagoinha Kids//Agenda//PT-BR','CALSCALE:GREGORIAN','BEGIN:VEVENT',f'UID:{uid}@lagoinhakids',f'DTSTAMP:{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")}',f'DTSTART:{utc(start)}',f'DTEND:{utc(end)}','SUMMARY:'+escape(title),'LOCATION:'+escape(location),'DESCRIPTION:Confira alterações e confirme a presença no aplicativo Lagoinha Kids.','END:VEVENT','END:VCALENDAR']
    folded=[]
    for line in lines:
        part=''
        for char in line:
            if len((part+char).encode())>73:folded.append(part);part=' '+char
            else:part+=char
        folded.append(part)
    return Response('\r\n'.join(folded)+'\r\n',media_type='text/calendar',headers={'Content-Disposition':f'attachment; filename="lagoinha-{uid}.ics"','Cache-Control':'no-store'})

@router.get('/lessons/{lesson_id}/calendar.ics')
def lesson_calendar(lesson_id:int,user=Depends(session)):
    with s.db() as c:
        lesson=c.execute('SELECT l.*,r.name room_name FROM lessons l JOIN rooms r ON r.id=l.room_id WHERE l.id=? AND l.active=1 AND r.active=1',(lesson_id,)).fetchone()
        if not lesson:fail('missing','Aulinha não encontrada.',404)
        if user['role']!='parent' and not room_allowed(c,user,lesson['room_id']):fail('scope','Turma de outro professor.',403)
        return calendar(f'lesson-{lesson_id}','Aulinha — '+lesson['room_name'],lesson['starts_at'],lesson['ends_at'],lesson['room_name'])

@router.get('/events/{event_id}/calendar.ics')
def event_calendar(event_id:int,user=Depends(session)):
    with s.db() as c:
        event=c.execute('SELECT * FROM events WHERE id=? AND active=1',(event_id,)).fetchone()
        if not event:fail('missing','Evento não encontrado.',404)
        return calendar(f'event-{event_id}',event['title'],event['starts_at'],event['ends_at'],event['location'])
