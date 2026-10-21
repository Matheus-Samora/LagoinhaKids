import base64,json,time,os
from pathlib import Path
import httpx
from cryptography.hazmat.primitives import serialization,hashes
from cryptography.hazmat.primitives.asymmetric import ec,utils

def apns_ready():return bool(os.getenv('KIDS_APNS_KEY_PATH') and Path(os.environ['KIDS_APNS_KEY_PATH']).is_file() and os.getenv('KIDS_APNS_TEAM_ID') and os.getenv('KIDS_APNS_KEY_ID'))
def fcm_ready():
    path=os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    try:
        data=json.loads(Path(path).read_text()) if path else {}
        return bool(data.get('private_key') and data.get('project_id')==os.getenv('KIDS_FIREBASE_PROJECT_ID'))
    except (OSError,ValueError,TypeError):return False
def push_platforms():return [p for p,ready in [('android',fcm_ready()),('ios',apns_ready())] if ready]
def apns_jwt():
    encode=lambda data:base64.urlsafe_b64encode(json.dumps(data,separators=(',',':')).encode()).rstrip(b'=')
    header=encode({'alg':'ES256','kid':os.environ['KIDS_APNS_KEY_ID']})
    claims=encode({'iss':os.environ['KIDS_APNS_TEAM_ID'],'iat':int(time.time())})
    message=header+b'.'+claims
    key=serialization.load_pem_private_key(Path(os.environ['KIDS_APNS_KEY_PATH']).read_bytes(),password=None)
    r,s=utils.decode_dss_signature(key.sign(message,ec.ECDSA(hashes.SHA256())))
    signature=base64.urlsafe_b64encode(r.to_bytes(32,'big')+s.to_bytes(32,'big')).rstrip(b'=')
    return (message+b'.'+signature).decode()
def send_apns(token,notification_id):
    host='api.sandbox.push.apple.com' if os.getenv('KIDS_APNS_SANDBOX','true')=='true' else 'api.push.apple.com'
    from . import store as s
    from .notification_policy import metadata,notification_url
    with s.db() as c:row=c.execute('SELECT * FROM notifications WHERE id=?',(notification_id,)).fetchone()
    meta=metadata(dict(row)) if row else {'url':'/membro','category':'system'}
    base=meta['url'].split('#')[0]
    target=notification_url(notification_id,meta)
    aps={'alert':{'title':'Lagoinha Systems','body':'Você recebeu um novo aviso. Abra o aplicativo para conferir.'}}
    if meta['category'] not in ('activity','announcements'):aps['sound']='default'
    with httpx.Client(http2=True,timeout=15) as client:
        return client.post(f'https://{host}/3/device/{token}',headers={'authorization':'bearer '+apns_jwt(),'apns-topic':os.getenv('KIDS_APNS_TOPIC','com.lagoinha.kids'),'apns-push-type':'alert','apns-priority':'10','apns-collapse-id':f'notice-{notification_id}'},json={'aps':aps,'notification_id':str(notification_id),'category':meta['category'],'url':target})
