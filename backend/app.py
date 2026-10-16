import os, time, secrets, hashlib, hmac, json, sqlite3, io
from pathlib import Path
from urllib.parse import urlencode
from datetime import date
import httpx
import numpy as np
from fastapi import FastAPI, Request, Response, HTTPException, Depends, File, Form, UploadFile
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.formparsers import MultiPartParser
from . import store as s
from .push_transport import push_platforms

app=FastAPI(title='Lagoinha Systems',version='2.1.0')
PUBLIC_URL=os.getenv('KIDS_PUBLIC_URL','http://127.0.0.1:8770').rstrip('/')
SECURE=PUBLIC_URL.startswith('https:')
MAX_UPLOAD=10*1024*1024
MultiPartParser.spool_max_size=MAX_UPLOAD+65536
COOKIE='lagoinha_session'
MUTATE={'POST','PUT','PATCH','DELETE'}
NATIVE_ORIGINS={'https://localhost','capacitor://localhost'}

def fail(code,message,status=400): raise HTTPException(status,detail={'code':code,'message':message})
def google_ready(): return bool(os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET'))
def public_user(row):
    keys = row.keys() if hasattr(row, 'keys') else []
    staff_r = row['staff_role'] if 'staff_role' in keys else ''
    if not staff_r and row['role'] == 'teacher':
        staff_r = 'teacher'
    elif not staff_r and row['role'] == 'admin':
        staff_r = 'admin'
    from .platform_access import platform_admin,is_pastor
    with s.db() as c:
        central=platform_admin(c,row['id'])
        pastor=is_pastor(c,row['id'])
    if pastor and not staff_r:
        staff_r = 'pastor'
    return {k:row[k] for k in ('id','name','email','role','active')} | {
        'platform_admin':central,
        'pastor':pastor,
        'staff_role': staff_r,
        'email_verified':bool(row['email_verified']) if 'email_verified' in keys else False,
        'mfa_enabled':bool(row['mfa_secret']) if 'mfa_secret' in keys else False,
        'phone': row['phone'] if 'phone' in keys else '',
        'avatar_url': row['avatar_url'] if 'avatar_url' in keys else '',
        'google_linked': bool(row['google_sub'])
    }

from .platform_access import MODULES as PLATFORM_MODULES
MODULE_HOSTS=json.loads(os.getenv('SYSTEMS_MODULE_HOSTS','{}'))
ALLOWED_ORIGINS={PUBLIC_URL,*('https://'+host for host in MODULE_HOSTS),*NATIVE_ORIGINS,*filter(None,(x.strip().rstrip('/') for x in os.getenv('KIDS_ALLOWED_ORIGINS','').split(',')))}
def is_allowed_origin(origin, request: Request):
    if not origin:return True
    return origin.rstrip('/') in ALLOWED_ORIGINS

@app.middleware('http')
async def protection(request:Request,call_next):
    if request.url.path.startswith('/api/'):
        if request.method in MUTATE:
            origin=request.headers.get('origin')
            if origin and not is_allowed_origin(origin, request):
                return JSONResponse({'detail':{'code':'origin','message':'Origem não permitida.'}},403)
            if request.headers.get('content-length','').isdigit() and int(request.headers['content-length'])>MAX_UPLOAD+65536:
                return JSONResponse({'detail':{'code':'size','message':'Arquivo excede o limite de 8 MB.'}},413)
            parts=[];length=0
            async for chunk in request.stream():
                length+=len(chunk)
                if length>MAX_UPLOAD+65536: return JSONResponse({'detail':{'code':'size','message':'Requisição excede o limite.'}},413)
                parts.append(chunk)
            request._body=b''.join(parts)
    context=s.REQUEST_IP.set(request.client.host if request.client else '')
    try:response=await call_next(request)
    finally:s.REQUEST_IP.reset(context)
    response.headers.update({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'})
    return response

CSRF_EXEMPT_PATHS = set()
app.add_middleware(CORSMiddleware,allow_origins=sorted(ALLOWED_ORIGINS),allow_credentials=True,allow_methods=['GET','POST','PUT','PATCH','DELETE'],allow_headers=['Content-Type','Authorization','X-CSRF-Token','X-Native-Client','X-Service-Worker'])

def session(request:Request):
    bearer=request.headers.get('authorization','')
    token=bearer[7:] if bearer.startswith('Bearer ') else request.cookies.get(COOKIE,'')
    with s.db() as c:
        row=c.execute('SELECT u.*,ss.csrf,ss.expires,ss.token FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token=?',(s.digest(token),)).fetchone()
    if not row or row['expires']<time.time() or not row['active']: fail('login','Entre para continuar.',401)
    if request.method in MUTATE and request.url.path not in CSRF_EXEMPT_PATHS and not bearer.startswith('Bearer ') and not hmac.compare_digest(request.headers.get('x-csrf-token',''),row['csrf']): fail('csrf','Sessão inválida. Atualize a página.',403)
    from .platform_access import allowed,host_module
    shared=request.url.path.startswith(('/api/auth/','/api/platform/','/api/terms/','/api/web-push/')) or request.url.path=='/api/me'
    if not shared:
        requested=request.url.path.split('/')[2] if len(request.url.path.split('/'))>2 else 'kids'
        requested=requested if requested in PLATFORM_MODULES else 'kids'
        with s.db() as c:
            if not allowed(c,dict(row),requested):fail('module_access','Seu acesso ao Lagoinha Kids não foi autorizado.',403)
        selected=host_module(request.url.hostname or '')
        if selected and selected not in ('systems',requested):fail('module_host','Acesse esta função pelo Lagoinha Kids.',403)
    result=dict(row)
    from .platform_access import platform_admin,is_pastor
    with s.db() as c:
        if platform_admin(c,result['id']) or is_pastor(c,result['id']):result['role']='admin'
    return result
def _user_is_pastor(user):
    if (user.get('staff_role') or '').lower() in ('pastor','pastora'):return True
    from .platform_access import is_pastor
    with s.db() as c:return is_pastor(c,user['id'])
def admin(user=Depends(session)):
    if user['role']!='admin' and not _user_is_pastor(user): fail('forbidden','Acesso exclusivo da administração.',403)
    return user
def identity_admin(user=Depends(admin)):
    from .platform_access import platform_admin
    with s.db() as c:
        if not platform_admin(c,user['id']):fail('platform_admin','Gerencie as contas pela administração central.',403)
    return user

def staff(user=Depends(session)):
    if user['role'] not in ('admin','teacher') and not _user_is_pastor(user): fail('forbidden','Acesso exclusivo da equipe.',403)
    return user
def room_allowed(c,user,room):
    from .platform_access import is_pastor
    if user['role']=='admin' or is_pastor(c,user['id']):return True
    if user['role']!='teacher' or room is None:return False
    record=c.execute('SELECT created_by FROM rooms WHERE id=?',(room,)).fetchone()
    if not record:return False
    if record['created_by']==user['id']:return True
    return c.execute('SELECT 1 FROM teacher_rooms WHERE user_id=? AND room_id=?',(user['id'],room)).fetchone() is not None
def child_visible(c,user,row):
    from .platform_access import is_pastor
    allowed=user['role']=='admin' or is_pastor(c,user['id']) or (user['role']=='parent' and (row['parent_id']==user['id'] or c.execute('SELECT 1 FROM family_links WHERE child_id=? AND user_id=? AND active=1',(row['id'],user['id'])).fetchone()))
    if user['role']=='teacher' and not allowed:
        linked_rooms=[r[0] for r in c.execute('SELECT DISTINCT l.room_id FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1',(row['id'],))]
        allowed=room_allowed(c,user,row['room_id']) or any(room_allowed(c,user,rid) for rid in linked_rooms)
    return allowed

def child_allowed(c,user,child):
    row=c.execute('SELECT * FROM children WHERE id=? AND archived=0',(child,)).fetchone()
    if not row:fail('missing','Aluno não encontrado.',404)
    allowed=child_visible(c,user,row)
    if not allowed:fail('forbidden','Você não tem acesso a este aluno.',403)
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
    otp:str=Field(default='',max_length=40)
class Register(Login):
    name:str=Field(min_length=2,max_length=100)
    phone:str|None=Field(default='',max_length=30)
    terms_version:str|None=None
    terms_accepted:bool=False

@app.get('/api/health')
def health():
    from .web_push_transport import ready as web_push_ready
    return {'status':'ok','application':'Lagoinha Systems','google_enabled':google_ready(),'push_enabled':bool(push_platforms()) or web_push_ready(),'native_push_enabled':bool(push_platforms()),'biometric_liveness':False}
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
        else:
            if row['mfa_secret']:
                from .security import verify_otp
                if not verify_otp(c,row,data.otp):
                    failures=(attempt['failures'] if attempt and attempt['expires']>time.time() else 0)+1
                    c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,failures,int(time.time())+900));c.commit()
                    fail('mfa','Informe o código do autenticador ou um código de recuperação.',401)
            c.execute('DELETE FROM attempts WHERE key=?',(key,))
    if not valid: fail('credentials','E-mail ou senha incorretos.',401)
    grant=login_user(response,row['id'],request.headers.get('x-native-client')=='1')
    return {'user':public_user(row),**grant}
@app.post('/api/auth/register')
def register(data:Register,response:Response,request:Request):
    validate_password(data.password)
    if not data.terms_accepted or data.terms_version!='2026.1':fail('terms','Leia e aceite os termos para criar sua conta.')
    addr=request.client.host if request.client else 'unknown'
    key=s.digest(addr+'|register')
    with s.db() as c:
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(key,)).fetchone()
        if attempt and attempt['expires']>time.time() and attempt['failures']>=15: fail('rate','Muitas tentativas de cadastro. Aguarde alguns minutos.',429)
        try: uid=c.execute('INSERT INTO users(name,email,password,role,phone,created_at) VALUES(?,?,?,?,?,?)',(data.name.strip(),email(data.email),s.password_hash(data.password),'parent',(data.phone or '').strip(),s.now())).lastrowid
        except sqlite3.IntegrityError: fail('exists','Não foi possível cadastrar este e-mail. Tente entrar ou contate a administração.',409)
        failures=(attempt['failures'] if attempt and attempt['expires']>time.time() else 0)+1
        c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(key,failures,int(time.time())+900))
        c.execute('INSERT INTO terms_consents(user_id,child_id,term_version,term_type,ip_address,user_agent,created_at) VALUES(?,?,?,?,?,?,?)',(uid,None,'2026.1','privacy_and_terms',addr,request.headers.get('user-agent','unknown')[:200],s.now()))
        from .platform_access import kids_grant
        kids_grant(c,uid,'parent')
        row=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    return {'user':public_user(row),**login_user(response,uid,request.headers.get('x-native-client')=='1')}
