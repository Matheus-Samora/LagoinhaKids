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
        notice = None
        with s.db() as c:
            notice = c.execute('SELECT kind FROM notifications WHERE id=?',(notification_id,)).fetchone()

        is_sector = bool(notice and notice['kind'] in ('sector_application','ministry_approved','gc_approved'))
        is_urgent = bool(notice and notice['kind'] == 'urgent_call')
        # Lock-screen payloads must never contain child names, health details or pickup codes.
        payload = {
            'title': 'Lagoinha Kids — chamado da salinha' if is_urgent else ('Lagoinha Systems' if is_sector else 'Lagoinha Kids'),
            'body': 'A equipe precisa falar com você. Abra o aplicativo.' if is_urgent else 'Você recebeu um novo aviso. Abra o aplicativo para conferir.',
            'tag': f'notice-{notification_id}',
            'url': '/membro' if is_sector else '/kids#notifications',
            'id': notification_id,
            'kind': 'urgent_call' if is_urgent else 'general',
            'urgent': is_urgent,
        }

        webpush(
            subscription_info={'endpoint':subscription['endpoint'],'keys':json.loads(subscription['keys_json'])},
            data=json.dumps(payload),
            vapid_private_key=Vapid.from_pem(private_key().encode()),
            vapid_claims={'sub':os.getenv('KIDS_WEB_PUSH_CONTACT','mailto:imm.tecnologia1@gmail.com')},
            ttl=3600 if not is_urgent else 86400,
            headers={'Urgency': 'high' if is_urgent else 'normal'},
            timeout=15
        )
        return True
    except WebPushException as exc:
        if exc.response is not None and exc.response.status_code in (404,410):
            with s.db() as c:c.execute('DELETE FROM web_subscriptions WHERE endpoint=?',(subscription['endpoint'],))
            return False
        raise
