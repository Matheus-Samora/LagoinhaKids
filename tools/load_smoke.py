"""Read-only benchmark for an isolated local fixture; never targets production."""
import argparse,concurrent.futures,json,os,statistics,time
from urllib.parse import urlsplit
import httpx
p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8892');p.add_argument('--requests',type=int,default=40);args=p.parse_args()
if urlsplit(args.url).hostname not in ('localhost','127.0.0.1','::1'):p.error('Use an isolated localhost fixture, never production.')
if not 1<=args.requests<=1000:p.error('Use 1–1000 requests per stage.')
headers={};paths=['/api/health']
if os.getenv('KIDS_LOAD_EMAIL') and os.getenv('KIDS_LOAD_PASSWORD'):
    r=httpx.post(args.url+'/api/auth/login',headers={'X-Native-Client':'1'},json={'email':os.environ['KIDS_LOAD_EMAIL'],'password':os.environ['KIDS_LOAD_PASSWORD']});r.raise_for_status()
    headers={'Authorization':'Bearer '+r.json()['access_token']};paths=['/api/workspace/tasks','/api/workspace/calendar','/api/members?limit=50','/api/finance']
result=[]
try:
    for concurrency in (1,5,10,25):
        with httpx.Client(base_url=args.url,headers=headers,timeout=30) as client:
            def request(i):
                start=time.perf_counter();response=client.get(paths[i%len(paths)]);return (time.perf_counter()-start)*1000,response.status_code
            start=time.perf_counter()
            with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as pool:rows=list(pool.map(request,range(args.requests)))
            elapsed=time.perf_counter()-start;times=sorted(row[0] for row in rows)
            result.append({'concurrency':concurrency,'requests':len(rows),'errors':sum(code!=200 for _,code in rows),'p95_ms':round(times[min(len(times)-1,int(len(times)*.95))],1),'requests_per_second':round(len(rows)/elapsed,1)})
finally:
    if headers:httpx.post(args.url+'/api/auth/logout',headers=headers,timeout=15)
print(json.dumps({'environment':'isolated localhost','stages':result,'capacity_certified':False}))
if any(row['errors'] for row in result):raise SystemExit(1)
