"""Isolated, resumable deployment. Never changes gcloud's default project.

Run from the repository: python deploy/cloud_run.py
Requires gcloud authenticated as the owner and billing on the dedicated project.
"""
import base64,json,os,secrets,sqlite3,subprocess,sys,time
from pathlib import Path
from urllib.parse import quote
import httpx
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

PROJECT='lagoinha-kids-20261014';NUMBER='82569578125';REGION='southamerica-east1'
INSTANCE='lagoinha-kids-db';SERVICE='lagoinha-kids';REPOSITORY='kids'
ROOT=Path(__file__).resolve().parents[1]
GCLOUD=r'C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd' if os.name=='nt' else 'gcloud'
STATE=ROOT/'runtime/cloud-deployment';STATE.mkdir(parents=True,exist_ok=True)
def gcloud(*args,check=True):
    result=subprocess.run([GCLOUD,*args,'--project='+PROJECT,'--quiet'],cwd=ROOT,capture_output=True,text=True,encoding='utf-8')
    if check and result.returncode:raise RuntimeError(result.stderr[-2000:])
    return result
def info(message):print(message,flush=True)
def api(method,path,payload=None):
    token=gcloud('auth','print-access-token').stdout.strip()
    r=httpx.request(method,'https://'+path,json=payload,headers={'Authorization':'Bearer '+token,'x-goog-user-project':PROJECT},timeout=60)
    r.raise_for_status();return r.json() if r.content else {}
def secret(name,value):
    if gcloud('secrets','describe',name,check=False).returncode:
        gcloud('secrets','create',name,'--replication-policy=automatic')
    versions=json.loads(gcloud('secrets','versions','list',name,'--filter=state:ENABLED','--limit=1','--format=json').stdout)
    if not versions:
        api('POST',f'secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{name}:addVersion',{'payload':{'data':base64.b64encode(value.encode()).decode()}})
    gcloud('secrets','add-iam-policy-binding',name,'--member=serviceAccount:'+SA,'--role=roles/secretmanager.secretAccessor')

def export_clean_database():
    sys.path.insert(0,str(ROOT))
    from psycopg.sql import Literal
    from backend.postgres import IDENTITIES
    database=ROOT/'runtime/kids.sqlite3'
    if not database.is_file():raise RuntimeError('Clean local database required before first deployment.')
    conn=sqlite3.connect(database);conn.row_factory=sqlite3.Row
    try:
        if conn.execute("SELECT count(*) FROM users WHERE email LIKE '%.test'").fetchone()[0]:raise RuntimeError('Remove demonstration accounts before deployment.')
        skip={'sessions','attempts','oauth','auth_tokens','device_tokens','web_subscriptions','outbox'}
        schema=(ROOT/'backend/postgres_schema.sql').read_text(encoding='utf-8')
        import re
        tables=re.findall(r'CREATE TABLE IF NOT EXISTS (\w+)',schema)
        lines=[schema]
        for table in tables:
            if table in skip:continue
            for row in conn.execute('SELECT * FROM '+table):
                columns=','.join(row.keys());values=','.join(Literal(row[key]).as_string() for key in row.keys())
                lines.append(f'INSERT INTO {table}({columns}) VALUES({values});')
        for table in IDENTITIES:
            lines.append(f"SELECT setval(pg_get_serial_sequence('{table}','id'),coalesce((SELECT max(id) FROM {table}),1),EXISTS(SELECT 1 FROM {table}));")
        lines.append("UPDATE outbox SET status='sent',last_error='Imported history; not resent';")
        path=STATE/'initial-data.sql';path.write_text('\n'.join(lines),encoding='utf-8');return path
    finally:conn.close()

