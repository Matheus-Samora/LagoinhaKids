"""Server-side sector authority and immutable ownership of business records."""
from .platform_access import allowed,platform_admin,is_pastor
from .app import fail

TABLES={
 'members':{'people':'members_people','families':'members_families','cells':'members_cells'},
 'ministries':{'assignments':'ministries_assignments','schedules':'ministries_schedules','resources':'ministries_resources'},
 'finance':{'accounts':'finance_accounts','entries':'finance_entries','invoices':'finance_invoices','cost-centers':'finance_cost_centers','closings':'finance_service_closings'}
}

def global_manager(c,user):return platform_admin(c,user['id']) or is_pastor(c,user['id'])

def manager(c,user,module):
 if global_manager(c,user):return True
 return bool(c.execute("SELECT 1 FROM module_access WHERE user_id=? AND module=? AND enabled=1 AND role IN ('admin','editor')",(user['id'],module)).fetchone())

def check_scope(c,user,module,row):
 if module=='ministries' and not global_manager(c,user):
  grant=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
  if grant and grant['scope'] and row.get('ministry')!=grant['scope']:fail('scope','Registro de outro ministério.',403)

def can_change(c,user,module,row):
 if not allowed(c,user,module) and not (module=='members' and row.get('created_by')==user['id']):fail('module_access','Acesso ao setor não autorizado.',403)
 check_scope(c,user,module,row)
 if not manager(c,user,module) and row.get('created_by')!=user['id']:
  fail('owner','Você pode alterar ou arquivar somente os seus próprios registros.',403)

def personal_records(c,user,module,archived=False):
 if module not in TABLES or (module!='members' and not allowed(c,user,module)):fail('module_access','Acesso ao setor não autorizado.',403)
 rows=[]
 for kind,table in TABLES[module].items():
  for row in c.execute(f"SELECT * FROM {table} WHERE created_by=? AND active=? ORDER BY created_at DESC LIMIT 100",(user['id'],0 if archived else 1)):
   d=dict(row)
   try:check_scope(c,user,module,d)
   except Exception:continue
   rows.append({'id':d['id'],'kind':kind,'label':d.get('name') or d.get('title') or d.get('description') or d.get('service_name') or d.get('number') or d.get('ministry') or kind,'version':d['version'],'created_at':d['created_at'],'active':bool(d['active'])})
 return {'personal_only':True,'records':rows}

def visible_announcement(c,user,row):
 target=row.get('target_sector','all')
 if global_manager(c,user):return True
 if target!='all' and not allowed(c,user,target):return False
 scope=row.get('target_scope','')
 if not scope:return True
 own_scope=c.execute("SELECT scope FROM module_scopes WHERE user_id=? AND module='ministries'",(user['id'],)).fetchone()
 if own_scope and own_scope['scope']==scope:return True
 if manager(c,user,'ministries') and (not own_scope or not own_scope['scope']):return True
 return bool(c.execute("SELECT 1 FROM ministries_assignments a JOIN members_people p ON p.id=a.person_id WHERE p.created_by=? AND p.active=1 AND a.active=1 AND a.ministry=?",(user['id'],scope)).fetchone())
