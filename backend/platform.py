import json
from fastapi import APIRouter,Depends,Request,Response
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail,public_user,validate_password,email
import sqlite3
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
        scopes={r['module']:r['scope'] for r in c.execute('SELECT module,scope FROM module_scopes WHERE user_id=?',(user['id'],))}
        root=platform_admin(c,user['id'])
        from .platform_access import host_module,module_url
        return {'active_module':host_module(request.url.hostname or ''),'user':public_user(user),'platform_admin':root,'modules':[{'id':key,'name':name,'url':module_url(key),'enabled':allowed(c,user,key),'role':('admin' if key!='kids' else user['role']) if root else (user['role'] if key=='kids' else grants.get(key,{}).get('role')),'scope':'' if root else scopes.get(key,''),'status':'operational'} for key,name in MODULES.items()]}

@router.get('/modules/{module}')
def module_home(module:str,user=Depends(session)):
    if module not in MODULES:fail('module','Sistema não encontrado.',404)
    with s.db() as c:
        if not allowed(c,user,module):fail('module_access','Seu acesso a este sistema não foi autorizado.',403)
    return {'id':module,'name':MODULES[module],'status':'operational','message':'Cadastros básicos disponíveis.'}

@router.get('/users')
def users(user=Depends(central_admin)):
    with s.db() as c:
        all_scopes={(r['user_id'],r['module']):r['scope'] for r in c.execute('SELECT user_id,module,scope FROM module_scopes')}
        return [{
            'id':r['id'],'name':r['name'],'email':r['email'],'active':bool(r['active']),
            'platform_admin':platform_admin(c,r['id']),
            'grants':[dict(g)|({'role':r['role']} if g['module']=='kids' else {})|{'scope':all_scopes.get((r['id'],g['module']),'')} for g in c.execute('SELECT module,role,enabled FROM module_access WHERE user_id=?',(r['id'],))]
        } for r in c.execute('SELECT id,name,email,active,role FROM users ORDER BY name')]

class PlatformUser(BaseModel):
    name:str=Field(min_length=2,max_length=100)
    email:str=Field(max_length=200)
    password:str=Field(min_length=12,max_length=128)

@router.post('/users')
def create_identity(data:PlatformUser,user=Depends(central_admin)):
    validate_password(data.password)
    if not data.name.strip():fail('name','Informe o nome do usuário.')
    with s.db() as c:
        try:
            uid=c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',(data.name.strip(),email(data.email),s.password_hash(data.password),'parent',s.now())).lastrowid
        except sqlite3.IntegrityError:fail('email','Este e-mail já está cadastrado.',409)
        s.audit(c,user['id'],'platform_user_created:'+str(uid))
    return {'id':uid,'ok':True,'message':'Usuário criado. Defina os sistemas e perfis de acesso.'}

class PlatformUserPatch(BaseModel):
    active:bool|None=None
    password:str|None=Field(default=None,max_length=128)
    platform_admin:bool|None=None

