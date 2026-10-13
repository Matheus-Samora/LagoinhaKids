import os, time, secrets, hashlib, hmac, json, sqlite3, io
from pathlib import Path
from urllib.parse import urlencode
from datetime import date
import httpx
import numpy as np
from fastapi import FastAPI, Request, Response, HTTPException, Depends, File, Form
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.formparsers import MultiPartParser
from . import store as s

app=FastAPI(title='Lagoinha Kids',version='0.1.0')
PUBLIC_URL=os.getenv('KIDS_PUBLIC_URL','http://127.0.0.1:8770').rstrip('/')
SECURE=PUBLIC_URL.startswith('https:')
MAX_UPLOAD=8*1024*1024
MultiPartParser.spool_max_size=MAX_UPLOAD+65536
COOKIE='lagoinha_session'
MUTATE={'POST','PUT','PATCH','DELETE'}
NATIVE_ORIGINS={'https://localhost','capacitor://localhost'}

def fail(code,message,status=400): raise HTTPException(status,detail={'code':code,'message':message})
def google_ready(): return bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'))
def public_user(row): return {k:row[k] for k in ('id','name','email','role','active')} | {'google_linked':bool(row['google_sub'])}

@app.middleware('http')
async def protection(request:Request,call_next):
    if request.url.path.startswith('/api/'):
        if request.method in MUTATE:
            origin=request.headers.get('origin')
            if (request.headers.get('sec-fetch-site')=='cross-site' and origin not in NATIVE_ORIGINS) or (origin and origin not in {PUBLIC_URL,*NATIVE_ORIGINS}):
                return JSONResponse({'detail':{'code':'origin','message':'Origem não permitida.'}},403)
            if request.headers.get('content-length','').isdigit() and int(request.headers['content-length'])>MAX_UPLOAD+65536:
                return JSONResponse({'detail':{'code':'size','message':'Arquivo excede o limite de 8 MB.'}},413)
            parts=[];length=0
            async for chunk in request.stream():
                length+=len(chunk)
                if length>MAX_UPLOAD+65536: return JSONResponse({'detail':{'code':'size','message':'Requisição excede o limite.'}},413)
                parts.append(chunk)
            request._body=b''.join(parts)
    response=await call_next(request)
    response.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'})
    return response

app.add_middleware(CORSMiddleware,allow_origins=[PUBLIC_URL,*NATIVE_ORIGINS],allow_methods=['GET','POST','PATCH','DELETE'],allow_headers=['Content-Type','Authorization','X-CSRF-Token','X-Native-Client'])

def session(request:Request):
    bearer=request.headers.get('authorization','')
    token=bearer[7:] if bearer.startswith('Bearer ') else request.cookies.get(COOKIE,'')
    with s.db() as c:
        row=c.execute('SELECT u.*,ss.csrf,ss.expires,ss.token FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token=?',(s.digest(token),)).fetchone()
    if not row or row['expires']<time.time() or not row['active']: fail('login','Entre para continuar.',401)
    if request.method in MUTATE and not bearer.startswith('Bearer ') and not hmac.compare_digest(request.headers.get('x-csrf-token',''),row['csrf']): fail('csrf','Sessão inválida. Atualize a página.',403)
    return dict(row)
def admin(user=Depends(session)):
    if user['role']!='admin': fail('forbidden','Acesso exclusivo da administração.',403)
    return user
def staff(user=Depends(session)):
    if user['role'] not in ('admin','teacher'): fail('forbidden','Acesso exclusivo da equipe.',403)
    return user
def room_allowed(c,user,room):
    return user['role']=='admin' or (user['role']=='teacher' and c.execute('SELECT 1 FROM teacher_rooms WHERE user_id=? AND room_id=?',(user['id'],room)).fetchone() is not None)
def child_allowed(c,user,child):
    row=c.execute('SELECT * FROM children WHERE id=?',(child,)).fetchone()
    if not row: fail('missing','Aluno não encontrado.',404)
    if not (room_allowed(c,user,row['room_id']) or (user['role']=='parent' and row['parent_id']==user['id'])): fail('forbidden','Você não tem acesso a este aluno.',403)
    return row

