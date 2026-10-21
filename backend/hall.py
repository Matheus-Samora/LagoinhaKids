"""Private community wall. All writes are authenticated, bounded and reversible."""
from datetime import datetime,timedelta
from uuid import UUID
from fastapi import APIRouter,Depends,Query
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail
from .platform_access import allowed
from .record_policy import manager

router=APIRouter(prefix='/api/platform/hall',tags=['Community'])
KINDS=('general','testimony','prayer','welcome')

def participant(user=Depends(session)):
    with s.db() as c:
        if not allowed(c,user,'members'):fail('hall_access','Peça à administração acesso ao setor Members para participar do Hall.',403)
    return user


def post(c,rid):
    row=c.execute('SELECT p.* FROM hall_posts p JOIN users u ON u.id=p.author_id WHERE p.id=? AND p.active=1 AND u.active=1',(rid,)).fetchone()
    if not row:fail('missing','Esta publicação não está mais disponível.',404)
    return dict(row)

def moderate(c,user):return manager(c,user,'members')

def can_edit(c,user,row):
    if row['author_id']!=user['id'] and not moderate(c,user):fail('owner','Você pode alterar somente suas publicações.',403)

def rate(c,user,table,limit,minutes):
    cutoff=(datetime.fromisoformat(s.now())-timedelta(minutes=minutes)).isoformat(timespec='seconds')
    if c.execute(f'SELECT count(*) FROM {table} WHERE author_id=? AND created_at>=?',(user['id'],cutoff)).fetchone()[0]>=limit:fail('rate','Aguarde alguns minutos antes de publicar novamente.',429)

def card(c,row,user,mod,reacted=None):
    d=dict(row)
    d['reacted']=d['id'] in reacted if reacted is not None else bool(c.execute('SELECT 1 FROM hall_reactions WHERE post_id=? AND user_id=?',(d['id'],user['id'])).fetchone())
    d['is_mine']=d['author_id']==user['id'];d['can_manage']=d['is_mine'] or mod
    return d

POST_SELECT='''SELECT p.*,u.name author_name,u.avatar_url author_avatar,
 (SELECT count(*) FROM hall_reactions r WHERE r.post_id=p.id) reactions,
 (SELECT count(*) FROM hall_comments cm JOIN users cu ON cu.id=cm.author_id WHERE cm.post_id=p.id AND cm.active=1 AND cu.active=1) comments
 FROM hall_posts p JOIN users u ON u.id=p.author_id'''

@router.get('/summary')
def summary(user=Depends(participant)):
    with s.db() as c:
        row=c.execute('SELECT p.id FROM hall_posts p JOIN users u ON u.id=p.author_id WHERE p.active=1 AND u.active=1 ORDER BY p.created_at DESC,p.id DESC LIMIT 1').fetchone()
        return {'latest_id':row['id'] if row else None}

@router.get('/posts')
def posts(page:int=Query(1,ge=1,le=5000),kind:str='all',mine:bool=False,author:int|None=Query(None,ge=1),user=Depends(participant)):
    if kind!='all' and kind not in KINDS:fail('kind','Selecione uma categoria válida.')
    clauses=['p.active=1','u.active=1'];params=[]
    if kind!='all':clauses.append('p.kind=?');params.append(kind)
    if mine or author:clauses.append('p.author_id=?');params.append(user['id'] if mine else author)
    with s.db() as c:
        mod=moderate(c,user)
        rows=c.execute(POST_SELECT+' WHERE '+' AND '.join(clauses)+' ORDER BY p.created_at DESC,p.id DESC LIMIT 21 OFFSET ?',(*params,(page-1)*20)).fetchall()
        ids=[r['id'] for r in rows[:20]]
        reacted={r[0] for r in c.execute('SELECT post_id FROM hall_reactions WHERE user_id=? AND post_id IN ('+','.join('?' for _ in ids)+')',(user['id'],*ids))} if ids else set()
        return {'items':[card(c,r,user,mod,reacted) for r in rows[:20]],'has_more':len(rows)>20,'page':page,'can_moderate':mod,'stats':{'members':c.execute('SELECT count(*) FROM members_people WHERE active=1').fetchone()[0],'posts':c.execute('SELECT count(*) FROM hall_posts p JOIN users u ON u.id=p.author_id WHERE p.active=1 AND u.active=1').fetchone()[0]}}