def main():
    billing=json.loads(gcloud('billing','projects','describe',PROJECT,'--format=json').stdout)
    if not billing.get('billingEnabled'):
        info('BLOCKED: enable billing only on '+PROJECT+'. No paid resources were created.');return 2
    gcloud('services','enable','run.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','sqladmin.googleapis.com','secretmanager.googleapis.com')
    global SA
    SA='lagoinha-run@'+PROJECT+'.iam.gserviceaccount.com'
    if gcloud('iam','service-accounts','describe',SA,check=False).returncode:gcloud('iam','service-accounts','create','lagoinha-run','--display-name=Lagoinha Kids runtime')
    gcloud('projects','add-iam-policy-binding',PROJECT,'--member=serviceAccount:'+SA,'--role=roles/cloudsql.client')
    if gcloud('artifacts','repositories','describe',REPOSITORY,'--location='+REGION,check=False).returncode:
        gcloud('artifacts','repositories','create',REPOSITORY,'--location='+REGION,'--repository-format=docker')
    if gcloud('sql','instances','describe',INSTANCE,check=False).returncode:
        info('Creating dedicated PostgreSQL instance. This creates ongoing database charges.')
        gcloud('sql','instances','create',INSTANCE,'--database-version=POSTGRES_16','--edition=ENTERPRISE','--tier=db-f1-micro','--region='+REGION,'--storage-size=10','--backup-start-time=03:00','--availability-type=ZONAL','--deletion-protection')
    instance=json.loads(gcloud('sql','instances','describe',INSTANCE,'--format=json').stdout)
    connection=instance['connectionName']
    password_file=STATE/'database-password.txt'
    if not password_file.exists():password_file.write_text(secrets.token_urlsafe(32))
    password=password_file.read_text().strip()
    if gcloud('sql','databases','describe','kids','--instance='+INSTANCE,check=False).returncode:
        gcloud('sql','databases','create','kids','--instance='+INSTANCE)
    users=json.loads(gcloud('sql','users','list','--instance='+INSTANCE,'--format=json').stdout)
    if not any(user['name']=='kids' for user in users):
        api('POST',f'sqladmin.googleapis.com/sql/v1beta4/projects/{PROJECT}/instances/{INSTANCE}/users',{'name':'kids','password':password})
    # First import only; an existing deployment must never overwrite server data.
    if not (STATE/'import-completed').exists():
        if gcloud('run','services','describe',SERVICE,'--region='+REGION,check=False).returncode==0:raise RuntimeError('Existing service found; refusing automatic initial import.')
        dump=export_clean_database();bucket='lagoinha-kids-transfer-'+NUMBER
        if gcloud('storage','buckets','describe','gs://'+bucket,check=False).returncode:
            gcloud('storage','buckets','create','gs://'+bucket,'--location='+REGION,'--uniform-bucket-level-access','--public-access-prevention')
        gcloud('storage','buckets','add-iam-policy-binding','gs://'+bucket,'--member=serviceAccount:'+instance['serviceAccountEmailAddress'],'--role=roles/storage.objectViewer')
        gcloud('storage','cp',str(dump),'gs://'+bucket+'/initial-data.sql')
        gcloud('sql','import','sql',INSTANCE,'gs://'+bucket+'/initial-data.sql','--database=kids','--user=kids')
        (STATE/'import-completed').write_text('Initial sanitized data imported.\n')
        gcloud('storage','rm','gs://'+bucket+'/initial-data.sql')
    master=(ROOT/'runtime/biometric.key').read_text().strip()
    vapid=ROOT/'runtime/web-push.pem'
    if not vapid.exists():vapid.write_bytes(ec.generate_private_key(ec.SECP256R1()).private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    admin_file=ROOT/'runtime/ADMINISTRACAO-REAL.md'
    bootstrap=next(line.split(': ',1)[1] for line in admin_file.read_text(encoding='utf-8').splitlines() if line.startswith('Senha inicial:'))
    secret('kids-database-url',f'postgresql://kids:{quote(password,safe="")}@/kids?host=/cloudsql/{connection}')
    secret('kids-master-key',master);secret('kids-vapid-key',vapid.read_text());secret('kids-bootstrap-password',bootstrap)
    build_sa='lagoinha-build@'+PROJECT+'.iam.gserviceaccount.com'
    if gcloud('iam','service-accounts','describe',build_sa,check=False).returncode:gcloud('iam','service-accounts','create','lagoinha-build','--display-name=Lagoinha Kids build')
    gcloud('artifacts','repositories','add-iam-policy-binding',REPOSITORY,'--location='+REGION,'--member=serviceAccount:'+build_sa,'--role=roles/artifactregistry.writer')
    for role in ['roles/logging.logWriter','roles/storage.objectViewer']:
        gcloud('projects','add-iam-policy-binding',PROJECT,'--member=serviceAccount:'+build_sa,'--role='+role)
    image=f'{REGION}-docker.pkg.dev/{PROJECT}/{REPOSITORY}/app:1.4.0'
    info('Building source without local credentials or runtime files.')
    gcloud('builds','submit','--config=cloudbuild.yaml','--substitutions=_IMAGE='+image,'--service-account=projects/'+PROJECT+'/serviceAccounts/'+build_sa)
    url=f'https://{SERVICE}-{NUMBER}.{REGION}.run.app'
    gcloud('run','deploy',SERVICE,'--image='+image,'--region='+REGION,'--service-account='+SA,'--add-cloudsql-instances='+connection,
        '--set-secrets=KIDS_DATABASE_URL=kids-database-url:latest,KIDS_MASTER_KEY=kids-master-key:latest,KIDS_WEB_PUSH_PRIVATE_KEY=kids-vapid-key:latest,KIDS_BOOTSTRAP_PASSWORD=kids-bootstrap-password:latest',
        '--set-env-vars=KIDS_PUBLIC_URL='+url+',KIDS_BOOTSTRAP_EMAIL=imm.tecnologia1@gmail.com,KIDS_DATA_DIR=/tmp/kids,KIDS_WEB_PUSH_CONTACT=mailto:imm.tecnologia1@gmail.com',
        '--min-instances=1','--max-instances=2','--concurrency=40','--memory=1Gi','--cpu=1','--timeout=60','--no-cpu-throttling','--execution-environment=gen2','--allow-unauthenticated')
    service=json.loads(gcloud('run','services','describe',SERVICE,'--region='+REGION,'--format=json').stdout)
    actual=service['status']['url']
    if actual!=url:gcloud('run','services','update',SERVICE,'--region='+REGION,'--update-env-vars=KIDS_PUBLIC_URL='+actual)
    response=httpx.get(actual+'/api/health',timeout=30);response.raise_for_status()
    (STATE/'deployment-result.json').write_text(json.dumps({'url':actual,'project':PROJECT,'region':REGION,'version':'1.4.0'},indent=2))
    info('DEPLOYED: '+actual);return 0
if __name__=='__main__':sys.exit(main())
