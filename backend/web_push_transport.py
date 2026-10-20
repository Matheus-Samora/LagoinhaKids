import os,json,base64
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from . import store as s

def private_key():
    value=os.getenv('KIDS_WEB_PUSH_PRIVATE_KEY','')
    path=os.getenv('KIDS_WEB_PUSH_KEY_PATH','')
    return value or (Path(path).read_text() if path and Path(path).is_file() else '')
def ready():return bool(private_key())
def public_key():
    key=serialization.load_pem_private_key(private_key().encode(),password=None)
    raw=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

def send(subscription,notification_id):
    from pywebpush import webpush,WebPushException
    from py_vapid import Vapid
    try:
        from .notification_policy import metadata
        with s.db() as c:
            row=c.execute('SELECT * FROM notifications WHERE id=?',(notification_id,)).fetchone()
        if not row:return False
        notice=dict(row);meta=metadata(notice)
        urgent=meta['category']=='urgent'
        base=meta['url'].split('#')[0]
        payload={
            'title':'Lagoinha Kids — chamado da salinha' if urgent else 'Lagoinha Systems',
            'body':'A equipe da salinha precisa falar com você.' if urgent else {
                'tasks':'Você tem uma nova solicitação ou resposta.',
                'announcements':'Há um novo comunicado para você.',
                'activity':'Há uma atualização de presença ou aula.',
                'system':'Há uma atualização da sua conta.'
            }[meta['category']],
            'tag':f'notice-{notification_id}',
            'url':f'{base}?notice={notification_id}'+('#notifications' if base=='/kids' else ''),
            'id':notification_id,'kind':notice['kind'],'category':meta['category'],
            'urgent':urgent,'priority':meta['priority']
        }

        webpush(
            subscription_info={'endpoint':subscription['endpoint'],'keys':json.loads(subscription['keys_json'])},
            data=json.dumps(payload),
            vapid_private_key=Vapid.from_pem(private_key().encode()),
            vapid_claims={'sub':os.getenv('KIDS_WEB_PUSH_CONTACT','mailto:imm.tecnologia1@gmail.com')},
            ttl=meta['ttl'],
            headers={'Urgency': 'high' if urgent else 'low' if meta['priority']=='low' else 'normal'},
            timeout=15
        )
        return True
    except WebPushException as exc:
        if exc.response is not None and exc.response.status_code in (404,410):
            with s.db() as c:c.execute('DELETE FROM web_subscriptions WHERE endpoint=?',(subscription['endpoint'],))
            return False
        raise