@app.get('/api/me')
def me(user=Depends(session)): return {'user':public_user(user),'csrf':user['csrf'],'google_enabled':google_ready(),'push_enabled':bool(push_platforms())}
@app.post('/api/auth/logout')
def logout(response:Response,user=Depends(session)):
    with s.db() as c:
        c.execute('DELETE FROM sessions WHERE token=?',(user['token'],))
        c.execute('DELETE FROM device_tokens WHERE user_id=? AND session_token=?',(user['id'],user['token']))
        c.execute('DELETE FROM web_subscriptions WHERE user_id=? AND session_token=?',(user['id'],user['token']))
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
        c.execute('DELETE FROM web_subscriptions WHERE user_id=? AND session_token!=?',(user['id'],user['token']))
        c.execute('DELETE FROM device_tokens WHERE user_id=? AND session_token!=?',(user['id'],user['token']))
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
            from .platform_access import kids_grant
            kids_grant(c,uid,'parent')
    response=RedirectResponse('/',303);response.delete_cookie('google_flow',path='/api/auth/google');login_user(response,uid);return response

class Link(BaseModel): parent_id:int
@app.post('/api/children/{cid}/guardian')
def link_guardian(cid:int,data:Link,user=Depends(admin)):
    with s.db() as c:
        child_allowed(c,user,cid)
        if not c.execute('SELECT 1 FROM users WHERE id=? AND role="parent" AND active=1',(data.parent_id,)).fetchone(): fail('parent','Responsável inválido.')
        c.execute('UPDATE children SET parent_id=?,face_allowed=0,face_template=NULL,consent_at=NULL WHERE id=?',(data.parent_id,cid))
        c.execute('UPDATE family_links SET active=0 WHERE child_id=?',(cid,));c.execute('DELETE FROM family_invites WHERE child_id=?',(cid,))
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
    lesson_id:int|None=None
    claim_code:str|None=None
    exception_reason:str=Field(default='',max_length=300)

