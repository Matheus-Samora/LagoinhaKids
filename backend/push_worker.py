import os,time,json,argparse,hashlib
import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from . import store as s
from .push_transport import fcm_ready,apns_ready,send_apns
from . import web_push_transport as web_push

def accepted(notification_id,channel,destination):
    digest=hashlib.sha256(destination.encode()).hexdigest()
    with s.db() as c:
        return bool(c.execute('SELECT 1 FROM notification_deliveries WHERE notification_id=? AND channel=? AND destination_hash=?',(notification_id,channel,digest)).fetchone())

def remember(notification_id,channel,destination):
    digest=hashlib.sha256(destination.encode()).hexdigest()
    with s.db() as c:c.execute('INSERT INTO notification_deliveries(notification_id,channel,destination_hash,accepted_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',(notification_id,channel,digest,s.now()))

def deliver_batch(limit=50):
    if not fcm_ready() and not apns_ready() and not web_push.ready():return {'configured':False,'sent':0}
    credentials=None
    if fcm_ready():
        credentials=service_account.Credentials.from_service_account_file(os.environ['GOOGLE_APPLICATION_CREDENTIALS'],scopes=['https://www.googleapis.com/auth/firebase.messaging'])
        credentials.refresh(Request());project=credentials.project_id
    sent=0
    with s.db() as c:
        rows=c.execute('SELECT o.id,o.attempts,n.id notification_id,n.user_id,n.kind,n.child_id,n.created_at,n.read_at,n.sector,n.context_id FROM outbox o JOIN notifications n ON n.id=o.notification_id WHERE o.status="pending" AND o.next_attempt<=? ORDER BY CASE WHEN n.kind IN ("urgent_call","please_pickup","pickup_ready") THEN 0 WHEN n.kind IN ("sector_application","arriving") THEN 1 ELSE 2 END,o.id LIMIT ?',(int(time.time()),limit)).fetchall()
    for row in rows:
        try:
            from .notification_policy import push_policy,metadata,notification_url
            with s.db() as c:
                send,delay,reason=push_policy(c,dict(row))
                if not send:
                    if delay:c.execute('UPDATE outbox SET next_attempt=?,last_error=? WHERE id=?',(int(time.time())+delay,reason,row['id']))
                    else:c.execute('UPDATE outbox SET status="suppressed",last_error=? WHERE id=?',(reason,row['id']))
                    continue
            from .platform_access import allowed
            meta=metadata(dict(row))
            target=meta['url'].split('#',1)[0].strip('/')
            sector_notice=target!='kids'
            with s.db() as c:
                if target in ('kids','members','ministries','finance','systems') and not allowed(c,{'id':row['user_id']},target):
                    c.execute('UPDATE outbox SET next_attempt=?,last_error=? WHERE id=?',(int(time.time())+3600,'Acesso ao setor de destino suspenso.',row['id']))
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
            failed_any = False
            for subscription in subscriptions:
                try:
                    if accepted(row['notification_id'],'web',subscription['endpoint']):delivered_any=True;continue
                    if web_push.send(subscription,row['notification_id']):
                        remember(row['notification_id'],'web',subscription['endpoint'])
                        delivered_any = True
                except Exception as ex:
                    failed_any=True  # Never log private subscription endpoints.
            for device in tokens:
                try:
                    token=device['token']
                    if accepted(row['notification_id'],device['platform'],token):delivered_any=True;continue
                    meta=metadata(dict(row))
                    base=meta['url'].split('#')[0]
                    target=notification_url(row['notification_id'],meta)
                    response=send_apns(token,row['notification_id']) if device['platform']=='ios' else httpx.post(f'https://fcm.googleapis.com/v1/projects/{project}/messages:send',headers={'Authorization':'Bearer '+credentials.token},json={'message':{'token':token,'notification':{'title':'Lagoinha Systems' if sector_notice else 'Lagoinha Kids','body':'Você recebeu um novo aviso. Abra o aplicativo para conferir.'},'data':{'notification_id':str(row['notification_id']),'category':meta['category'],'url':target},'android':{'priority':'HIGH' if meta['priority']=='high' else 'NORMAL','notification':{'channel_id':meta['channel'],'tag':f"notice-{row['notification_id']}"}}}},timeout=15)
                    if response.status_code==410 or (device['platform']=='android' and response.status_code==404):
                        with s.db() as c:c.execute('DELETE FROM device_tokens WHERE token=?',(token,))
                    else:
                        response.raise_for_status()
                        remember(row['notification_id'],device['platform'],token)
                        delivered_any = True
                except Exception as ex:
                    failed_any=True
            if not delivered_any or failed_any:
                raise RuntimeError('Nenhum provedor confirmou o envio.')
            with s.db() as c:c.execute('UPDATE outbox SET status="sent",delivered_at=? WHERE id=?',(s.now(),row['id']))
            sent+=1
        except Exception:
            count=row['attempts']+1
            with s.db() as c:c.execute('UPDATE outbox SET attempts=?,status=?,next_attempt=?,last_error=? WHERE id=?',(count,'failed' if count>=5 else 'pending',int(time.time())+min(3600,30*2**count),'Falha no provedor de push; consulte a configuração.',row['id']))
    return {'configured':True,'sent':sent}
def dispatch_operations():
    # Load the HTTP module first: workspace routes depend on its session helpers.
    from .app import app as application
    from .evolution import dispatch_due
    return dispatch_due()

def run_cycle(include_operations=True):
    import logging
    logger=logging.getLogger(__name__)
    if include_operations:
        try:dispatch_operations()
        except Exception as exc:logger.warning('scheduled_operations_deferred type=%s',type(exc).__name__)
    try:return deliver_batch()
    except Exception as exc:
        # A temporary database/provider failure must not terminate the HTTP service.
        logger.warning('push_batch_deferred type=%s',type(exc).__name__)
        return {'configured':True,'sent':0,'retry':True}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--once',action='store_true');args=parser.parse_args()
    last_operations=0
    while True:
        include_operations=time.time()-last_operations>=30
        result=run_cycle(include_operations)
        if include_operations:last_operations=time.time()
        print(json.dumps(result))
        if args.once:break
        time.sleep(15 if result.get('retry') else 3)
