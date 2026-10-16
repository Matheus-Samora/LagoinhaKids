"""Dependencies used by each module's business routes."""
from fastapi import Depends
from .app import session,fail
from . import store as s
from .platform_access import allowed,platform_admin,is_pastor

def module_access(module,roles=None):
    def check(user=Depends(session)):
        with s.db() as c:
            if not allowed(c,user,module):fail('module_access','Acesso não autorizado a este sistema.',403)
            if roles and not platform_admin(c,user['id']) and not is_pastor(c,user['id']):
                grant=c.execute('SELECT role FROM module_access WHERE user_id=? AND module=? AND enabled=1',(user['id'],module)).fetchone()
                effective_roles=set(roles)|({'pastor'} if 'admin' in roles or 'editor' in roles else set())
                if not grant or grant['role'] not in effective_roles:fail('module_role','Seu perfil não permite esta operação.',403)
        return user
    return check