@router.get('/posts/{rid}')
def single(rid:str,user=Depends(participant)):
    with s.db() as c:
        post(c,rid)
        return card(c,c.execute(POST_SELECT+' WHERE p.id=?',(rid,)).fetchone(),user,moderate(c,user))

class Publication(BaseModel):
    request_id:UUID
    content:str=Field(min_length=2,max_length=2000)
    kind:str=Field(default='general',pattern='^(general|testimony|prayer|welcome)$')

class EditPublication(BaseModel):
    version:int=Field(ge=1)
    content:str=Field(min_length=2,max_length=2000)
    kind:str=Field(pattern='^(general|testimony|prayer|welcome)$')

@router.post('/posts')
def create(data:Publication,user=Depends(participant)):
    if len(data.content.strip())<2:fail('content','Escreva uma mensagem antes de publicar.')
    rid=str(data.request_id)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM hall_posts WHERE id=?',(rid,)).fetchone()
        if old:
            if old['author_id']==user['id'] and old['content']==data.content.strip() and old['kind']==data.kind and old['active']:return {'id':rid,'ok':True}
            fail('conflict','Esta solicitação já foi utilizada.',409)
        rate(c,user,'hall_posts',5,5)
        c.execute('INSERT INTO hall_posts(id,author_id,kind,content,created_at,updated_at) VALUES(?,?,?,?,?,?)',(rid,user['id'],data.kind,data.content.strip(),s.now(),s.now()))
        s.audit(c,user['id'],'hall:post_created:'+rid)
        fresh=card(c,post(c,rid),user,False)
        from .realtime import publish
        publish('hall:post',{'action':'created','post':fresh},sector='members')
    return {'id':rid,'ok':True}

@router.patch('/posts/{rid}')
def edit(rid:str,data:EditPublication,user=Depends(participant)):
    if len(data.content.strip())<2:fail('content','Escreva uma mensagem antes de salvar.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');old=post(c,rid);can_edit(c,user,old)
        if old['version']!=data.version:fail('conflict','A publicação mudou. Reabra antes de editar.',409)
        c.execute('UPDATE hall_posts SET content=?,kind=?,version=version+1,updated_at=? WHERE id=?',(data.content.strip(),data.kind,s.now(),rid))
        s.audit(c,user['id'],'hall:post_updated:'+rid)
        fresh=card(c,post(c,rid),user,False)
        from .realtime import publish
        publish('hall:post',{'action':'updated','post':fresh},sector='members')
    return {'ok':True}