@router.patch('/users/{uid}')
def update_identity(uid:int,data:PlatformUserPatch,user=Depends(central_admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        target=c.execute('SELECT id,active FROM users WHERE id=?',(uid,)).fetchone()
        if not target:fail('user','Usuário não encontrado.',404)
        if uid==user['id'] and (data.active is False or data.platform_admin is False):
            fail('self_lockout','Você não pode bloquear ou remover seu próprio acesso central.',409)
        if data.password:
            validate_password(data.password)
            c.execute('UPDATE users SET password=? WHERE id=?',(s.password_hash(data.password),uid))
            c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
            s.audit(c,user['id'],'platform_password_reset:'+str(uid))
        if data.active is not None:
            c.execute('UPDATE users SET active=? WHERE id=?',(1 if data.active else 0,uid))
            if not data.active:
                c.execute('DELETE FROM sessions WHERE user_id=?',(uid,))
            s.audit(c,user['id'],f"platform_user_{'activated' if data.active else 'blocked'}:{uid}")
        if data.platform_admin is not None:
            if data.platform_admin:
                c.execute('INSERT INTO platform_admins(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
                s.audit(c,user['id'],'platform_admin_granted:'+str(uid))
            else:
                c.execute('DELETE FROM platform_admins WHERE user_id=?',(uid,))
                s.audit(c,user['id'],'platform_admin_revoked:'+str(uid))
    return {'ok':True,'message':'Conta atualizada com sucesso.'}

class Grant(BaseModel):
    role:str=Field(max_length=20)
    enabled:bool
    scope:str=Field(default='',max_length=60)

@router.put('/users/{uid}/modules/{module}')
def set_grant(uid:int,module:str,data:Grant,user=Depends(central_admin)):
    if module not in MODULES or data.role not in ROLES[module]:fail('role','Sistema ou perfil inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('user','Usuário não encontrado.',404)
        if platform_admin(c,uid):fail('platform_admin','Administradores centrais mantêm acesso a todos os sistemas.',409)
        c.execute('INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role,enabled=excluded.enabled',(uid,module,data.role,int(data.enabled)))
        c.execute('INSERT INTO module_scopes(user_id,module,scope) VALUES(?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET scope=excluded.scope',(uid,module,data.scope.strip()))
        if module=='kids':
            old=c.execute('SELECT role FROM users WHERE id=?',(uid,)).fetchone()
            if old['role']=='parent' and data.role!='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(uid,)).fetchone():fail('family','Transfira os vínculos familiares antes de alterar o perfil Kids.',409)
            c.execute('UPDATE users SET role=? WHERE id=?',(data.role,uid))
        s.audit(c,user['id'],'module_access:'+module+':'+str(uid)+':'+data.role+':'+str(int(data.enabled))+(':'+data.scope.strip() if data.scope.strip() else ''))
    return {'ok':True}

@router.get('/audit')
def global_audit(user=Depends(central_admin)):
    with s.db() as c:
        security_logs=[dict(r) for r in c.execute("SELECT a.id,a.action,a.created_at,coalesce(u.name,'Sistema') actor_name,coalesce(u.email,'') actor_email FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 120")]
        module_logs=[dict(r) for r in c.execute("SELECT mc.id,mc.module,mc.record_id,mc.action,mc.created_at,coalesce(u.name,'Sistema') actor_name FROM module_changes mc LEFT JOIN users u ON u.id=mc.actor ORDER BY mc.created_at DESC LIMIT 120")]
        return {'security_logs':security_logs,'module_logs':module_logs}

@router.get('/backup')
def export_backup(user=Depends(central_admin)):
    with s.db() as c:
        payload={
            'exported_at':s.now(),
            'exported_by':user['email'],
            'counts':{
                'users':c.execute('SELECT count(*) FROM users').fetchone()[0],
                'members_people':c.execute('SELECT count(*) FROM members_people WHERE active=1').fetchone()[0],
                'members_families':c.execute('SELECT count(*) FROM members_families WHERE active=1').fetchone()[0],
                'members_cells':c.execute('SELECT count(*) FROM members_cells WHERE active=1').fetchone()[0],
                'ministries_assignments':c.execute('SELECT count(*) FROM ministries_assignments WHERE active=1').fetchone()[0],
                'ministries_schedules':c.execute('SELECT count(*) FROM ministries_schedules WHERE active=1').fetchone()[0],
                'finance_accounts':c.execute('SELECT count(*) FROM finance_accounts WHERE active=1').fetchone()[0],
                'finance_entries':c.execute('SELECT count(*) FROM finance_entries WHERE active=1').fetchone()[0],
                'kids_children':c.execute('SELECT count(*) FROM children WHERE archived=0').fetchone()[0]
            },
            'members_cells':[dict(r) for r in c.execute('SELECT * FROM members_cells WHERE active=1')],
            'members_families':[dict(r) for r in c.execute('SELECT * FROM members_families WHERE active=1')],
            'members_people':[dict(r) for r in c.execute('SELECT * FROM members_people WHERE active=1')],
            'ministries_assignments':[dict(r) for r in c.execute('SELECT * FROM ministries_assignments WHERE active=1')],
            'ministries_schedules':[dict(r) for r in c.execute('SELECT * FROM ministries_schedules WHERE active=1')],
            'finance_cost_centers':[dict(r) for r in c.execute('SELECT * FROM finance_cost_centers WHERE active=1')],
            'finance_accounts':[dict(r) for r in c.execute('SELECT * FROM finance_accounts WHERE active=1')],
            'finance_entries':[dict(r) for r in c.execute('SELECT * FROM finance_entries WHERE active=1')],
            'finance_service_closings':[dict(r) for r in c.execute('SELECT * FROM finance_service_closings WHERE active=1')]
        }
        s.audit(c,user['id'],'platform:backup_exported')
    return Response(json.dumps(payload,ensure_ascii=False,indent=2).encode('utf-8'),media_type='application/json',headers={'Content-Disposition':'attachment; filename="lagoinha-systems-backup.json"'})

