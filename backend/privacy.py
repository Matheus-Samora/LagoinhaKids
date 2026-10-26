"""Response-only privacy: keep storage intact and restrict account identifiers."""
import re

EMAIL=re.compile(r"[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+",re.I)
PROFILE_FIELDS={'birthday','phone','email','address','pastoral_notes','profession','bio','avatar_url','marital_status','baptism_date','origin_church','joined_on','relationship','family_id','family_name','cell_id','cell_name','integration_stage'}

def hide_emails(value, own_email=''):
    own=(own_email or '').casefold()
    if isinstance(value,dict):
        result={}
        for key,item in value.items():
            if (key.casefold()=='email' or key.casefold().endswith('_email')) and isinstance(item,str):
                if not own or item.casefold()!=own:continue
            result[key]=hide_emails(item,own_email)
        return result
    if isinstance(value,list):return [hide_emails(item,own_email) for item in value]
    if isinstance(value,str):return EMAIL.sub(lambda match:match[0] if own and match[0].casefold()==own else '[e-mail protegido]',value)
    return value

def own_person(row,user):
    return row.get('account_user_id')==user['id']

def operational_person(row,user):
    if own_person(row,user):return row
    # Lists used to assign people to families/classes/ministries are not profiles.
    return {key:value for key,value in row.items() if key in {'id','name','version','active','created_by','created_at'}} | {'profile_restricted':True}