@app.post('/api/children/{cid}/attendance')
def attendance(cid:int,data:Attendance,user=Depends(staff)):
    if data.action not in ('in','out') or not data.guardian_confirmed: fail('confirm','Confirme pessoalmente o responsável antes de registrar.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        ch=child_allowed(c,user,cid)
        attempt_key=s.digest(f'checkout|{user["id"]}|{cid}')
        attempt=c.execute('SELECT * FROM attempts WHERE key=?',(attempt_key,)).fetchone()
        if data.action=='out' and attempt and attempt['expires']>time.time() and attempt['failures']>=6:fail('rate','Muitas tentativas. Procure a administração ou aguarde 15 minutos.',429)
        if data.lesson_id is not None:
            lesson=c.execute('SELECT * FROM lessons WHERE id=? AND active=1',(data.lesson_id,)).fetchone()
            if not lesson or lesson['starts_at'][:10]!=s.today() or not room_allowed(c,user,lesson['room_id']):fail('lesson','Registre a chegada no dia da aula, na sua turma.',403)
            if not c.execute('SELECT 1 FROM reservations WHERE child_id=? AND lesson_id=? AND confirmed=1',(cid,data.lesson_id)).fetchone():fail('lesson','O aluno não está confirmado nesta aula.',409)
        if not ch['parent_id'] or (data.guardian_id!=ch['parent_id'] and not c.execute('SELECT 1 FROM family_links WHERE child_id=? AND user_id=? AND active=1 AND can_pickup=1',(cid,data.guardian_id)).fetchone()): fail('guardian','Responsável não autorizado.',403)
        guardian=c.execute('SELECT name FROM users WHERE id=? AND active=1',(data.guardian_id,)).fetchone()
        if not guardian: fail('guardian','Responsável indisponível.')
        old=c.execute('SELECT * FROM attendance WHERE child_id=? AND day=?',(cid,s.today())).fetchone()
        if data.action=='in':
            if old and old['status']=='present': fail('already','Entrada já registrada.',409)
            claim=s.generate_claim_code(4)
            c.execute('INSERT INTO attendance(child_id,day,status,in_at,out_at,guardian,actor,claim_code,checkout_guardian) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(child_id,day) DO UPDATE SET status="present",in_at=excluded.in_at,out_at=NULL,guardian=excluded.guardian,actor=excluded.actor,claim_code=excluded.claim_code,checkout_guardian=""',(cid,s.today(),'present',s.now(),None,guardian['name'],user['id'],claim,""))
            title='Entrada registrada'
            msg=f'{ch["name"]}: entrada registrada. Código de Segurança (Claim Tag): {claim}. Apresente este código na retirada da criança.'
        else:
            if not old or old['status']!='present': fail('state','Registre a entrada antes da saída.',409)
            supplied=(data.claim_code or '').strip().upper()
            if not old['claim_code'] or not supplied or not hmac.compare_digest(supplied,old['claim_code']):
                if user['role']!='admin' or len(data.exception_reason.strip())<15:
                    failures=(attempt['failures'] if attempt and attempt['expires']>time.time() else 0)+1
                    c.execute('INSERT OR REPLACE INTO attempts VALUES(?,?,?)',(attempt_key,failures,int(time.time())+900));c.commit()
                    fail('claim_code','Código de retirada inválido. Confira a etiqueta ou procure a administração.',403)
                s.audit(c,user['id'],'checkout_exception',cid)
            claim=old['claim_code'] if old and old['claim_code'] else ''
            c.execute('UPDATE attendance SET status="departed",out_at=?,guardian=?,actor=?,checkout_guardian=? WHERE child_id=? AND day=?',(s.now(),guardian['name'],user['id'],guardian['name'],cid,s.today()))
            title='Saída registrada'
            msg=f'{ch["name"]}: saída conferida pela equipe com responsável {guardian["name"]}.'
        c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?,?)',(ch['parent_id'],cid,'attendance',title,msg,user['id'],s.now()))
        c.execute('DELETE FROM attempts WHERE key=?',(attempt_key,))
        c.execute('INSERT INTO attendance_events(child_id,lesson_id,action,guardian_id,guardian_name,actor,created_at,exception_reason) VALUES(?,?,?,?,?,?,?,?)',(cid,data.lesson_id,data.action,data.guardian_id,guardian['name'],user['id'],s.now(),data.exception_reason.strip() if data.action=='out' else ''))
        s.audit(c,user['id'],'check_in' if data.action=='in' else 'check_out',cid)
    return {'ok':True,'claim_code':claim}