def login_user(response,user_id,native=False):
    token=secrets.token_urlsafe(40);csrf=secrets.token_urlsafe(32)
    with s.db() as c:
        c.execute('DELETE FROM sessions WHERE expires<?',(int(time.time()),))
        c.execute('INSERT INTO sessions VALUES(?,?,?,?)',(s.digest(token),user_id,csrf,int(time.time())+8*3600))
        s.audit(c,user_id,'login')
    response.set_cookie(COOKIE,token,httponly=True,secure=SECURE,samesite='lax',max_age=8*3600,path='/')
    return {'csrf':csrf,**({'access_token':token} if native else {})}

def validate_password(value):
    if not 12<=len(value)<=128: fail('password','A senha deve ter entre 12 e 128 caracteres.')
def email(value):
    value=value.strip().lower()
    if '@' not in value or '.' not in value.split('@')[-1] or len(value)>200: fail('email','Informe um e-mail válido.')
    return value
class Login(BaseModel):
    email:str=Field(max_length=200)
    password:str=Field(max_length=128)
class Register(Login): name:str=Field(min_length=2,max_length=100)

@app.get('/api/health')
def health(): return {'status':'ok','application':'Lagoinha Kids','google_enabled':google_ready(),'push_enabled':False,'biometric_liveness':False}
@app.post('/api/auth/login')
def login(data:Login,request:Request,response:Response):
    addr=request.client.host if request.client else 'unknown'
    key=s.digest(addr+'|'+data.email.strip().lower())
    with s.db() as c:
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        if attempt and attempt['expires']>time.time() and attempt['failures']>=6: fail('rate','Muitas tentativas. Aguarde 15 minutos.',429)
        row=c.execute('SELECT * FROM users WHERE email=?',(data.email.strip().lower(),)).fetchone()
        valid=row and row['active'] and s.password_ok(data.password,row['password'])
        if not row: s.password_ok(data.password,s.password_hash('dummy-auth-value'))
        if not valid:
            failures=(attempt['failures'] if attempt and attempt['expires']>time.time() else 0)+1
            c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,failures,int(time.time())+900))
        else: c.execute('DELETE FROM attempts WHERE key=?',(key,))
    if not valid: fail('credentials','E-mail ou senha incorretos.',401)
    grant=login_user(response,row['id'],request.headers.get('x-native-client')=='1')
    return {'user':public_user(row),**grant}
@app.post('/api/auth/register')
def register(data:Register,response:Response,request:Request):
    validate_password(data.password)
    with s.db() as c:
        try: uid=c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(data.name.strip(),email(data.email),s.password_hash(data.password),'parent',s.now())).lastrowid
        except sqlite3.IntegrityError: fail('exists','Não foi possível cadastrar este e-mail. Tente entrar ou contate a administração.',409)
        row=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    return {'user':public_user(row),**login_user(response,uid,request.headers.get('x-native-client')=='1')}
@app.get('/api/me')
def me(user=Depends(session)): return {'user':public_user(user),'csrf':user['csrf'],'google_enabled':google_ready(),'push_enabled':False}
@app.post('/api/auth/logout')
def logout(response:Response,user=Depends(session)):
    with s.db() as c: c.execute('DELETE FROM sessions WHERE token=?',(user['token'],))
    response.delete_cookie(COOKIE,path='/');return {'ok':True}
class PasswordChange(BaseModel):
    current:str=Field(max_length=128)
    password:str=Field(max_length=128)
@app.post('/api/auth/password')
def change_password(data:PasswordChange,user=Depends(session)):
    validate_password(data.password)
    if not user['password'] or not s.password_ok(data.current,user['password']): fail('password','Senha atual incorreta.',403)
    with s.db() as c:
        c.execute('UPDATE users SET password=? WHERE id=?',(s.password_hash(data.password),user['id']))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token!=?',(user['id'],user['token']))
        s.audit(c,user['id'],'password_changed')
    return {'ok':True}

@app.get('/api/auth/google/start')
def google_start(request:Request,mode:str='login'):
    if not google_ready(): fail('google_config','Login Google aguarda configuração do Client ID e Client Secret.',503)
    if mode not in ('login','link'): fail('mode','Operação inválida.')
    user=session(request) if mode=='link' else None
    state=secrets.token_urlsafe(32);nonce=secrets.token_urlsafe(32);browser=secrets.token_urlsafe(32)
    with s.db() as c:
        c.execute('DELETE FROM oauth WHERE expires<?',(int(time.time()),))
        c.execute('INSERT INTO oauth VALUES(?,?,?,?,?,?)',(s.digest(state),nonce,s.digest(browser),user['id'] if user else None,mode,int(time.time())+600))
    params={'client_id':os.environ['GOOGLE_CLIENT_ID'],'redirect_uri':PUBLIC_URL+'/api/auth/google/callback','response_type':'code','scope':'openid email profile','state':state,'nonce':nonce,'prompt':'select_account'}
    response=RedirectResponse('https://accounts.google.com/o/oauth2/v2/auth?'+urlencode(params),302)
    response.set_cookie('google_flow',browser,max_age=600,httponly=True,secure=SECURE,samesite='lax',path='/api/auth/google')
    return response
