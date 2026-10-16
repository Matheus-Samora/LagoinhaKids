from fastapi import APIRouter,Depends,Request
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail,public_user
from .platform_access import MODULES,ROLES,allowed,platform_admin
router=APIRouter(prefix='/api/platform')

def central_admin(user=Depends(session)):
    with s.db() as c:
        if not platform_admin(c,user['id']):fail('platform_admin','Acesso exclusivo da administração central.',403)
    return user

@router.get('/me')
def me(request:Request,user=Depends(session)):
    with s.db() as c:
        grants={r['module']:dict(r) for r in c.execute('SELECT module,role,enabled FROM module_access WHERE user_id=?',(user['id'],))}
        root=platform_admin(c,user['id'])
        from .platform_access import host_module,module_url
        return {'active_module':host_module(request.url.hostname or ''),'user':public_user(user),'platform_admin':root,'modules':[{'id':key,'name':name,'url':module_url(key),'enabled':allowed(c,user,key),'role':('admin' if key!='kids' else user['role']) if root else (user['role'] if key=='kids' else grants.get(key,{}).get('role')),'status':'operational' if key=='kids' else 'planned'} for key,name in MODULES.items()]}

@router.get('/modules/{module}')
def module_home(module:str,user=Depends(session)):
    if module not in MODULES:fail('module','Sistema não encontrado.',404)
    with s.db() as c:
        if not allowed(c,user,module):fail('module_access','Seu acesso a este sistema não foi autorizado.',403)
    return {'id':module,'name':MODULES[module],'status':'operational' if module=='kids' else 'planned','message':'Base preparada. As funcionalidades deste sistema serão implementadas na próxima etapa.'}

@router.get('/users')
def users(user=Depends(central_admin)):
    with s.db() as c:
        return [{'id':r['id'],'name':r['name'],'email':r['email'],'active':bool(r['active']),'platform_admin':platform_admin(c,r['id']),'grants':[dict(g)|({'role':r['role']} if g['module']=='kids' else {}) for g in c.execute('SELECT module,role,enabled FROM module_access WHERE user_id=?',(r['id'],))]} for r in c.execute('SELECT id,name,email,active,role FROM users ORDER BY name')]

class Grant(BaseModel):
    role:str=Field(max_length=20)
    enabled:bool

@router.put('/users/{uid}/modules/{module}')
def set_grant(uid:int,module:str,data:Grant,user=Depends(central_admin)):
    if module not in MODULES or data.role not in ROLES[module]:fail('role','Sistema ou perfil inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('user','Usuário não encontrado.',404)
        if platform_admin(c,uid):fail('platform_admin','Administradores centrais mantêm acesso a todos os sistemas.',409)
        c.execute('INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role,enabled=excluded.enabled',(uid,module,data.role,int(data.enabled)))
        if module=='kids':
            old=c.execute('SELECT role FROM users WHERE id=?',(uid,)).fetchone()
            if old['role']=='parent' and data.role!='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(uid,)).fetchone():fail('family','Transfira os vínculos familiares antes de alterar o perfil Kids.',409)
            c.execute('UPDATE users SET role=? WHERE id=?',(data.role,uid))
        s.audit(c,user['id'],'module_access:'+module+':'+str(uid)+':'+data.role+':'+str(int(data.enabled)))
    return {'ok':True}