@app.get('/api/terms/privacy')
def get_privacy_terms():
    return {
        'version':'2026.1',
        'title':'Política de Privacidade e Proteção de Dados (LGPD Art. 14)',
        'controller':'Igreja Batista da Lagoinha — Ministério Infantil Lagoinha Kids',
        'summary':'Tratamento de dados estritamente voltado ao melhor interesse da criança e sua segurança física no templo.',
        'sections':[
            {'title':'1. Finalidade Exclusiva','text':'Os dados cadastrais de crianças (nome, nascimento, turma, alergias e condições de saúde) e responsáveis são coletados com a finalidade estrita de acolhimento cristão, segurança física no templo e conferência presencial de entrega de menores durante os cultos.'},
            {'title':'2. Alergias e Cuidados Médicos','text':'Informações de alergias e condições especiais são tratadas como dados sensíveis e exibidas exclusivamente à equipe voluntária responsável pela salinha para preservação da saúde e prevenção de choque anafilático durante as refeições.'},
            {'title':'3. Conferência Facial (Opcional)','text':'O cadastro facial é estritamente opcional e requer autorização expressa dos pais. O sistema não guarda fotos no servidor; gera apenas um descritor criptografado. A conferência é 1:1 e jamais substitui a checagem presencial humana nem autoriza a liberação da criança sozinha. O responsável pode revogar a autorização e solicitar exclusão a qualquer momento.'},
            {'title':'4. Código de Segurança Pareado ("No Tag, No Child")','text':'Em cada culto é gerado um código randômico de 4 caracteres pareado entre a etiqueta da criança e o comprovante dos pais. Nenhuma criança é entregue sem a conferência deste código ou protocolo formal de exceção.'}
        ]
    }

class DeviceTokenIn(BaseModel):
    token:str=Field(min_length=20,max_length=4096)
    platform:str=Field(default='android',pattern='^(android|ios|web)$')

@app.post('/api/devices/token')
def register_device_token(data:DeviceTokenIn,user=Depends(session)):
    with s.db() as c:
        c.execute('INSERT INTO device_tokens(user_id,token,platform,updated_at,session_token) VALUES(?,?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,updated_at=excluded.updated_at,session_token=excluded.session_token',(user['id'],data.token.strip(),data.platform,s.now(),user['token']))
        c.execute('UPDATE outbox SET next_attempt=0 WHERE status="pending" AND notification_id IN(SELECT id FROM notifications WHERE user_id=?)',(user['id'],))
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
            recipients=[r[0] for r in c.execute('SELECT DISTINCT u.id FROM users u JOIN teacher_rooms tr ON tr.user_id=u.id WHERE u.active=1 AND (tr.room_id=? OR EXISTS(SELECT 1 FROM reservations b JOIN lessons l ON l.id=b.lesson_id WHERE b.child_id=? AND b.confirmed=1 AND l.active=1 AND l.room_id=tr.room_id AND l.ends_at>?))',(ch['room_id'],cid,s.now()))]
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
@app.post('/api/notifications/read-all')
def read_all_notifications(user=Depends(session)):
    with s.db() as c:
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE user_id=? AND read_at IS NULL',(s.now(),user['id']))
    return {'ok':True}