@router.delete('/posts/{rid}')
def archive(rid:str,version:int=Query(ge=1),user=Depends(participant)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');old=post(c,rid);can_edit(c,user,old)
        if old['version']!=version:fail('conflict','A publicação mudou. Reabra para conferir.',409)
        c.execute('UPDATE hall_posts SET active=0,version=version+1,updated_at=? WHERE id=?',(s.now(),rid))
        c.execute('UPDATE hall_reports SET resolved=1 WHERE post_id=?',(rid,))
        s.audit(c,user['id'],'hall:post_archived:'+rid)
        from .realtime import publish
        publish('hall:post',{'action':'archived','post_id':rid},sector='members')
    return {'ok':True}

class Reaction(BaseModel):active:bool

@router.put('/posts/{rid}/reaction')
def react(rid:str,data:Reaction,user=Depends(participant)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');post(c,rid)
        if data.active:c.execute('INSERT INTO hall_reactions VALUES(?,?,?) ON CONFLICT(post_id,user_id) DO NOTHING',(rid,user['id'],s.now()))
        else:c.execute('DELETE FROM hall_reactions WHERE post_id=? AND user_id=?',(rid,user['id']))
        count=c.execute('SELECT count(*) FROM hall_reactions WHERE post_id=?',(rid,)).fetchone()[0]
        from .realtime import publish
        publish('hall:reaction',{'post_id':rid,'reactions':count,'actor_id':user['id']},sector='members')
        return {'ok':True,'reacted':data.active,'reactions':count}

@router.get('/posts/{rid}/comments')
def comments(rid:str,page:int=Query(1,ge=1,le=5000),user=Depends(participant)):
    with s.db() as c:
        post(c,rid);mod=moderate(c,user)
        rows=c.execute('SELECT cm.id,cm.content,cm.author_id,cm.created_at,u.name author_name,u.avatar_url author_avatar FROM hall_comments cm JOIN users u ON u.id=cm.author_id WHERE cm.post_id=? AND cm.active=1 AND u.active=1 ORDER BY cm.created_at DESC,cm.id DESC LIMIT 31 OFFSET ?',(rid,(page-1)*30)).fetchall()
        return {'items':[dict(r,can_manage=r['author_id']==user['id'] or mod) for r in rows[:30]],'has_more':len(rows)>30}

class Comment(BaseModel):
    request_id:UUID
    content:str=Field(min_length=1,max_length=600)

@router.post('/posts/{rid}/comments')
def reply(rid:str,data:Comment,user=Depends(participant)):
    if not data.content.strip():fail('content','Escreva seu comentário.')
    cid=str(data.request_id)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');parent=post(c,rid)
        old=c.execute('SELECT * FROM hall_comments WHERE id=?',(cid,)).fetchone()
        if old:
            if old['post_id']==rid and old['author_id']==user['id'] and old['content']==data.content.strip() and old['active']:return {'ok':True,'id':cid}
            fail('conflict','Esta solicitação já foi utilizada.',409)
        rate(c,user,'hall_comments',20,5)
        c.execute('INSERT INTO hall_comments(id,post_id,author_id,content,created_at) VALUES(?,?,?,?,?)',(cid,rid,user['id'],data.content.strip(),s.now()))
        # Only the post author is notified; reactions and broadcast posts stay quiet.
        if parent['author_id']!=user['id'] and allowed(c,{'id':parent['author_id']},'members'):
            c.execute('INSERT INTO notifications(user_id,kind,title,message,sender,created_at,sector,context_id) VALUES(?,?,?,?,?,?,?,?)',(parent['author_id'],'hall_reply','Nova conversa no Hall','Sua publicação recebeu um comentário. Abra o aplicativo para ver.',user['id'],s.now(),'members',rid))
        from .realtime import publish, dispatch_notification_event
        if parent['author_id']!=user['id'] and allowed(c,{'id':parent['author_id']},'members'):
            dispatch_notification_event(c, user_id=parent['author_id'], kind='hall_reply', title='Nova conversa no Hall', message=f"{user['name']} respondeu à sua publicação no Hall.", sector='members', context_id=rid)
        s.audit(c,user['id'],'hall:comment_created:'+cid)
        u_row=c.execute('SELECT name,avatar_url FROM users WHERE id=?',(user['id'],)).fetchone()
        c_dict={'id':cid,'post_id':rid,'content':data.content.strip(),'author_id':user['id'],'author_name':u_row['name'],'author_avatar':u_row['avatar_url'],'created_at':s.now(),'can_manage':False}
        comments_count=c.execute('SELECT count(*) FROM hall_comments WHERE post_id=? AND active=1',(rid,)).fetchone()[0]
        publish('hall:comment',{'post_id':rid,'comment':c_dict,'comments_count':comments_count},sector='members')
    return {'ok':True,'id':cid}

@router.delete('/comments/{cid}')
def remove_comment(cid:str,user=Depends(participant)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT * FROM hall_comments WHERE id=? AND active=1',(cid,)).fetchone()
        if not row:fail('missing','Comentário não encontrado.',404)
        post(c,row['post_id']);can_edit(c,user,dict(row))
        c.execute('UPDATE hall_comments SET active=0 WHERE id=?',(cid,));s.audit(c,user['id'],'hall:comment_archived:'+cid)
        pid=row['post_id']
        comments_count=c.execute('SELECT count(*) FROM hall_comments WHERE post_id=? AND active=1',(pid,)).fetchone()[0]
        from .realtime import publish
        publish('hall:comment_removed',{'post_id':pid,'comment_id':cid,'comments_count':comments_count},sector='members')
    return {'ok':True}

class Report(BaseModel):reason:str=Field(pattern='^(inappropriate|privacy|spam|other)$')

@router.post('/posts/{rid}/report')
def report(rid:str,data:Report,user=Depends(participant)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE');post(c,rid)
        c.execute('INSERT INTO hall_reports VALUES(?,?,?,0,?) ON CONFLICT(post_id,user_id) DO NOTHING',(rid,user['id'],data.reason,s.now()))
    return {'ok':True}

@router.get('/reports')
def reports(user=Depends(participant)):
    with s.db() as c:
        if not moderate(c,user):fail('moderation','Acesso exclusivo da coordenação de Members.',403)
        rows=c.execute('SELECT r.post_id,r.reason,r.created_at,p.content,p.version,u.name author_name FROM hall_reports r JOIN hall_posts p ON p.id=r.post_id JOIN users u ON u.id=p.author_id WHERE r.resolved=0 AND p.active=1 ORDER BY r.created_at DESC LIMIT 100').fetchall()
        return {'items':[dict(r) for r in rows]}

@router.post('/posts/{rid}/resolve-reports')
def resolve(rid:str,user=Depends(participant)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not moderate(c,user):fail('moderation','Acesso exclusivo da coordenação de Members.',403)
        c.execute('UPDATE hall_reports SET resolved=1 WHERE post_id=?',(rid,));s.audit(c,user['id'],'hall:reports_resolved:'+rid)
    return {'ok':True}

@router.get('/members')
def directory(q:str=Query('',max_length=100),ministry:str=Query('',max_length=50),page:int=Query(1,ge=1,le=5000),user=Depends(participant)):
    with s.db() as c:
        clauses=['p.active=1'];params=[]
        if q.strip():clauses.append('(lower(p.name) LIKE ? OR lower(p.profession) LIKE ?)');params.extend(['%'+q.strip().lower()+'%']*2)
        if ministry:clauses.append('EXISTS(SELECT 1 FROM ministries_assignments a WHERE a.person_id=p.id AND a.active=1 AND a.ministry=?)');params.append(ministry)
        where=' AND '.join(clauses)
        # Directory data is deliberately separate from administrative registration.
        rows=c.execute("SELECT p.id,p.name,p.profession,p.bio,p.account_user_id,coalesce(nullif(u.avatar_url,''),p.avatar_url,'') avatar_url,coalesce(mc.name,'') cell_name FROM members_people p LEFT JOIN users u ON u.id=p.account_user_id AND u.active=1 LEFT JOIN members_cells mc ON mc.id=p.cell_id WHERE "+where+' ORDER BY p.name,p.id LIMIT 25 OFFSET ?',(*params,(page-1)*24)).fetchall()
        result=[];assignments={}
        ids=[r['id'] for r in rows[:24]]
        if ids:
            for item in c.execute('SELECT person_id,ministry,position,is_leader FROM ministries_assignments WHERE active=1 AND person_id IN ('+','.join('?' for _ in ids)+') ORDER BY ministry',ids):
                assignments.setdefault(item['person_id'],[]).append({k:item[k] for k in ('ministry','position','is_leader')})
        for row in rows[:24]:
            d=dict(row);d['is_me']=d['account_user_id']==user['id']
            d['ministries']=assignments.get(d['id'],[])
            result.append(d)
        total=c.execute('SELECT count(*) FROM members_people p WHERE '+where,params).fetchone()[0]
        catalog=[r[0] for r in c.execute('SELECT DISTINCT ministry FROM ministries_assignments WHERE active=1 ORDER BY ministry')]
        return {'members':result,'total':total,'has_more':len(rows)>24,'page':page,'catalog':catalog}
