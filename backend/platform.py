from .person_identity import linked_person
import json,secrets
from fastapi import APIRouter,Depends,Request,Response
from pydantic import BaseModel,Field
from . import store as s
from .app import session,fail,public_user,validate_password,email
import sqlite3
from .platform_access import MODULES,ROLES,allowed,platform_admin,is_pastor,scope_values
from .modules.common import encrypt_text,decrypt_text
from .record_policy import visible_announcement
from .modules.ministries.router import CATALOG as MINISTRY_CATALOG
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
        pastor=is_pastor(c,user['id'])
        from .platform_access import host_module,module_url
        notifs=[dict(r) for r in c.execute('SELECT id,kind,title,message,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 25',(user['id'],))]
        return {
            'active_module':host_module(request.url.hostname or ''),
            'user':public_user(user),
            'platform_admin':root,
            'pastor':pastor,
            'gc_leader':bool(c.execute('SELECT 1 FROM gc_leaders WHERE user_id=?',(user['id'],)).fetchone()),
            'encryption':'AES-128-Fernet-HMAC-SHA256',
            'notifications':notifs,
            'notification_unread_count':c.execute('SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()['n'],
            'modules':[{
                'id':key,'name':name,'url':module_url(key),
                'enabled':allowed(c,user,key),
                'role':('admin' if key!='kids' else user['role']) if root else ('pastor' if pastor else (user['role'] if key=='kids' else grants.get(key,{}).get('role'))),
                'scope':'' if (root or pastor) else scopes.get(key,''),
                'status':'operational'
            } for key,name in MODULES.items()]
        }

@router.get('/community')
def community_catalog(user=Depends(session)):
    with s.db() as c:
        cells=[dict(r) for r in c.execute('SELECT mc.*,(SELECT count(*) FROM members_people p WHERE p.cell_id=mc.id AND p.active=1) member_count FROM members_cells mc WHERE mc.active=1 ORDER BY mc.name')]
        if not (platform_admin(c,user['id']) or is_pastor(c,user['id'])):
            for cell in cells:
                member=c.execute('SELECT 1 FROM members_people WHERE cell_id=? AND account_user_id=? AND active=1',(cell['id'],user['id'])).fetchone()
                leader=c.execute('SELECT 1 FROM gc_leaders WHERE cell_id=? AND user_id=?',(cell['id'],user['id'])).fetchone()
                if not member and not leader:cell.pop('address',None)
        counts={r['ministry']:dict(r) for r in c.execute('SELECT ministry,count(*) total,sum(CASE WHEN is_leader=1 THEN 1 ELSE 0 END) leaders FROM ministries_assignments WHERE active=1 GROUP BY ministry')}
        my_apps=[]
        for r in c.execute('SELECT * FROM sector_applications WHERE user_id=? OR (email!=? AND lower(email)=?) ORDER BY created_at DESC LIMIT 50',(user['id'],'',user['email'].lower() if user.get('email_verified') else '')):
            d=dict(r);d['notes']=decrypt_text(d.get('notes',''));my_apps.append(d)
        notifs=[dict(r) for r in c.execute('SELECT id,kind,title,message,created_at,read_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 25',(user['id'],))]
        announcements=[dict(r) for r in c.execute('SELECT * FROM platform_announcements WHERE active=1 AND (publish_at IS NULL OR publish_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 200',(s.now(),s.now())) if visible_announcement(c,user,dict(r))][:40]
        p_row=linked_person(c,user)
        my_schedules=[]
        if p_row:
            my_schedules=[dict(r) for r in c.execute("SELECT ms.*,p.name person_name FROM ministries_schedules ms JOIN members_people p ON p.id=ms.person_id WHERE ms.person_id=? AND ms.active=1 ORDER BY ms.service_date ASC,ms.service_time ASC LIMIT 30",(p_row['id'],)).fetchall()]
        return {
            'cells':cells,
            'ministries':[{'name':m,'total':counts.get(m,{}).get('total',0),'leaders':counts.get(m,{}).get('leaders',0)} for m in MINISTRY_CATALOG],
            'my_applications':my_apps,
            'notifications':notifs,
            'announcements':announcements,
            'my_schedules':my_schedules
        }

class CommunityApplication(BaseModel):
    target_type:str=Field(pattern='^(gc|ministry)$')
    target_id:str=Field(default='',max_length=80)
    target_name:str=Field(min_length=2,max_length=120)
    role_desired:str=Field(default='Participante',max_length=100)
    phone:str=Field(default='',max_length=40)
    notes:str=Field(default='',max_length=500)

@router.post('/apply')
def apply_to_sector(data:CommunityApplication,user=Depends(session)):
    t_name=data.target_name.strip()
    if data.target_type=='ministry' and t_name not in MINISTRY_CATALOG:
        fail('ministry','Selecione um ministério oficial válido.')
    rid=secrets.token_hex(16)
    phone=(data.phone or user.get('phone') or '').strip()
    role_des=(data.role_desired or ('Participante de GC' if data.target_type=='gc' else 'Voluntário')).strip()
    now=s.now()
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if data.target_type=='gc':
            if data.target_id.strip():cell=c.execute('SELECT id,name FROM members_cells WHERE id=? AND active=1',(data.target_id.strip(),)).fetchone()
            else:
                matches=c.execute('SELECT id,name FROM members_cells WHERE lower(name)=? AND active=1',(t_name.lower(),)).fetchall()
                if len(matches)>1:fail('gc','Selecione o GC pelo cartão correspondente.',409)
                cell=matches[0] if matches else None
            if not cell:fail('gc','GC não encontrado.',404)
            t_id=cell['id'];t_name=cell['name']
        else:
            t_id=t_name
        dup=c.execute("SELECT id FROM sector_applications WHERE user_id=? AND target_type=? AND target_id=? AND status='pending'",(user['id'],data.target_type,t_id)).fetchone()
        if dup:return {'id':dup['id'],'ok':True,'message':f'Sua solicitação para {t_name} já está em análise pelo líder do setor!'}
        c.execute(
            'INSERT INTO sector_applications(id,user_id,member_name,phone,email,target_type,target_id,target_name,role_desired,notes,status,reviewed_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (rid,user['id'],user['name'],phone,user['email'],data.target_type,t_id,t_name,role_des,encrypt_text(data.notes), 'pending', None, now)
        )
        if phone and not user.get('phone'):
            c.execute('UPDATE users SET phone=? WHERE id=?',(phone,user['id']))
        # Determine responsible leaders to notify
        leaders=set()
        if data.target_type=='ministry':
            for r in c.execute("SELECT ma.user_id, coalesce(ms.scope,'') scope FROM module_access ma LEFT JOIN module_scopes ms ON ms.user_id=ma.user_id AND ms.module='ministries' WHERE ma.module='ministries' AND ma.enabled=1 AND ma.role IN ('admin','pastor','editor')"):
                if not r['scope'] or t_name in scope_values(r['scope']):
                    leaders.add(r['user_id'])
            n_title=f'🙌 Nova Candidatura · Ministério {t_name}'
            n_msg=f"{user['name']} candidatou-se ao ministério {t_name} na função '{role_des}'. Entre em contato para preparar e aprovar!"
        else:
            for r in c.execute("SELECT user_id FROM module_access WHERE module='members' AND enabled=1 AND role IN ('admin','pastor','editor')"):
                leaders.add(r['user_id'])
            leaders.update(r['user_id'] for r in c.execute('SELECT user_id FROM gc_leaders WHERE cell_id=?',(t_id,)))
            n_title=f'🏠 Novo Pedido de GC · {t_name}'
            n_msg=f"{user['name']} deseja participar do {t_name}. Entre em contato para acolher e integrar ao grupo!"
        leaders={lid for lid in leaders if c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(lid,)).fetchone()}
        # Notify the responsible team first. Pastoral/TI is an escalation fallback.
        if not leaders:
            leaders.update(r['id'] for r in c.execute("SELECT u.id FROM users u WHERE u.active=1 AND (lower(u.staff_role) IN ('pastor','pastora') OR u.id IN (SELECT user_id FROM pastoral_users) OR u.id IN (SELECT user_id FROM module_access WHERE role='pastor' AND enabled=1))"))
        if not leaders:leaders.update(r['user_id'] for r in c.execute('SELECT user_id FROM platform_admins'))
        leaders={lid for lid in leaders if c.execute('SELECT 1 FROM users WHERE id=? AND active=1',(lid,)).fetchone()}
        for lid in leaders:
            nid=c.execute('INSERT INTO notifications(user_id,child_id,kind,title,message,sender,created_at,sector,context_id) VALUES(?,?,?,?,?,?,?,?,?)',(lid,None,'sector_application' if data.target_type=='ministry' else 'gc_application',n_title,n_msg,user['id'],now,'ministries' if data.target_type=='ministry' else 'members',rid)).lastrowid
            from .realtime import dispatch_notification_event
            dispatch_notification_event(c,lid,'sector_application' if data.target_type=='ministry' else 'gc_application',n_title,n_msg,sector='ministries' if data.target_type=='ministry' else 'members',context_id=rid,notification_id=nid)
        s.audit(c,user['id'],f'sector_apply:{data.target_type}:{t_name}')
    return {'id':rid,'ok':True,'message':f'Inscrição enviada! O responsável por {t_name} foi notificado e entrará em contato.'}

