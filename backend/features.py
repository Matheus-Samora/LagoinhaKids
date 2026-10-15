import os,secrets,time,smtplib,json
from email.message import EmailMessage
from fastapi import APIRouter,Depends,BackgroundTasks
from pydantic import BaseModel,Field
from . import store as s
from .app import session,admin,fail,email,validate_password,child_allowed,PUBLIC_URL
router=APIRouter(prefix='/api')

def mail_ready():return bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM'))
def send_mail(recipient,subject,body):
    msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=recipient;msg['Subject']=subject;msg.set_content(body)
    with smtplib.SMTP(os.environ['SMTP_HOST'],int(os.getenv('SMTP_PORT','587')),timeout=15) as server:
        server.starttls()
        if os.getenv('SMTP_USER'):server.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
        server.send_message(msg)

class Recovery(BaseModel):
    email:str=Field(max_length=200)


@router.post('/auth/recovery')
def recover(data:Recovery,tasks:BackgroundTasks):
    if not mail_ready():
        fail('email_unavailable','A recuperação por e-mail está indisponível. Procure a administração.',503)
    address=email(data.email);key=s.digest('recovery|'+address)
    with s.db() as c:
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        if attempt and attempt['expires']>time.time() and attempt['failures']>=5:return {'ok':True,'message':'Se a conta existir, enviaremos as instruções.'}
        c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,attempt['failures']+1 if attempt and attempt['expires']>time.time() else 1,int(time.time())+300))
        user=c.execute('SELECT id, name FROM users WHERE email=? AND active=1',(address,)).fetchone()
        if user:
            token=secrets.token_urlsafe(40)
            c.execute('DELETE FROM auth_tokens WHERE user_id=? AND kind="reset"',(user['id'],))
            c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest(token),user['id'],'reset',int(time.time())+1800))
            s.audit(c,user['id'],'password_recovery_requested')
            if mail_ready():
                tasks.add_task(send_mail,address,'Recuperar acesso — Lagoinha Kids',f'Use este link em até 30 minutos: {PUBLIC_URL}/?reset={token}\nSe não solicitou, ignore esta mensagem.')
                return {'ok':True,'message':'Se a conta existir, enviaremos as instruções.'}
    return {'ok':True,'message':'Se a conta existir, enviaremos as instruções.'}
class Reset(BaseModel):token:str=Field(max_length=200);password:str=Field(max_length=128)
@router.post('/auth/reset')
def reset(data:Reset):
    validate_password(data.password)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        row=c.execute('SELECT * FROM auth_tokens WHERE token=? AND kind="reset" AND expires>?',(s.digest(data.token),time.time())).fetchone()
        if not row:fail('token','Link inválido ou expirado.',400)
        c.execute('UPDATE users SET password=? WHERE id=?',(s.password_hash(data.password),row['user_id']))
        c.execute('DELETE FROM web_subscriptions WHERE user_id=?',(row['user_id'],))
        c.execute('DELETE FROM sessions WHERE user_id=?',(row['user_id'],));c.execute('DELETE FROM device_tokens WHERE user_id=?',(row['user_id'],));c.execute('DELETE FROM auth_tokens WHERE user_id=?',(row['user_id'],))
        s.audit(c,row['user_id'],'password_recovered')
    return {'ok':True}

