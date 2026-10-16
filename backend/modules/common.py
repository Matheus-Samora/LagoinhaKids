import json,secrets,sqlite3
from datetime import date,datetime,timezone
from decimal import Decimal,InvalidOperation
from uuid import UUID
from pydantic import BaseModel,Field
from .. import store as s
from ..app import fail

class Record(BaseModel):
    version:int|None=Field(default=None,ge=1)
    request_id:UUID|None=None

def money(value,positive=False):
    raw=str(value).strip()
    if ',' in raw:raw=raw.replace('.','').replace(',','.')
    try:n=Decimal(raw)
    except InvalidOperation:fail('amount','Informe um valor monetário válido.')
    if not n.is_finite() or abs(n)>Decimal('1000000000') or n!=n.quantize(Decimal('.01')) or (positive and n<=0):fail('amount','Use um valor válido, com até duas casas decimais.' )
    return int(n*100)

def check_date(value):
    if value and str(value)>s.today():fail('date','A data não pode estar no futuro.')

def current(c,table,rid):
    row=c.execute(f'SELECT * FROM {table} WHERE id=? AND active=1',(rid,)).fetchone()
    if not row:fail('missing','Registro não encontrado.',404)
    return dict(row)

def change(c,module,rid,action,user,before,after):
    c.execute('INSERT INTO module_changes(id,module,record_id,action,actor,before_json,after_json,created_at) VALUES(?,?,?,?,?,?,?,?)',(secrets.token_hex(16),module,rid,action,user['id'],json.dumps(before,ensure_ascii=False) if before else None,json.dumps(after,ensure_ascii=False) if after else None,datetime.now(timezone.utc).isoformat(timespec='microseconds')))
    s.audit(c,user['id'],module+':'+action+':'+rid)

def save(c,table,module,data,values,user,rid=None):
    if rid:
        old=current(c,table,rid)
        if data.version is None or old['version']!=data.version:fail('conflict','Este registro mudou. Atualize a tela antes de salvar.',409)
        keys=list(values)
        updated=c.execute(f"UPDATE {table} SET "+','.join(k+'=?' for k in keys)+',version=version+1 WHERE id=? AND version=?',(*values.values(),rid,data.version))
        if updated.rowcount!=1:fail('conflict','Este registro mudou. Atualize a tela antes de salvar.',409)
        change(c,module,rid,'updated',user,old,current(c,table,rid))
    else:
        rid=str(data.request_id or UUID(bytes=secrets.token_bytes(16)))
        old=c.execute(f'SELECT * FROM {table} WHERE id=?',(rid,)).fetchone()
        if old:
            if old['active'] and all(old[k]==v for k,v in values.items()):return {'id':rid,'ok':True}
            fail('duplicate','Esta solicitação já foi utilizada. Atualize a tela.',409)
        keys=['id',*values,'created_at']
        c.execute(f"INSERT INTO {table}("+','.join(keys)+') VALUES('+','.join('?' for _ in keys)+')',(rid,*values.values(),s.now()))
        change(c,module,rid,'created',user,None,current(c,table,rid))
    return {'id':rid,'ok':True}

def archive(c,table,module,rid,version,user):
    old=current(c,table,rid)
    if old['version']!=version:fail('conflict','Registro alterado. Atualize a tela.',409)
    updated=c.execute(f'UPDATE {table} SET active=0,version=version+1 WHERE id=? AND version=?',(rid,version))
    if updated.rowcount!=1:fail('conflict','Registro alterado. Atualize a tela.',409)
    change(c,module,rid,'archived',user,old,dict(old,active=0,version=old['version']+1))
    return {'ok':True}
