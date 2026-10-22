import base64,secrets,time,hmac,hashlib,struct
from fastapi import APIRouter,Depends
from pydantic import BaseModel,Field
from . import store as s
from .app import admin,session,fail
router=APIRouter(prefix='/api')

def totp(secret,timestamp=None):
    counter=int((time.time() if timestamp is None else timestamp)//30)
    raw=hmac.new(base64.b32decode(secret),struct.pack('>Q',counter),hashlib.sha1).digest();offset=raw[-1]&15
    return str((struct.unpack('>I',raw[offset:offset+4])[0]&0x7fffffff)%1000000).zfill(6)
def verify_otp(c,user,code):
    value=code.strip().replace(' ','')
    secret=s.CIPHER.decrypt(user['mfa_secret'].encode()).decode()
    if any(hmac.compare_digest(totp(secret,time.time()+offset),value) for offset in (-30,0,30)):return True
    result=c.execute('DELETE FROM mfa_recovery WHERE user_id=? AND code_hash=?',(user['id'],s.digest(value)))
    return result.rowcount==1
class Setup(BaseModel):password:str=Field(max_length=128)
class Confirm(Setup):secret:str=Field(max_length=300);code:str=Field(max_length=40)
@router.post('/auth/mfa/setup')
def setup(data:Setup,user=Depends(session)):
    if not s.password_ok(data.password,user['password']):fail('credentials','Senha incorreta.',403)
    secret=base64.b32encode(secrets.token_bytes(20)).decode()
    envelope=s.CIPHER.encrypt(f'{user["id"]}|{int(time.time())+600}|{secret}'.encode()).decode()
    return {'secret':secret,'enrollment':envelope}
@router.post('/auth/mfa/confirm')
def confirm(data:Confirm,user=Depends(session)):
    if not s.password_ok(data.password,user['password']):fail('credentials','Senha incorreta.',403)
    try:
        uid,expires,secret=s.CIPHER.decrypt(data.secret.encode(),ttl=600).decode().split('|')
        if int(uid)!=user['id'] or int(expires)<time.time():raise ValueError()
        if not any(hmac.compare_digest(totp(secret,time.time()+offset),data.code.strip()) for offset in (-30,0,30)):raise ValueError()
    except Exception:fail('code','Código inválido ou configuração expirada.',400)
    codes=[secrets.token_hex(6) for _ in range(8)]
    with s.db() as c:
        c.execute('UPDATE users SET mfa_secret=? WHERE id=?',(s.CIPHER.encrypt(secret.encode()).decode(),user['id']))
        c.execute('DELETE FROM mfa_recovery WHERE user_id=?',(user['id'],))
        for code in codes:c.execute('INSERT INTO mfa_recovery VALUES(?,?)',(user['id'],s.digest(code)))
        c.execute('DELETE FROM sessions WHERE user_id=? AND token!=?',(user['id'],user['token']))
        s.audit(c,user['id'],'mfa_enabled')
    return {'ok':True,'recovery_codes':codes}
class Disable(Setup):code:str=Field(max_length=40)
@router.post('/auth/mfa/disable')
def disable(data:Disable,user=Depends(session)):
    with s.db() as c:
        if user.get('mfa_required'):fail('mfa_policy','TI exige segundo fator para esta conta.',403)
        if not user['mfa_secret'] or not s.password_ok(data.password,user['password']) or not verify_otp(c,user,data.code):fail('credentials','Confira sua senha e código.',403)
        c.execute('UPDATE users SET mfa_secret=NULL WHERE id=?',(user['id'],));c.execute('DELETE FROM mfa_recovery WHERE user_id=?',(user['id'],));s.audit(c,user['id'],'mfa_disabled')
    return {'ok':True}