@app.get('/api/auth/google/callback')
def google_callback(request:Request,state:str='',code:str='',error:str=''):
    with s.db() as c:
        flow=c.execute('SELECT * FROM oauth WHERE state=?',(s.digest(state),)).fetchone()
        c.execute('DELETE FROM oauth WHERE state=?',(s.digest(state),))
    if not flow or flow['expires']<time.time() or not hmac.compare_digest(flow['browser'],s.digest(request.cookies.get('google_flow',''))): fail('oauth_state','Fluxo Google expirado ou inválido.',403)
    if error or not code: return RedirectResponse('/?auth_error=google_cancelled',303)
    try:
        result=httpx.post('https://oauth2.googleapis.com/token',data={'code':code,'client_id':os.environ['GOOGLE_CLIENT_ID'],'client_secret':os.environ['GOOGLE_CLIENT_SECRET'],'redirect_uri':PUBLIC_URL+'/api/auth/google/callback','grant_type':'authorization_code'},timeout=20)
        result.raise_for_status()
        from google.oauth2 import id_token
        from google.auth.transport.requests import Request as GoogleRequest
        claims=id_token.verify_oauth2_token(result.json()['id_token'],GoogleRequest(),os.environ['GOOGLE_CLIENT_ID'])
        if claims.get('nonce')!=flow['nonce'] or claims.get('email_verified') is not True: raise ValueError('Invalid claims')
        sub=claims['sub'];mail=email(claims['email'])
    except Exception: return RedirectResponse('/?auth_error=google_validation',303)
    with s.db() as c:
        existing=c.execute('SELECT * FROM users WHERE google_sub=?',(sub,)).fetchone()
        if flow['mode']=='link':
            current=session(request)
            if current['id']!=flow['user_id'] or mail!=current['email']: return RedirectResponse('/?auth_error=google_email',303)
            if existing and existing['id']!=current['id']: return RedirectResponse('/?auth_error=google_link',303)
            c.execute('UPDATE users SET google_sub=? WHERE id=?',(sub,current['id']))
            s.audit(c,current['id'],'google_linked');uid=current['id']
        elif existing:
            if not existing['active']: return RedirectResponse('/?auth_error=disabled',303)
            uid=existing['id']
        else:
            if c.execute('SELECT 1 FROM users WHERE email=?',(mail,)).fetchone(): return RedirectResponse('/?auth_error=link_required',303)
            uid=c.execute('INSERT INTO users(name,email,role,google_sub,created_at) VALUES(?,?,?,?,?)',(claims.get('name',mail)[:100],mail,'parent',sub,s.now())).lastrowid
    response=RedirectResponse('/',303);response.delete_cookie('google_flow',path='/api/auth/google');login_user(response,uid);return response

@app.get('/api/rooms')
def rooms(user=Depends(session)):
    with s.db() as c:
        rows=c.execute('SELECT r.*,(SELECT count(*) FROM children ch WHERE ch.room_id=r.id) total,(SELECT count(*) FROM attendance a JOIN children ch ON ch.id=a.child_id WHERE ch.room_id=r.id AND a.day=? AND a.status="present") present FROM rooms r',(s.today(),)).fetchall()
        return [dict(r)|{'teachers':[dict(t) for t in c.execute('SELECT u.id,u.name FROM users u JOIN teacher_rooms tr ON tr.user_id=u.id WHERE tr.room_id=? AND u.active=1',(r['id'],))]} for r in rows if room_allowed(c,user,r['id']) or (user['role']=='parent' and c.execute('SELECT 1 FROM children WHERE room_id=? AND parent_id=?',(r['id'],user['id'])).fetchone())]
class RoomIn(BaseModel):
    name:str=Field(min_length=2,max_length=80)
    min_age:int=Field(ge=0,le=17)
    max_age:int=Field(ge=0,le=17)
    capacity:int=Field(ge=1,le=100)
    color:str='#d6e5ae'
