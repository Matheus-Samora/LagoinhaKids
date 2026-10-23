"""Atomic, identity-safe decisions for GC requests; never merge by name."""
from . import store as s
from .app import fail
from .record_policy import global_manager,manager
from .modules.common import save,change


def application_group(c,row):
    if row['target_id']:
        cell=c.execute('SELECT id,name FROM members_cells WHERE id=? AND active=1',(row['target_id'],)).fetchone()
        if not cell:fail('gc','O GC não está mais disponível. Peça revisão à gestão.',409)
        return dict(cell)
    matches=c.execute('SELECT id,name FROM members_cells WHERE lower(name)=? AND active=1',(row['target_name'].lower(),)).fetchall()
    if len(matches)!=1:fail('gc','O pedido antigo precisa ser vinculado a um GC pela gestão.',409)
    return dict(matches[0])


def decide(c,user,rid,approve,group_id=None):
    row=c.execute("SELECT * FROM sector_applications WHERE id=? AND target_type='gc'",(rid,)).fetchone()
    if not row:fail('missing','Solicitação não encontrada.',404)
    cell=application_group(c,row)
    if group_id and cell['id']!=group_id:fail('gc_scope','Solicitação de outro GC.',403)
    wanted='approved' if approve else 'rejected'
    if row['status']==wanted:return {'ok':True,'cell_id':cell['id'],'already_processed':True}
    if row['status']!='pending':fail('state','A solicitação já foi concluída.',409)
    pid=None
    if approve:
        person=application_person(c,user,row,initial_cell_id=cell['id'],stage='gc')
        before=dict(person)
        if person['cell_id'] and person['cell_id']!=cell['id'] and not (global_manager(c,user) or manager(c,user,'members')):fail('transfer','A pessoa já participa de outro GC. Solicite uma transferência à gestão.',409)
        c.execute('UPDATE members_people SET cell_id=?,version=version+1 WHERE id=?',(cell['id'],person['id']))
        pid=person['id'];after=dict(c.execute('SELECT * FROM members_people WHERE id=?',(pid,)).fetchone());change(c,'members',pid,'gc_joined',user,before,after)
    c.execute('UPDATE sector_applications SET status=?,reviewed_by=? WHERE id=?',(wanted,user['id'],rid))
    if row['user_id']:
        title='Solicitação de GC aprovada' if approve else 'Solicitação de GC analisada'
        message='Sua participação no '+cell['name']+' foi aprovada.' if approve else 'A liderança analisou sua solicitação para '+cell['name']+'. Consulte a equipe para orientações.'
        kind='gc_approved' if approve else 'gc_application_result'
        nid=c.execute('INSERT INTO notifications(user_id,kind,title,message,sender,created_at,sector,context_id) VALUES(?,?,?,?,?,?,?,?)',(row['user_id'],kind,title,message,user['id'],s.now(),'members',rid)).lastrowid
        from .realtime import dispatch_notification_event
        dispatch_notification_event(c,row['user_id'],kind,title,message,sector='members',context_id=rid,notification_id=nid)
    s.audit(c,user['id'],'members:gc_application_'+wanted+':'+rid)
    return {'ok':True,'person_id':pid,'cell_id':cell['id']}


def application_person(c,user,application,initial_cell_id=None,stage='in_training'):
    account=c.execute('SELECT * FROM users WHERE id=? AND active=1',(application['user_id'],)).fetchone()
    if not account:fail('account','A conta solicitante não está ativa. Peça revisão à gestão.',409)
    person=c.execute('SELECT * FROM members_people WHERE account_user_id=? AND active=1',(account['id'],)).fetchone()
    if not person:
        legacy=c.execute('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1',(account['email'],)).fetchall()
        if legacy:
            if len(legacy)!=1 or legacy[0]['account_user_id'] is not None or not account['email_verified']:fail('identity','A gestão precisa revisar o vínculo com a conta; nenhum cadastro será fundido por nome.',409)
            before=dict(legacy[0]);c.execute('UPDATE members_people SET account_user_id=?,version=version+1 WHERE id=?',(account['id'],before['id']))
            person=c.execute('SELECT * FROM members_people WHERE id=?',(before['id'],)).fetchone();change(c,'members',before['id'],'application_identity_linked',user,before,dict(person))
    if person:return dict(person)
    from .modules.members.router import Person,values
    data=Person(name=account['name'],account_user_id=account['id'],cell_id=initial_cell_id,email=account['email'],phone=account['phone'] or application['phone'] or '',integration_stage=stage)
    payload=values(data);payload['data_source']='gc_application' if application['target_type']=='gc' else 'ministry_application'
    pid=save(c,'members_people','members',data,payload,user)['id']
    return dict(c.execute('SELECT * FROM members_people WHERE id=?',(pid,)).fetchone())