class Invite(BaseModel):email:str=Field(max_length=200)
@router.post('/children/{cid}/family/invites')
def invite(cid:int,data:Invite,user=Depends(session)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if user['role']!='admin' and ch['parent_id']!=user['id']:fail('owner','Somente o responsável principal ou a administração pode convidar.',403)
        token=secrets.token_urlsafe(32);address=email(data.email)
        c.execute('DELETE FROM family_invites WHERE child_id=? AND email=?',(cid,address))
        c.execute('INSERT INTO family_invites VALUES(?,?,?,?,?)',(s.digest(token),cid,address,int(time.time())+172800,user['id']))
        s.audit(c,user['id'],'family_invited',cid)
    return {'url':PUBLIC_URL+'/?invite='+token,'expires_in_hours':48}
class AcceptInvite(BaseModel):token:str=Field(max_length=200)
@router.post('/family/accept')
def accept_invite(data:AcceptInvite,user=Depends(session)):
    if user['role']!='parent':fail('role','Entre com uma conta de responsável.',403)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        invitation=c.execute('SELECT i.* FROM family_invites i JOIN children ch ON ch.id=i.child_id WHERE i.token=? AND i.expires>? AND ch.archived=0',(s.digest(data.token),time.time())).fetchone()
        if not invitation or invitation['email']!=user['email']:fail('invite','Convite inválido ou destinado a outro e-mail.',403)
        c.execute('INSERT INTO family_links VALUES(?,?,1,1) ON CONFLICT(child_id,user_id) DO UPDATE SET active=1,can_pickup=1',(invitation['child_id'],user['id']))
        c.execute('DELETE FROM family_invites WHERE token=?',(invitation['token'],))
        s.audit(c,user['id'],'family_invite_accepted',invitation['child_id'])
    return {'ok':True}
@router.get('/children/{cid}/family')
def family(cid:int,user=Depends(session)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        rows=c.execute('SELECT u.id,u.name,1 can_pickup,1 primary_guardian FROM users u WHERE u.id=? UNION ALL SELECT u.id,u.name,f.can_pickup,0 FROM family_links f JOIN users u ON u.id=f.user_id WHERE f.child_id=? AND f.active=1 AND u.active=1 AND u.id!=?',(ch['parent_id'],cid,ch['parent_id'])).fetchall()
        return [dict(row) for row in rows]
@router.delete('/children/{cid}/family/{uid}')
def revoke_family(cid:int,uid:int,user=Depends(session)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if user['role']!='admin' and user['id']!=ch['parent_id']:fail('owner','Somente o responsável principal pode remover um vínculo.',403)
        if uid==ch['parent_id']:fail('primary','O vínculo principal deve ser alterado pela administração.')
        c.execute('UPDATE family_links SET active=0 WHERE child_id=? AND user_id=?',(cid,uid));s.audit(c,user['id'],'family_revoked',cid)
    return {'ok':True}
@router.get('/children/{cid}/history')
def child_history(cid:int,user=Depends(session)):
    with s.db() as c:
        child_allowed(c,user,cid)
        return [dict(row) for row in c.execute('SELECT ev.id,ev.lesson_id,ev.action,ev.guardian_name,ev.created_at,l.title,l.starts_at FROM attendance_events ev LEFT JOIN lessons l ON l.id=ev.lesson_id WHERE child_id=? ORDER BY ev.id DESC LIMIT 100',(cid,))]
@router.get('/auth/sessions')
def sessions(user=Depends(session)):
    with s.db() as c:
        return [{'id':s.digest(r['token'])[:20],'expires':r['expires'],'current':r['token']==user['token']} for r in c.execute('SELECT token,expires FROM sessions WHERE user_id=? AND expires>?',(user['id'],time.time()))]
@router.post('/auth/sessions/revoke-others')
def revoke_sessions(user=Depends(session)):
    with s.db() as c:
        c.execute('DELETE FROM web_subscriptions WHERE user_id=? AND session_token!=?',(user['id'],user['token']))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token!=?',(user['id'],user['token']));c.execute('DELETE FROM device_tokens WHERE user_id=? AND session_token!=?',(user['id'],user['token']));s.audit(c,user['id'],'other_sessions_revoked')
    return {'ok':True}
@router.get('/admin/operations')
def operations(user=Depends(admin)):
    with s.db() as c:
        return {'present':c.execute('SELECT count(*) FROM attendance WHERE day=? AND status="present"',(s.today(),)).fetchone()[0],
        'waiting':c.execute('SELECT count(*) FROM waitlist w JOIN lessons l ON l.id=w.lesson_id WHERE l.active=1 AND l.ends_at>?',(s.now(),)).fetchone()[0],
        'pending_push':c.execute('SELECT count(*) FROM outbox WHERE status="pending"').fetchone()[0],
        'failed_push':c.execute('SELECT count(*) FROM outbox WHERE status="failed"').fetchone()[0]}
@router.get('/capabilities')
def capabilities():
    from .push_transport import push_platforms
    from .web_push import ready
    platforms=push_platforms()+(['web'] if ready() else [])
    return {'push_platforms':platforms,'password_recovery':mail_ready(),'push':bool(platforms),'google':bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'))}

@router.get('/sync')
def sync_revision(user=Depends(session)):
    with s.db() as c:
        change=c.execute('SELECT coalesce(max(id),0) FROM audit').fetchone()[0]
        notice=c.execute('SELECT coalesce(max(id),0) notice_id,coalesce(max(read_at),"") read_stamp FROM notifications WHERE user_id=?',(user['id'],)).fetchone()
        # Minute boundary updates expiry-derived lists without reloading full lists every poll.
        return {'revision':s.digest(f'{change}|{notice[0]}|{notice[1]}|{int(time.time())//60}')}

@router.get('/snapshot')
def snapshot(user=Depends(session)):
    from .school import children,rooms,lessons
    from .events import list_events,get_active_paging,list_active_guests
    from .app import notifications
    return {'children':children(user=user),'rooms':rooms(user=user),'lessons':lessons(user=user),
            'notifications':notifications(user=user),'events':list_events(user=user),
            'activePaging':get_active_paging(user=user),
            'activeGuests':list_active_guests(user=user) if user['role']!='parent' else []}

@router.post('/auth/email/send')
def send_verification(tasks:BackgroundTasks,user=Depends(session)):
    if not mail_ready():fail('email_unavailable','A verificação por e-mail aguarda configuração da equipe.',503)
    token=secrets.token_urlsafe(40)
    with s.db() as c:
        key=s.digest('verify|'+str(user['id']))
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        if attempt and attempt['expires']>time.time():fail('rate','Aguarde alguns minutos antes de pedir outro e-mail.',429)
        c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,attempt['failures']+1 if attempt and attempt['expires']>time.time() else 1,int(time.time())+300))
        c.execute('DELETE FROM auth_tokens WHERE user_id=? AND kind="verify"',(user['id'],))
        c.execute('INSERT INTO auth_tokens VALUES(?,?,?,?)',(s.digest(token),user['id'],'verify',int(time.time())+86400))
    tasks.add_task(send_mail,user['email'],'Confirmar e-mail — Lagoinha Kids',f'Confirme seu e-mail em até 24 horas: {PUBLIC_URL}/?verify={token}')
    return {'ok':True}
class VerifyEmail(BaseModel):token:str=Field(max_length=200)
@router.post('/auth/email/verify')
def verify_email(data:VerifyEmail):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        token=c.execute('SELECT * FROM auth_tokens WHERE token=? AND kind="verify" AND expires>?',(s.digest(data.token),time.time())).fetchone()
        if not token:fail('token','Link inválido ou expirado.')
        c.execute('UPDATE users SET email_verified=1 WHERE id=?',(token['user_id'],));c.execute('DELETE FROM auth_tokens WHERE token=?',(token['token'],));s.audit(c,token['user_id'],'email_verified')
    return {'ok':True}