@app.post('/api/rooms')
def create_room(data:RoomIn,user=Depends(admin)):
    if data.max_age<data.min_age: fail('age','Faixa etária inválida.')
    with s.db() as c:
        rid=c.execute('INSERT INTO rooms(name,min_age,max_age,capacity,color) VALUES(?,?,?,?,?)',(data.name,data.min_age,data.max_age,data.capacity,'#d6e5ae')).lastrowid
        s.audit(c,user['id'],'room_created')
    return {'id':rid}

@app.get('/api/children')
def children(user=Depends(session)):
    with s.db() as c:
        rows=c.execute('SELECT ch.id,ch.name,ch.birthday,ch.room_id,ch.parent_id,ch.face_allowed,ch.consent_at,ch.face_template IS NOT NULL face_enrolled,r.name room_name,r.color,u.name parent_name,u.email parent_email,coalesce(a.status,"absent") status,a.in_at,a.out_at FROM children ch JOIN rooms r ON r.id=ch.room_id LEFT JOIN users u ON u.id=ch.parent_id LEFT JOIN attendance a ON a.child_id=ch.id AND a.day=? ORDER BY ch.name',(s.today(),)).fetchall()
        return [dict(row) for row in rows if room_allowed(c,user,row['room_id']) or (user['role']=='parent' and row['parent_id']==user['id'])]