@app.post('/api/notifications/{nid}/read')
def read_notification(nid:int,user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone(): fail('missing','Notificação não encontrada.',404)
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=?',(s.now(),nid))
    return {'ok':True}

@app.get('/api/users')
def users(user=Depends(identity_admin)):
    with s.db() as c: return [public_user(r)|{'rooms':[x[0] for x in c.execute('SELECT room_id FROM teacher_rooms WHERE user_id=?',(r['id'],))]} for r in c.execute('SELECT * FROM users ORDER BY name')]
class UserIn(Register):
    role:str='parent'
    staff_role:str=''
    rooms:list[int]=[]
@app.post('/api/users')
def create_user(data:UserIn,user=Depends(identity_admin)):
    if data.role not in ('admin','teacher','parent'): fail('role','Perfil inválido.')
    validate_password(data.password)
    with s.db() as c:
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=?',(rid,)).fetchone() for rid in data.rooms): fail('room','Turma inválida.')
        try: uid=c.execute('INSERT INTO users(name,email,password,role,staff_role,created_at) VALUES(?,?,?,?,?,?)',(data.name,email(data.email),s.password_hash(data.password),data.role,data.staff_role or '',s.now())).lastrowid
        except sqlite3.IntegrityError: fail('exists','E-mail já cadastrado.',409)
        from .platform_access import kids_grant
        kids_grant(c,uid,data.role)
        if data.role=='teacher':
            for rid in set(data.rooms):
                c.execute('UPDATE rooms SET created_by=? WHERE id=?',(uid,rid))
                c.execute('DELETE FROM teacher_rooms WHERE room_id=?',(rid,))
                c.execute('INSERT INTO teacher_rooms VALUES(?,?)',(uid,rid))
        s.audit(c,user['id'],'user_created')
    return {'id':uid}
class UserUpdate(BaseModel):
    active:bool
    rooms:list[int]=[]
    role:str|None=None
    staff_role:str|None=None
    name:str|None=Field(default=None,min_length=2,max_length=100)
    email:str|None=Field(default=None,max_length=200)
    password:str|None=Field(default=None,max_length=128)
    avatar_url:str|None=Field(default=None,max_length=500)
@app.patch('/api/users/{uid}')
def update_user(uid:int,data:UserUpdate,user=Depends(identity_admin)):
    with s.db() as c:
        row=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
        if not row:fail('missing','Usuário não encontrado.',404)
        role=data.role or row['role']
        if role not in ('admin','teacher','parent'):fail('role','Perfil inválido.')
        if uid==user['id'] and (not data.active or role!='admin'):fail('self','Mantenha seu acesso administrativo ativo.')
        if data.password:
            if uid==user['id']:fail('self','Troque sua própria senha em Minha conta.')
            validate_password(data.password)
        from .platform_access import platform_admin
        if platform_admin(c,uid) and (role!='admin' or not data.active):fail('platform_admin','Mantenha o acesso do administrador central.',409)
        target_email=email(data.email) if data.email is not None else row['email']
        target_avatar=data.avatar_url.strip() if data.avatar_url is not None else (row['avatar_url'] if 'avatar_url' in row.keys() else '')
        s_role=data.staff_role if data.staff_role is not None else (row['staff_role'] if 'staff_role' in row.keys() else '')
        if row['role']=='parent' and role!='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(uid,)).fetchone():fail('parent','Este responsável tem filhos vinculados. Ajuste os vínculos antes de mudar o perfil.',409)
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1',(rid,)).fetchone() for rid in data.rooms):fail('room','Turma inválida.')
        try:c.execute('UPDATE users SET active=?,role=?,name=?,email=?,avatar_url=?,staff_role=? WHERE id=?',(int(data.active),role,(data.name or row['name']).strip(),target_email,target_avatar,s_role,uid))
        except sqlite3.IntegrityError:fail('email','E-mail já cadastrado.',409)
        if target_email!=row['email']:c.execute('UPDATE users SET google_sub=NULL WHERE id=?',(uid,))
        owned=[r[0] for r in c.execute('SELECT id FROM rooms WHERE created_by=?',(uid,))]
        desired=set(data.rooms) if role=='teacher' and data.active else set()
        for rid in owned:
            if rid not in desired and row['role']=='teacher':c.execute('UPDATE rooms SET created_by=? WHERE id=?',(user['id'],rid))
        c.execute('DELETE FROM teacher_rooms WHERE user_id=?',(uid,))
        for rid in desired:
            c.execute('UPDATE rooms SET created_by=? WHERE id=?',(uid,rid))
            c.execute('DELETE FROM teacher_rooms WHERE room_id=?',(rid,))
            c.execute('INSERT INTO teacher_rooms VALUES(?,?)',(uid,rid))
        if data.password:c.execute('UPDATE users SET password=? WHERE id=?',(s.password_hash(data.password),uid))
        if not data.active or data.password or role!=row['role'] or target_email!=row['email']:c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        s.audit(c,user['id'],'user_access_updated')
    return {'ok':True}

@app.get('/api/team')
def get_team(user=Depends(staff)):
    with s.db() as c:
        staff_rows = c.execute('''
            SELECT u.*
            FROM users u
            WHERE u.role IN ('admin','teacher')
            ORDER BY u.name
        ''').fetchall()
        members = []
        for r in staff_rows:
            rooms = [x[0] for x in c.execute('SELECT room_id FROM teacher_rooms WHERE user_id=?',(r['id'],))]
            if user['role']!='admin' and r['id']!=user['id'] and not any(room_allowed(c,user,rid) for rid in rooms):
                continue
            visible=public_user(r)
            if user['role']!='admin':
                visible={k:visible[k] for k in ('id','name','role','active','staff_role','avatar_url')}
                rooms=[rid for rid in rooms if room_allowed(c,user,rid)]
            members.append(visible | {'rooms': rooms})
        from .platform_access import platform_admin
        central=platform_admin(c,user['id'])
        candidates = [public_user(r) for r in c.execute('''
            SELECT * FROM users WHERE role='parent' AND active=1 ORDER BY name
        ''').fetchall()]
        return {'members': members, 'candidates': candidates if central else []}

class TeamMemberIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: str = Field(max_length=200)
    password: str = Field(min_length=12, max_length=128)
    staff_role: str = Field(default='teacher')
    rooms: list[int] = []
    phone: str | None = Field(default='', max_length=30)

@app.post('/api/team/member')
def create_team_member(data: TeamMemberIn, user=Depends(identity_admin)):
    s_role = data.staff_role if data.staff_role in ('teacher', 'monitor', 'admin') else 'teacher'
    validate_password(data.password)
    target_mail = email(data.email)
    with s.db() as c:
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1', (rid,)).fetchone() for rid in data.rooms):
            fail('room', 'Turma inválida.')
        try:
            uid = c.execute('''
                INSERT INTO users(name, email, password, role, staff_role, phone, created_at)
                VALUES(?,?,?,?,?,?,?)
            ''', (data.name.strip(), target_mail, s.password_hash(data.password), 'admin' if s_role=='admin' else 'teacher', s_role, (data.phone or '').strip(), s.now())).lastrowid
        except sqlite3.IntegrityError:
            fail('exists', 'E-mail já cadastrado.', 409)
        from .platform_access import kids_grant
        kids_grant(c,uid,'admin' if s_role=='admin' else 'teacher')
        for rid in set(data.rooms):
            c.execute('INSERT OR IGNORE INTO teacher_rooms VALUES(?,?)', (uid, rid))
            if s_role == 'teacher':
                c.execute('UPDATE rooms SET teacher_id=? WHERE id=? AND (teacher_id IS NULL OR teacher_id=created_by)', (uid, rid))
            elif s_role == 'monitor':
                c.execute('UPDATE rooms SET monitor_id=? WHERE id=? AND monitor_id IS NULL', (uid, rid))
        s.audit(c, user['id'], 'team_member_created', uid)
    return {'id': uid, 'staff_role': s_role}

class TeamDelegateIn(BaseModel):
    user_id: int
    staff_role: str = Field(default='teacher')
    rooms: list[int] = []

@app.post('/api/team/delegate')
def delegate_team_member(data: TeamDelegateIn, user=Depends(identity_admin)):
    s_role = data.staff_role if data.staff_role in ('teacher', 'monitor') else 'teacher'
    with s.db() as c:
        target = c.execute('SELECT * FROM users WHERE id=?', (data.user_id,)).fetchone()
        if not target:
            fail('missing', 'Usuário não encontrado.', 404)
        from .platform_access import platform_admin
        if platform_admin(c,data.user_id):fail('platform_admin','Não altere a função central por este formulário.',409)
        if target['role'] == 'admin' and user['role'] != 'admin':
            fail('forbidden', 'Não é permitido alterar administradores.', 403)
        if any(not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1', (rid,)).fetchone() for rid in data.rooms):
            fail('room', 'Turma inválida.')
        if target['role']=='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(data.user_id,)).fetchone():
            fail('parent','Transfira os vínculos dos filhos antes de alterar o perfil.',409)
        c.execute('UPDATE users SET role="teacher", staff_role=? WHERE id=?', (s_role, data.user_id))
        c.execute('DELETE FROM sessions WHERE user_id=?',(data.user_id,))
        c.execute('DELETE FROM teacher_rooms WHERE user_id=?', (data.user_id,))
        for rid in set(data.rooms):
            c.execute('INSERT OR IGNORE INTO teacher_rooms VALUES(?,?)', (data.user_id, rid))
            if s_role == 'teacher':
                c.execute('UPDATE rooms SET teacher_id=? WHERE id=? AND (teacher_id IS NULL OR teacher_id=created_by)', (data.user_id, rid))
            elif s_role == 'monitor':
                c.execute('UPDATE rooms SET monitor_id=? WHERE id=? AND monitor_id IS NULL', (data.user_id, rid))
        s.audit(c, user['id'], 'team_role_delegated', data.user_id)
    return {'ok': True, 'staff_role': s_role}

class TeamMemberUpdate(BaseModel):
    phone: str | None = Field(default=None,max_length=30)
    name: str | None = Field(default=None, min_length=2, max_length=100)
    email: str | None = Field(default=None, max_length=200)
    staff_role: str | None = None
    role: str | None = None
    active: bool | None = None
    rooms: list[int] | None = None
    password: str | None = Field(default=None, max_length=128)

@app.patch('/api/team/member/{uid}')
def update_team_member(uid: int, data: TeamMemberUpdate, user=Depends(identity_admin)):
    with s.db() as c:
        target = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        if not target:
            fail('missing', 'Usuário não encontrado.', 404)
        if target['role'] == 'admin' and user['role'] != 'admin':
            fail('forbidden', 'Você não pode alterar o cadastro de um administrador.', 403)
        if data.role == 'admin' and user['role'] != 'admin':
            fail('forbidden', 'Apenas administradores podem conceder o perfil de administrador.', 403)
        target_role = data.role or target['role']
        from .platform_access import platform_admin
        if platform_admin(c,uid) and (target_role!='admin' or data.active is False):fail('platform_admin','Mantenha o acesso do administrador central.',409)
        if target_role not in ('admin', 'teacher', 'parent'):
            fail('role', 'Perfil inválido.')
        s_role = data.staff_role if data.staff_role is not None else target['staff_role']
        if target_role == 'teacher' and s_role not in ('teacher', 'monitor'):
            s_role = 'teacher'
        if target['role']=='parent' and target_role!='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(uid,)).fetchone():
            fail('parent','Transfira os vínculos dos filhos antes de alterar o perfil.',409)
        if uid==user['id'] and (target_role!='admin' or data.active is False):
            fail('self','Você não pode remover seu próprio acesso administrativo.',409)
        name_val = (data.name or target['name']).strip()
        email_val = email(data.email) if data.email is not None else target['email']
        active_val = int(data.active) if data.active is not None else target['active']
        try:
            c.execute('UPDATE users SET name=?, email=?, role=?, staff_role=?, active=? WHERE id=?',
                      (name_val, email_val, target_role, s_role, active_val, uid))
        except sqlite3.IntegrityError:
            fail('email', 'E-mail já cadastrado.', 409)
        if data.phone is not None:
            c.execute('UPDATE users SET phone=? WHERE id=?',(data.phone.strip(),uid))
        if data.rooms is not None:
            if any(not c.execute('SELECT 1 FROM rooms WHERE id=? AND active=1', (rid,)).fetchone() for rid in data.rooms):
                fail('room', 'Turma inválida.')
            c.execute('DELETE FROM teacher_rooms WHERE user_id=?', (uid,))
            for rid in set(data.rooms):
                c.execute('INSERT INTO teacher_rooms VALUES(?,?)', (uid, rid))
        if data.password:
            validate_password(data.password)
            c.execute('UPDATE users SET password=? WHERE id=?', (s.password_hash(data.password), uid))
            c.execute('DELETE FROM sessions WHERE user_id=?', (uid,))
        if email_val!=target['email']:
            c.execute('UPDATE users SET google_sub=NULL,email_verified=0 WHERE id=?',(uid,))
        if email_val!=target['email'] or target_role!=target['role'] or active_val!=target['active'] or data.rooms is not None:
            c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
        s.audit(c, user['id'], 'team_member_updated', uid)
    return {'ok': True}

class AvatarIn(BaseModel):
    avatar_url:str=Field(default='',max_length=500)

@app.post('/api/me/avatar')
def update_my_avatar(data:AvatarIn,user=Depends(session)):
    url=data.avatar_url.strip()
    if url and not (url.startswith('https://') or url.startswith('http://') or url.startswith('/api/media/') or url.startswith('/')):
        fail('invalid_url','URL de foto de perfil inválida.')
    with s.db() as c:
        c.execute('UPDATE users SET avatar_url=? WHERE id=?',(url,user['id']))
        s.audit(c,user['id'],'user_avatar_updated')
    return {'ok':True,'avatar_url':url}
@app.get('/api/audit')
def audit_log(user=Depends(identity_admin)):
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
    fail('face_retired','Reconhecimento facial descontinuado. Use a carteirinha digital.',410)
    result,feature=engine().analyze(engine().decode(image),True)
    encrypted=s.CIPHER.encrypt(np.asarray(feature,dtype=np.float32).tobytes())
    with s.db() as c:
        ch=child_allowed(c,user,cid)
        if not ch['face_allowed'] or ch['consent_at']!=consent_version or ch['parent_id']!=guardian: fail('consent','Autorização alterada durante o processamento.',403)
        c.execute('UPDATE children SET face_template=? WHERE id=?',(encrypted,cid));s.audit(c,user['id'],'face_enrolled',cid)
    return {'ok':True,'analysis':result,'liveness':False}
@app.post('/api/children/{cid}/face/verify')
def verify_face(cid:int,image:bytes=File(...),user=Depends(staff)):
    fail('face_retired','Reconhecimento facial descontinuado. Use a carteirinha digital.',410)
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

@app.api_route('/download/lagoinha-kids.apk', methods=['GET', 'HEAD'])
def download_apk():
    apk_paths = [
        s.ROOT / 'dist' / 'lagoinha-kids.apk',
        s.ROOT / 'public' / 'lagoinha-kids.apk',
        s.ROOT / 'android' / 'app' / 'build' / 'outputs' / 'apk' / 'debug' / 'app-debug.apk',
    ]
    for p in apk_paths:
        if p.is_file():
            return FileResponse(p, media_type='application/vnd.android.package-archive', filename='lagoinha-kids.apk')
    fail('not_found', 'APK em compilação ou indisponível.', 404)

def _save_uploaded_image(raw: bytes, filename: str, user_id: int):
    if not raw or len(raw) > 10 * 1024 * 1024:
        fail('size', 'Arquivo muito grande. O limite é 10 MB.', 400)
    if raw.startswith(b'%PDF') or (filename and filename.lower().endswith('.pdf')):
        media_id = f"doc_{secrets.token_hex(10)}.pdf"
        with s.db() as c:
            c.execute('INSERT INTO media(id, filename, content_type, data, created_by, created_at) VALUES(?,?,?,?,?,?)',
                      (media_id, filename or 'material.pdf', 'application/pdf', raw, user_id, s.now()))
            c.commit()
        return {'url': f'/api/media/{media_id}', 'id': media_id, 'size': len(raw), 'filename': filename or 'material.pdf'}
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(raw))
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGBA')
            save_format = 'WEBP'
            content_type = 'image/webp'
        else:
            img = img.convert('RGB')
            save_format = 'WEBP'
            content_type = 'image/webp'
        
        img.thumbnail((1200, 800), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format=save_format, quality=82, optimize=True)
        compressed = out.getvalue()
    except Exception as exc:
        fail('invalid_image', f'Formato de imagem inválido: {str(exc)}', 400)
    
    media_id = f"img_{secrets.token_hex(10)}.webp"
    with s.db() as c:
        c.execute('INSERT INTO media(id, filename, content_type, data, created_by, created_at) VALUES(?,?,?,?,?,?)',
                  (media_id, filename or 'upload.webp', content_type, compressed, user_id, s.now()))
        c.commit()
    return {'url': f'/api/media/{media_id}', 'id': media_id, 'size': len(compressed)}

@app.post('/api/upload')
async def upload_media(file: UploadFile = File(...), user = Depends(staff)):
    raw = await file.read(10 * 1024 * 1024 + 1)
    return _save_uploaded_image(raw, file.filename or 'upload.webp', user['id'])

@app.post('/api/avatar/upload')
async def upload_avatar(file: UploadFile = File(...), user = Depends(session)):
    raw = await file.read(10 * 1024 * 1024 + 1)
    if raw.startswith(b'%PDF') or (file.filename or '').lower().endswith('.pdf'):
        fail('image','Selecione uma imagem para a foto de perfil.')
    return _save_uploaded_image(raw, file.filename or 'avatar.webp', user['id'])

@app.api_route('/api/media/{media_id}', methods=['GET', 'HEAD'])
def get_media(media_id: str, user=Depends(session)):
    with s.db() as c:
        row = c.execute('SELECT content_type, data FROM media WHERE id = ?', (media_id,)).fetchone()
    if not row or not row['data']:
        fail('not_found', 'Imagem não encontrada.', 404)
    return Response(
        content=bytes(row['data']),
        media_type=row['content_type'],
        headers={
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline'
        }
    )

from .security import router as security_router
app.include_router(security_router)

from .features import router as features_router
app.include_router(features_router)

from .school import router as school_router
app.include_router(school_router)

from .events import router as events_router
app.include_router(events_router)
from .web_push import router as web_push_router
app.include_router(web_push_router)
from .platform import router as platform_router
app.include_router(platform_router)
from .modules.finance.router import router as finance_router
from .modules.members.router import router as members_router
from .modules.ministries.router import router as ministries_router
module_routers=(finance_router,members_router,ministries_router)
for module_router in module_routers:app.include_router(module_router)
from .calendar_export import router as calendar_router
app.include_router(calendar_router)

WEB_DIR=Path(os.getenv('KIDS_WEB_DIR',str(s.ROOT/'dist')))

def get_build_id():
    html_file = WEB_DIR / 'index.html'
    if html_file.is_file():
        portal=WEB_DIR/'systems.html'
        return hashlib.sha256(html_file.read_bytes()+(portal.read_bytes() if portal.is_file() else b'')).hexdigest()[:12]
    return 'dev'

@app.get('/api/version')
def get_version():
    return {
        'version': '2.3.1',
        'build': get_build_id(),
        'app': 'Lagoinha Systems',
        'encryption': 'AES-128-Fernet-HMAC-SHA256',
        'timestamp': s.now()
    }

def frontend_file(name):
    path=WEB_DIR/name
    if not path.is_file():fail('not_found','Interface não compilada.',404)
    return FileResponse(path,media_type='text/html',headers={'Cache-Control':'no-store','X-App-Build':get_build_id()})

@app.get('/')
@app.get('/index.html')
def serve_root(request:Request):
    from .platform_access import host_module
    return frontend_file('index.html' if host_module(request.url.hostname or '')=='kids' else 'systems.html')

@app.get('/kids')
@app.get('/kids/')
def serve_kids():return frontend_file('index.html')

@app.get('/systems')
@app.get('/systems/')
def serve_admin_systems(request:Request):
    try:user=session(request)
    except HTTPException as exc:
        if exc.status_code==401:return frontend_file('systems.html')
        raise
    from .platform_access import platform_admin
    with s.db() as c:
        if not platform_admin(c,user['id']):fail('platform_admin','Lagoinha Systems é exclusivo da administração de TI.',403)
    return frontend_file('systems.html')

@app.get('/access')
@app.get('/access/')
@app.get('/membro')
@app.get('/membro/')
@app.get('/finance')
@app.get('/finance/')
@app.get('/members')
@app.get('/members/')
@app.get('/ministries')
@app.get('/ministries/')
def serve_systems():return frontend_file('systems.html')


if WEB_DIR.is_dir(): app.mount('/',StaticFiles(directory=WEB_DIR,html=True),name='frontend')

