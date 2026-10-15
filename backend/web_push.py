"""Authenticated Web Push subscriptions for installed Android/iOS PWAs."""
import os,json,base64,re
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import APIRouter,Depends
from pydantic import BaseModel,Field,model_validator
from cryptography.hazmat.primitives import serialization
from . import store as s
from .app import session,fail

router=APIRouter(prefix='/api/web-push')
def private_key():
    value=os.getenv('KIDS_WEB_PUSH_PRIVATE_KEY','')
    path=os.getenv('KIDS_WEB_PUSH_KEY_PATH','')
    return value or (Path(path).read_text() if path and Path(path).is_file() else '')
def ready():return bool(private_key())
def public_key():
    key=serialization.load_pem_private_key(private_key().encode(),password=None)
    raw=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

class Subscription(BaseModel):
    endpoint:str=Field(max_length=2000)
    keys:dict[str,str]
    @model_validator(mode='after')
    def validate_subscription(self):
        url=urlsplit(self.endpoint)
        hosts=('fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','notify.windows.com')
        if url.scheme!='https' or url.username or url.password or url.port not in (None,443) or not any(url.hostname==h or (h!='fcm.googleapis.com' and (url.hostname or '').endswith('.'+h)) for h in hosts):
            raise ValueError('Provedor de notificações não permitido.')
        if set(self.keys)!={'p256dh','auth'}:raise ValueError('Assinatura de notificações inválida.')
        for name,length in [('p256dh',65),('auth',16)]:
            value=self.keys[name]
            if not re.fullmatch(r'[A-Za-z0-9_-]{16,100}={0,2}',value):raise ValueError('Chave inválida.')
            if len(base64.urlsafe_b64decode(value+'='*((-len(value))%4)))!=length:raise ValueError('Chave inválida.')
        return self

@router.get('/config')
def config(user=Depends(session)):
    return {'enabled':ready(),'public_key':public_key() if ready() else None}

@router.post('/subscribe')
def subscribe(data:Subscription,user=Depends(session)):
    if not ready():fail('push_unavailable','Notificações externas ainda não configuradas.',503)
    with s.db() as c:
        c.execute('DELETE FROM web_subscriptions WHERE endpoint=? AND user_id!=?',(data.endpoint,user['id']))
        c.execute('INSERT INTO web_subscriptions(user_id,endpoint,keys_json,session_token,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,keys_json=excluded.keys_json,session_token=excluded.session_token,updated_at=excluded.updated_at',(user['id'],data.endpoint,json.dumps(data.keys),user['token'],s.now()))
        c.execute('UPDATE outbox SET next_attempt=0 WHERE status="pending" AND notification_id IN(SELECT id FROM notifications WHERE user_id=?)',(user['id'],))
    return {'ok':True}

@router.delete('/subscribe')
def unsubscribe(user=Depends(session)):
    with s.db() as c:c.execute('DELETE FROM web_subscriptions WHERE user_id=? AND session_token=?',(user['id'],user['token']))
    return {'ok':True}

@router.post('/test')
def test(user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM web_subscriptions WHERE user_id=?',(user['id'],)).fetchone():fail('push','Ative as notificações neste aparelho primeiro.')
        c.execute('INSERT INTO notifications(user_id,kind,title,message,sender,created_at) VALUES(?,?,?,?,?,?)',(user['id'],'push_test','Teste de notificações','Este é um teste de entrega pelo servidor.',user['id'],s.now()))
    return {'ok':True,'message':'Teste colocado na fila. A entrega será feita pelo servidor.'}

def send(subscription,notification_id):
    from pywebpush import webpush,WebPushException
    from py_vapid import Vapid
    try:
        webpush(subscription_info={'endpoint':subscription['endpoint'],'keys':json.loads(subscription['keys_json'])},
            data=json.dumps({'title':'Lagoinha Kids','body':'Você recebeu um novo aviso. Abra o aplicativo para conferir.','tag':f'notice-{notification_id}','url':'/#notifications','id':notification_id}),
            vapid_private_key=Vapid.from_pem(private_key().encode()),vapid_claims={'sub':os.getenv('KIDS_WEB_PUSH_CONTACT','mailto:imm.tecnologia1@gmail.com')},ttl=3600,timeout=15)
        return True
    except WebPushException as exc:
        if exc.response is not None and exc.response.status_code in (404,410):
            with s.db() as c:c.execute('DELETE FROM web_subscriptions WHERE endpoint=?',(subscription['endpoint'],))
            return False
        raise
