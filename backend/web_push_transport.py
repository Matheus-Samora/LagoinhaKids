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
            notice = c.execute('''
                SELECT n.*, ch.name as child_name, rm.name as room_name, pr.claim_code, pr.reason, pr.id as paging_id
                FROM notifications n
                LEFT JOIN children ch ON ch.id = n.child_id
                LEFT JOIN rooms rm ON rm.id = ch.room_id
                LEFT JOIN paging_requests pr ON pr.child_id = n.child_id AND pr.status IN ('active', 'on_my_way')
                WHERE n.id = ?
            ''', (notification_id,)).fetchone()

        is_urgent = bool(notice and notice['kind'] == 'urgent_call')
        title = notice['title'] if notice else 'Lagoinha Kids'
        body = notice['message'] if notice else 'Você recebeu um novo aviso. Abra o aplicativo para conferir.'
        tag = f"urgent-call-{notice['child_id']}" if is_urgent else f"notice-{notification_id}"

        payload = {
            'title': title,
            'body': body,
            'tag': tag,
            'url': '/#overview' if is_urgent else '/#notifications',
            'id': notification_id,
            'kind': notice['kind'] if notice else 'general',
            'urgent': is_urgent,
            'child_id': notice['child_id'] if notice else None,
            'child_name': notice['child_name'] if notice else None,
            'room_name': notice['room_name'] if notice else None,
            'claim_code': notice['claim_code'] if notice else None,
            'reason': notice['reason'] if notice else None,
            'paging_id': notice['paging_id'] if notice else None,
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