class ChildIn(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    birthday:date
    room_id:int
    parent_id:int|None=None
@app.post('/api/children')
def create_child(data:ChildIn,user=Depends(staff)):
    if data.birthday>date.fromisoformat(s.today()) or data.birthday.year<date.fromisoformat(s.today()).year-18: fail('birthday','Data de nascimento inválida.')
    with s.db() as c:
        room=c.execute('SELECT * FROM rooms WHERE id=?',(data.room_id,)).fetchone()
        if not room or not room_allowed(c,user,data.room_id): fail('room','Turma não permitida.',403)
        if data.parent_id and user['role']!='admin': fail('parent','Somente a administração pode vincular responsáveis.',403)
        if data.parent_id and not c.execute('SELECT 1 FROM users WHERE id=? AND role="parent" AND active=1',(data.parent_id,)).fetchone(): fail('parent','Responsável inválido.')
        if c.execute('SELECT count(*) FROM children WHERE room_id=?',(data.room_id,)).fetchone()[0]>=room['capacity']: fail('capacity','Capacidade da turma atingida.',409)
        cid=c.execute('INSERT INTO children(name,birthday,room_id,parent_id,created_at) VALUES(?,?,?,?,?)',(data.name.strip(),str(data.birthday),data.room_id,data.parent_id,s.now())).lastrowid
        s.audit(c,user['id'],'child_created',cid)
    return {'id':cid}
class Link(BaseModel): parent_id:int
@app.post('/api/children/{cid}/guardian')
def link_guardian(cid:int,data:Link,user=Depends(admin)):
    with s.db() as c:
        child_allowed(c,user,cid)
        if not c.execute('SELECT 1 FROM users WHERE id=? AND role="parent" AND active=1',(data.parent_id,)).fetchone(): fail('parent','Responsável inválido.')
        c.execute('UPDATE children SET parent_id=?,face_allowed=0,face_template=NULL,consent_at=NULL WHERE id=?',(data.parent_id,cid))
        s.audit(c,user['id'],'guardian_linked_consent_reset',cid)
    return {'ok':True}
class Consent(BaseModel): allowed:bool
@app.post('/api/children/{cid}/consent')
def consent(cid:int,data:Consent,user=Depends(session)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if user['role']!='parent' or ch['parent_id']!=user['id']: fail('consent','Somente o responsável vinculado pode autorizar.',403)
        c.execute('UPDATE children SET face_allowed=?,consent_at=? WHERE id=?',(int(data.allowed),s.now() if data.allowed else None,cid))
        if not data.allowed: c.execute('UPDATE children SET face_template=NULL WHERE id=?',(cid,))
        s.audit(c,user['id'],'biometric_consent_granted' if data.allowed else 'biometric_consent_revoked_template_deleted',cid)
    return {'ok':True}
class Attendance(BaseModel):
    action:str
    guardian_confirmed:bool=False
    guardian_id:int
@app.post('/api/children/{cid}/attendance')
def attendance(cid:int,data:Attendance,user=Depends(staff)):
    if data.action not in ('in','out') or not data.guardian_confirmed: fail('confirm','Confirme pessoalmente o responsável antes de registrar.')
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if not ch['parent_id'] or data.guardian_id!=ch['parent_id']: fail('guardian','Responsável não vinculado.',403)
        guardian=c.execute('SELECT name FROM users WHERE id=? AND active=1',(data.guardian_id,)).fetchone()
        if not guardian: fail('guardian','Responsável indisponível.')
        old=c.execute('SELECT * FROM attendance WHERE child_id=? AND day=?',(cid,s.today())).fetchone()
        if data.action=='in':
            if old and old['status']=='present': fail('already','Entrada já registrada.',409)
            c.execute('INSERT INTO attendance VALUES(?,?,?,?,?,?,?) ON CONFLICT(child_id,day) DO UPDATE SET status="present",in_at=excluded.in_at,out_at=NULL,guardian=excluded.guardian,actor=excluded.actor',(cid,s.today(),'present',s.now(),None,guardian['name'],user['id']))
        else:
            if not old or old['status']!='present': fail('state','Registre a entrada antes da saída.',409)
            c.execute('UPDATE attendance SET status="departed",out_at=?,guardian=?,actor=? WHERE child_id=? AND day=?',(s.now(),guardian['name'],user['id'],cid,s.today()))
        title='Entrada registrada' if data.action=='in' else 'Saída registrada'
        c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?,?)',(ch['parent_id'],cid,'attendance',title,f'{ch["name"]}: {title.lower()} pela equipe. Responsável conferido: {guardian["name"]}.',user['id'],s.now()))
        s.audit(c,user['id'],'check_in' if data.action=='in' else 'check_out',cid)
    return {'ok':True}
class Notify(BaseModel):
    kind:str
    message:str=Field(default='',max_length=400)
@app.post('/api/children/{cid}/notify')
def notify(cid:int,data:Notify,user=Depends(session)):
    titles={'please_pickup':'A professora solicita sua presença','arriving':'Responsável a caminho da salinha','pickup_ready':'Responsável chegou para buscar','consent_request':'Conheça a conferência facial auxiliar'}
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if user['role']=='parent':
            if data.kind not in ('arriving','pickup_ready'): fail('kind','Notificação não permitida.',403)
            recipients=[r[0] for r in c.execute('SELECT u.id FROM users u JOIN teacher_rooms tr ON tr.user_id=u.id WHERE tr.room_id=? AND u.active=1',(ch['room_id'],))]
            recipients+= [r[0] for r in c.execute('SELECT id FROM users WHERE role="admin" AND active=1')]
        else:
            if data.kind not in ('please_pickup','consent_request') or not ch['parent_id']: fail('kind','Este aluno precisa de responsável vinculado.')
            recipients=[ch['parent_id']]
        for uid in set(recipients): c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?,?)',(uid,cid,data.kind,titles[data.kind],data.message.strip() or f'Aviso sobre {ch["name"]}.',user['id'],s.now()))
        s.audit(c,user['id'],'notification_'+data.kind,cid)
    return {'ok':True,'delivery':'in_app','recipients':len(set(recipients))}
@app.get('/api/notifications')
def notifications(user=Depends(session)):
    with s.db() as c: return [dict(r) for r in c.execute('SELECT n.*,ch.name child_name,u.name sender_name FROM notifications n LEFT JOIN children ch ON ch.id=n.child_id LEFT JOIN users u ON u.id=n.sender WHERE n.user_id=? ORDER BY n.id DESC LIMIT 100',(user['id'],))]
@app.post('/api/notifications/{nid}/read')
def read_notification(nid:int,user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone(): fail('missing','Notificação não encontrada.',404)
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=?',(s.now(),nid))
    return {'ok':True}

@app.get('/api/users')
def users(user=Depends(admin)):
    with s.db() as c: return [public_user(r)|{'rooms':[x[0] for x in c.execute('SELECT room_id FROM teacher_rooms WHERE user_id=?',(r['id'],))]} for r in c.execute('SELECT * FROM users ORDER BY name')]
class UserIn(Register):
    role:str='parent'
    rooms:list[int]=[]
@app.post('/api/users')
def create_user(data:UserIn,user=Depends(admin)):
    if data.role not in ('admin','teacher','parent'): fail('role','Perfil inválido.')
    validate_password(data.password)
    with s.db() as c:
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=?',(rid,)).fetchone() for rid in data.rooms): fail('room','Turma inválida.')
        try: uid=c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(data.name,email(data.email),s.password_hash(data.password),data.role,s.now())).lastrowid
        except sqlite3.IntegrityError: fail('exists','E-mail já cadastrado.',409)
        if data.role=='teacher':
            for rid in set(data.rooms): c.execute('INSERT INTO teacher_rooms VALUES(?,?)',(uid,rid))
        s.audit(c,user['id'],'user_created')
    return {'id':uid}
