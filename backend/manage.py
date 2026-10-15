import argparse,getpass,sqlite3,os
from contextlib import closing
from pathlib import Path
from . import store as s

def backup(destination):
    if os.getenv('KIDS_DATABASE_URL'):raise RuntimeError('Use Cloud SQL managed backups or pg_dump for PostgreSQL.')
    target=Path(destination).resolve();target.parent.mkdir(parents=True,exist_ok=True)
    if target==s.DB:raise ValueError('O backup deve usar outro arquivo.')
    with closing(sqlite3.connect(s.DB)) as source,closing(sqlite3.connect(target)) as copy:
        source.backup(copy)
        if copy.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup inválido')
    return target
if __name__=='__main__':
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    b=sub.add_parser('backup');b.add_argument('destination')
    a=sub.add_parser('create-admin');a.add_argument('email');a.add_argument('name')
    args=parser.parse_args()
    if args.command=='backup':print(backup(args.destination))
    if args.command=='create-admin':
        password=getpass.getpass('Senha (mínimo 12 caracteres): ')
        if not 12<=len(password)<=128:raise ValueError('Senha inválida')
        with s.db() as c:
            uid=c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(args.name,args.email.lower().strip(),s.password_hash(password),'admin',s.now())).lastrowid
            s.audit(c,uid,'admin_bootstrapped')
        print('Administrador criado.')
