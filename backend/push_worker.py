import os,time,json,argparse
import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from . import store as s
from .push_transport import fcm_ready,apns_ready,send_apns
from . import web_push_transport as web_push

def deliver_batch(limit=50):
    if not fcm_ready() and not apns_ready() and not web_push.ready():return {'configured':False,'sent':0}
    credentials=None
    if fcm_ready():
        credentials=service_account.Credentials.from_service_account_file(os.environ['GOOGLE_APPLICATION_CREDENTIALS'],scopes=['https://www.googleapis.com/auth/firebase.messaging'])
        credentials.refresh(Request());project=credentials.project_id
    sent=0
    with s.db() as c:
        rows=c.execute('SELECT o.id,o.attempts,n.id notification_id,n.user_id,n.kind FROM outbox o JOIN notifications n ON n.id=o.notification_id WHERE o.status="pending" AND o.next_attempt<=? ORDER BY o.id LIMIT ?',(int(time.time()),limit)).fetchall()
    for row in rows:
        try:
            from .platform_access import allowed
            with s.db() as c:
                sector_notice=row['kind'] in ('sector_application','ministry_approved','gc_approved','announcement')
                if not sector_notice and not allowed(c,{'id':row['user_id']},'kids'):
                    c.execute('UPDATE outbox SET next_attempt=?,last_error=? WHERE id=?',(int(time.time())+3600,'Acesso ao módulo Kids suspenso.',row['id']))
                    continue
            with s.db() as c:tokens=[dict(r) for r in c.execute('SELECT d.token,d.platform FROM device_tokens d JOIN users u ON u.id=d.user_id WHERE d.user_id=? AND u.active=1',(row['user_id'],))]
            tokens=[r for r in tokens if (r['platform']=='android' and credentials) or (r['platform']=='ios' and apns_ready())]
            with s.db() as c:
                c.execute('BEGIN IMMEDIATE')
                claimed=c.execute('UPDATE outbox SET next_attempt=? WHERE id=? AND status="pending" AND next_attempt<=?',(int(time.time())+1800,row['id'],int(time.time()))).rowcount
                if not claimed:continue
                subscriptions=[dict(r) for r in c.execute('SELECT w.* FROM web_subscriptions w JOIN users u ON u.id=w.user_id WHERE w.user_id=? AND u.active=1',(row['user_id'],))] if web_push.ready() else []
            if not tokens and not subscriptions:
                with s.db() as c:c.execute('UPDATE outbox SET next_attempt=? WHERE id=?',(int(time.time())+3600,row['id']))
                continue
            delivered_any = False
            for subscription in subscriptions:
                try:
                    if web_push.send(subscription,row['notification_id']):
                        delivered_any = True
                except Exception as ex:
                    pass  # Provider errors can contain private subscription endpoints.
            for device in tokens:
                try:
                    token=device['token']
                    response=send_apns(token,row['notification_id']) if device['platform']=='ios' else httpx.post(f'https://fcm.googleapis.com/v1/projects/{project}/messages:send',headers={'Authorization':'Bearer '+credentials.token},json={'message':{'token':token,'notification':{'title':'Lagoinha Systems' if sector_notice else 'Lagoinha Kids','body':'Você recebeu um novo aviso. Abra o aplicativo para conferir.'},'data':{'notification_id':str(row['notification_id'])}}},timeout=15)
                    if response.status_code==410 or (device['platform']=='android' and response.status_code==404):
                        with s.db() as c:c.execute('DELETE FROM device_tokens WHERE token=?',(token,))
                    else:
                        response.raise_for_status()
                        delivered_any = True
                except Exception as ex:
                    pass
            if not delivered_any:
                raise RuntimeError('Nenhum provedor confirmou o envio.')
            with s.db() as c:c.execute('UPDATE outbox SET status="sent",delivered_at=? WHERE id=?',(s.now(),row['id']))
            sent+=1
        except Exception:
            count=row['attempts']+1
            with s.db() as c:c.execute('UPDATE outbox SET attempts=?,status=?,next_attempt=?,last_error=? WHERE id=?',(count,'failed' if count>=5 else 'pending',int(time.time())+min(3600,30*2**count),'Falha no provedor de push; consulte a configuração.',row['id']))
    return {'configured':True,'sent':sent}
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    while True:
        print(json.dumps(deliver_batch()))
        if args.once:break
        time.sleep(3)