@router.post('/notifications/{nid}/read')
def mark_notification_read(nid:int,user=Depends(session)):
    with s.db() as c:
        if not c.execute('SELECT 1 FROM notifications WHERE id=? AND user_id=?',(nid,user['id'])).fetchone():
            fail('notice','Notificação não encontrada.',404)
        c.execute('UPDATE notifications SET read_at=coalesce(read_at,?) WHERE id=? AND user_id=?',(s.now(),nid,user['id']))
        from .realtime import publish
        count=c.execute('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()[0]
        publish('notification:count', {'unread_count':count}, user_id=user['id'])
    return {'ok':True}

class PlatformAnnouncementCreate(BaseModel):
    request_id:__import__('uuid').UUID|None=None
    title:str=Field(min_length=2,max_length=140)
    message:str=Field(min_length=2,max_length=1200)
    target_sector:str=Field(default='all',max_length=40)
    audience:str=Field(default='sector',pattern='^(sector|leaders|people)$')
    recipient_ids:list[int]=Field(default_factory=list,max_length=1000)
    event_date:str|None=Field(default=None,max_length=40)
    location:str|None=Field(default=None,max_length=140)
    banner_url:str|None=Field(default=None,max_length=300)
    publish_at:str|None=Field(default=None,max_length=40)
    expires_at:str|None=Field(default=None,max_length=40)
    require_ack:bool=False

def announcement_people(c,user,sector):
    if sector not in ('all','kids','members','ministries','finance'):fail('sector','Setor inválido.')
    root=platform_admin(c,user['id']) or is_pastor(c,user['id'])
    if not root and (sector=='all' or not c.execute("SELECT 1 FROM module_access WHERE user_id=? AND module=? AND enabled=1 AND role IN ('admin','pastor','editor')",(user['id'],sector)).fetchone()):
        fail('forbidden','Sem permissão para comunicar neste setor.',403)
    scope=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
    scope=(scope['scope'] or '') if scope and sector=='ministries' and not root else ''
    audience={'target_sector':sector,'target_scope':scope}
    # Load access metadata once instead of issuing per-user database queries.
    people=[dict(row) for row in c.execute('SELECT id,name,staff_role FROM users WHERE active=1 ORDER BY name,id')]
    grants=[dict(row) for row in c.execute('SELECT user_id,module,role FROM module_access WHERE enabled=1')]
    global_ids={row['user_id'] for row in c.execute('SELECT user_id FROM platform_admins')}
    global_ids.update(row['user_id'] for row in c.execute('SELECT user_id FROM pastoral_users'))
    global_ids.update(row['user_id'] for row in grants if row['role']=='pastor')
    global_ids.update(p['id'] for p in people if (p['staff_role'] or '').strip().lower() in ('pastor','pastora'))
    eligible={p['id'] for p in people} if sector=='all' else global_ids|{g['user_id'] for g in grants if g['module']==sector}
    leaders=global_ids|{g['user_id'] for g in grants if (sector=='all' or g['module']==sector) and g['role'] in ('admin','pastor','editor','teacher')}
    if scope:
        scopes={row['user_id']:row['scope'] for row in c.execute("SELECT user_id,scope FROM module_scopes WHERE module='ministries'")}
        managers={g['user_id'] for g in grants if g['module']=='ministries' and g['role'] in ('admin','editor')}
        selected=scope_values(scope)
        assigned={r['user_id'] for r in c.execute("SELECT coalesce(p.account_user_id,u.id) user_id,a.ministry FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id LEFT JOIN users u ON lower(u.email)=lower(p.email) WHERE a.active=1 AND p.active=1") if r['user_id'] and r['ministry'] in selected}
        eligible={uid for uid in eligible if uid in global_ids or scope_values(scopes.get(uid,'')) & selected or (uid in managers and not scopes.get(uid)) or uid in assigned}
    result=[{'id':p['id'],'name':p['name'],'leader':p['id'] in leaders} for p in people if p['id'] in eligible]
    return result

@router.get('/announcement-recipients')
def announcement_recipients(sector:str='all',user=Depends(session)):
    with s.db() as c:return announcement_people(c,user,sector)

@router.get('/announcements')
def list_announcements(user=Depends(session)):
    with s.db() as c:
        return [dict(r) for r in c.execute('SELECT * FROM platform_announcements WHERE active=1 AND (publish_at IS NULL OR publish_at<=?) AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 200',(s.now(),s.now())) if visible_announcement(c,user,dict(r))][:50]

@router.post('/announcements')
def create_announcement(data:PlatformAnnouncementCreate,user=Depends(session)):
    t_sector=data.target_sector.strip()
    valid_targets=('all','kids','members','ministries','finance')
    if t_sector not in valid_targets:fail('target_sector','Setor de destino inválido.')
    from .evolution import date_time
    publish=date_time(data.publish_at).isoformat(timespec='seconds') if data.publish_at else None
    expiry=date_time(data.expires_at).isoformat(timespec='seconds') if data.expires_at else None
    if expiry and date_time(expiry)<=date_time(publish or s.now()):fail('expiry','A expiração deve ser posterior à publicação.')
    aid=str(data.request_id) if data.request_id else secrets.token_hex(16)
    request_digest=s.digest(str(user['id'])+'|'+json.dumps(data.model_dump(mode='json',exclude={'request_id'}),sort_keys=True))
    now=s.now()
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old_request=c.execute('SELECT * FROM platform_announcements WHERE id=?',(aid,)).fetchone()
        if old_request:
            if old_request['author_id']==user['id'] and old_request['request_digest']==request_digest:return {'id':aid,'ok':True,'message':'Comunicado já recebido.','scheduled':not bool(old_request['dispatched']),'recipient_count':len(set(json.loads(old_request['audience_ids']))-{user['id']})}
            fail('duplicate','Solicitação já utilizada.',409)
        is_root=platform_admin(c,user['id'])
        pastor=is_pastor(c,user['id'])
        leader_grants={r['module']:r['role'] for r in c.execute("SELECT module,role FROM module_access WHERE user_id=? AND enabled=1 AND role IN ('admin','pastor','editor')",(user['id'],))}
        is_leader=bool(is_root or pastor or leader_grants)
        if not is_leader:
            fail('forbidden','Apenas líderes responsáveis ou coordenadores de setores podem publicar comunicados e eventos.',403)
        if not (is_root or pastor) and (t_sector=='all' or t_sector not in leader_grants):
            fail('forbidden',f'Seu usuário não possui coordenação autorizada para o setor {t_sector}.',403)

        scope_row=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
        target_scope=(scope_row['scope'] or '') if scope_row and t_sector=='ministries' and not (is_root or pastor) else ''
        c.execute(
            'INSERT INTO platform_announcements(id,title,message,target_sector,author_id,author_name,event_date,location,banner_url,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)',
            (aid,data.title.strip(),data.message.strip(),t_sector,user['id'],user['name'],data.event_date.strip() if data.event_date else None,data.location.strip() if data.location else None,data.banner_url.strip() if data.banner_url else '',now)
        )

        candidates=announcement_people(c,user,t_sector)
        permitted={p['id'] for p in candidates}
        if data.audience=='people':
            recipients=set(data.recipient_ids)
            if not recipients:fail('recipient_ids','Selecione pelo menos uma pessoa.')
            if not recipients.issubset(permitted):fail('recipient_ids','Há destinatários fora do setor ou da sua permissão.',403)
        elif data.audience=='leaders':
            recipients={p['id'] for p in candidates if p['leader']}
        else:
            # Global oversight does not imply subscribing to every sector's push.
            sector_users={r['user_id'] for r in c.execute('SELECT user_id FROM module_access WHERE module=? AND enabled=1',(t_sector,))} if t_sector!='all' else permitted
            recipients=permitted & sector_users
        selected=json.dumps(sorted(recipients)) if data.audience!='sector' else ''
        c.execute('UPDATE platform_announcements SET target_scope=?,target_user_ids=? WHERE id=?',(target_scope,selected,aid))
        scheduled=bool(publish and date_time(publish)>date_time(now))
        c.execute('UPDATE platform_announcements SET publish_at=?,expires_at=?,require_ack=?,dispatched=?,audience_ids=?,request_digest=? WHERE id=?',(publish,expiry,int(data.require_ack),0 if scheduled else 1,json.dumps(sorted(recipients)),request_digest,aid))
        if not scheduled:
            from .evolution import emit_announcement
            emit_announcement(c,aid,recipients,user['id'],data.title.strip(),data.message.strip(),t_sector)
        s.audit(c,user['id'],f'platform_announcement_created:{aid}:{t_sector}')
        return {'id':aid,'ok':True,'message':'Comunicado enviado pelo aplicativo.','recipient_count':len(recipients-{user['id']}),'scheduled':scheduled}

@router.delete('/announcements/{aid}')
def remove_announcement(aid:str,user=Depends(session)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        row=c.execute('SELECT * FROM platform_announcements WHERE id=?',(aid,)).fetchone()
        if not row:fail('announcement','Comunicado não encontrado.',404)
        if not (platform_admin(c,user['id']) or is_pastor(c,user['id']) or row['author_id']==user['id']):
            fail('forbidden','Apenas o autor do comunicado ou a liderança pastoral/TI pode removê-lo.',403)
        c.execute('UPDATE platform_announcements SET active=0 WHERE id=?',(aid,))
        from .realtime import publish
        publish('announcement:archived', {'id': aid}, sector='all')
        s.audit(c,user['id'],f'platform_announcement_archived:{aid}')
        return {'ok':True,'message':'Comunicado arquivado.'}

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
            'pastor':is_pastor(c,r['id']),
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
    pastor:bool|None=None

@router.patch('/users/{uid}')
def update_identity(uid:int,data:PlatformUserPatch,user=Depends(central_admin)):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        target=c.execute('SELECT id,active FROM users WHERE id=?',(uid,)).fetchone()
        if not target:fail('user','Usuário não encontrado.',404)
        before={'active':target['active'],'platform_admin':bool(platform_admin(c,uid)),'pastor':bool(is_pastor(c,uid))}
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
        if data.pastor is not None:
            if data.pastor:
                c.execute('INSERT INTO pastoral_users(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
                c.execute("UPDATE users SET staff_role='pastor' WHERE id=?",(uid,))
                s.audit(c,user['id'],'pastor_role_granted:'+str(uid))
            else:
                c.execute('DELETE FROM pastoral_users WHERE user_id=?',(uid,))
                c.execute("UPDATE users SET staff_role='' WHERE id=? AND staff_role IN ('pastor','pastora')",(uid,))
                s.audit(c,user['id'],'pastor_role_revoked:'+str(uid))
        from .modules.common import change
        after={'active':c.execute('SELECT active FROM users WHERE id=?',(uid,)).fetchone()[0],'platform_admin':bool(platform_admin(c,uid)),'pastor':bool(is_pastor(c,uid))}
        change(c,'systems',str(uid),'access_updated',user,before,after)
    return {'ok':True,'message':'Conta atualizada com sucesso.'}

class Grant(BaseModel):
    role:str=Field(max_length=20)
    enabled:bool
    scope:str=Field(default='',max_length=500)
    scopes:list[str]|None=Field(default=None,max_length=16)

@router.put('/users/{uid}/modules/{module}')
def set_grant(uid:int,module:str,data:Grant,user=Depends(central_admin)):
    if module not in MODULES or data.role not in ROLES[module]:fail('role','Sistema ou perfil inválido.')
    if data.scopes is not None:
        if module!='ministries' and data.scopes:fail('scope','Escopo inválido.')
        if any(v not in MINISTRY_CATALOG for v in data.scopes):fail('scope','Ministério inválido.')
        data=data.model_copy(update={'scope':json.dumps(sorted(set(data.scopes)),ensure_ascii=False) if data.scopes else ''})
    if data.scope and not scope_values(data.scope)<=set(MINISTRY_CATALOG):fail('scope','Ministério inválido.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('user','Usuário não encontrado.',404)
        if platform_admin(c,uid):fail('platform_admin','Administradores centrais mantêm acesso a todos os sistemas.',409)
        c.execute('INSERT INTO module_access(user_id,module,role,enabled) VALUES(?,?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET role=excluded.role,enabled=excluded.enabled',(uid,module,data.role,int(data.enabled)))
        c.execute('INSERT INTO module_scopes(user_id,module,scope) VALUES(?,?,?) ON CONFLICT(user_id,module) DO UPDATE SET scope=excluded.scope',(uid,module,data.scope.strip()))
        if data.role=='pastor' and data.enabled:
            c.execute('INSERT INTO pastoral_users(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING',(uid,))
            c.execute("UPDATE users SET staff_role='pastor' WHERE id=?",(uid,))
        if module=='kids':
            kids_db_role='admin' if data.role=='pastor' else data.role
            old=c.execute('SELECT role FROM users WHERE id=?',(uid,)).fetchone()
            if old['role']=='parent' and kids_db_role!='parent' and c.execute('SELECT 1 FROM children WHERE parent_id=? AND archived=0',(uid,)).fetchone():fail('family','Transfira os vínculos familiares antes de alterar o perfil Kids.',409)
            c.execute('UPDATE users SET role=? WHERE id=?',(kids_db_role,uid))
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
            'finance_service_closings':[dict(r) for r in c.execute('SELECT * FROM finance_service_closings WHERE active=1')],
            'hall_posts':[dict(r) for r in c.execute('SELECT * FROM hall_posts')],
            'hall_comments':[dict(r) for r in c.execute('SELECT * FROM hall_comments')],
            'hall_reactions':[dict(r) for r in c.execute('SELECT * FROM hall_reactions')],
            'hall_reports':[dict(r) for r in c.execute('SELECT * FROM hall_reports')]
        }
        payload['format']='lagoinha-operational-export-v2'
        payload['full_database_backup']=False
        for table in ('service_templates','gc_leaders','gc_meetings','gc_attendance','member_journey','personal_availability','schedule_responses','pickup_authorizations','notice_acknowledgements','workflow_reviews','finance_approvals','finance_statement_lines','finance_transfers','finance_recurrences'):
            payload[table]=[dict(r) for r in c.execute('SELECT * FROM '+table)]
        s.audit(c,user['id'],'platform:backup_exported')
    return Response(json.dumps(payload,ensure_ascii=False,indent=2).encode('utf-8'),media_type='application/json',headers={'Content-Disposition':'attachment; filename="lagoinha-systems-backup.json"'})