class UserUpdate(BaseModel):
    active:bool
    rooms:list[int]=[]
@app.patch('/api/users/{uid}')
def update_user(uid:int,data:UserUpdate,user=Depends(admin)):
    if uid==user['id'] and not data.active: fail('self','Você não pode desativar sua própria conta.')
    with s.db() as c:
        row=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        if not row: fail('missing','Usuário não encontrado.',404)
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=?',(rid,)).fetchone() for rid in data.rooms): fail('room','Turma inválida.')
        c.execute('UPDATE users SET active=? WHERE id=?',(int(data.active),uid))
        c.execute('DELETE FROM teacher_rooms WHERE user_id=?',(uid,))
        if row['role']=='teacher':
            for rid in set(data.rooms): c.execute('INSERT INTO teacher_rooms VALUES(?,?)',(uid,rid))
        if not data.active: c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        s.audit(c,user['id'],'user_access_updated')
    return {'ok':True}
@app.get('/api/audit')
def audit_log(user=Depends(admin)):
    with s.db() as c: return [dict(r) for r in c.execute('SELECT a.*,u.name actor_name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 100')]

# Biometrics are 1:1 against a deliberately selected child. Never automatic release.
def engine():
    from . import biometrics
    return biometrics
@app.post('/api/children/{cid}/face/enroll')
def enroll(cid:int,image:bytes=File(...),user=Depends(staff)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if not ch['face_allowed'] or not ch['parent_id']: fail('consent','O responsável vinculado precisa autorizar o cadastro facial.',403)
        consent_version=ch['consent_at'];guardian=ch['parent_id']
    result,feature=engine().analyze(engine().decode(image),True)
    encrypted=s.CIPHER.encrypt(np.asarray(feature,dtype=np.float32).tobytes())
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if not ch['face_allowed'] or ch['consent_at']!=consent_version or ch['parent_id']!=guardian: fail('consent','Autorização alterada durante o processamento.',403)
        c.execute('UPDATE children SET face_template=? WHERE id=?',(encrypted,cid));s.audit(c,user['id'],'face_enrolled',cid)
    return {'ok':True,'analysis':result,'liveness':False}
@app.post('/api/children/{cid}/face/verify')
def verify_face(cid:int,image:bytes=File(...),user=Depends(staff)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if not ch['face_allowed'] or not ch['face_template']: fail('face','Cadastro facial autorizado indisponível.',409)
        reference=bytes(ch['face_template']);consent_at=ch['consent_at']
    result,probe=engine().analyze(engine().decode(image),True)
    feature=np.frombuffer(s.CIPHER.decrypt(reference),dtype=np.float32).reshape(1,-1).copy()
    with engine().LOCK: score=float(engine().RECOGNIZER.match(feature,probe,engine().cv2.FaceRecognizerSF_FR_COSINE))
    with s.db() as c:
        latest=child_allowed(c,user,cid)
        if not latest['face_allowed'] or latest['consent_at']!=consent_at or latest['face_template']!=reference: fail('face','Cadastro alterado durante a conferência. Tente novamente.',409)
        s.audit(c,user['id'],'face_compared_no_attendance_change',cid)
    return {'similarity':score,'threshold':0.363,'above_threshold':score>=.363,'experimental':True,'liveness':False,'automatic_release':False,'analysis':result}
@app.delete('/api/children/{cid}/face')
def delete_face(cid:int,user=Depends(session)):
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        c.execute('UPDATE children SET face_template=NULL WHERE id=?',(cid,));s.audit(c,user['id'],'face_template_deleted',cid)
    return {'ok':True}

if (s.ROOT/'dist').is_dir(): app.mount('/',StaticFiles(directory=s.ROOT/'dist',html=True),name='frontend')
