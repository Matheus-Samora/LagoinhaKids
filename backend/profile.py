"""Own account profile: versioned atomic save, including an optional photo."""
from datetime import date
from fastapi import APIRouter,Depends,UploadFile,File,Form,Request
from pydantic import BaseModel,Field,ConfigDict
from starlette.concurrency import run_in_threadpool
from . import store as s
from .app import session,fail,public_user,MAX_UPLOAD,_prepare_upload,_insert_upload

from .person_identity import linked_person

router=APIRouter(prefix='/api/me',tags=['Profile'])

class ProfileUpdate(BaseModel):
    model_config=ConfigDict(extra='forbid')
    version:int=Field(ge=1)
    name:str|None=Field(default=None,min_length=2,max_length=100)
    phone:str|None=Field(default=None,max_length=30)
    avatar_url:str|None=Field(default=None,max_length=500)
    birthday:date|None=None
    marital_status:str|None=Field(default=None,max_length=40)
    profession:str|None=Field(default=None,max_length=100)
    address:str|None=Field(default=None,max_length=240)
    public_bio:bool|None=None
    public_profession:bool|None=None
    bio:str|None=Field(default=None,max_length=500)
    family_id:str|None=Field(default=None,max_length=40)
    new_family_name:str|None=Field(default=None,max_length=120)


def family_options(c,user,person=None):
    from .record_policy import manager
    if manager(c,user,'members'):return c.execute('SELECT id,name FROM members_families WHERE active=1 ORDER BY name').fetchall()
    return c.execute('SELECT id,name FROM members_families WHERE active=1 AND (created_by=? OR id=?) ORDER BY name',(user['id'],person['family_id'] if person else '')).fetchall()


def account(c,user):
    row=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
    value=dict(row);value['role']=user['role']
    res=public_user(value,connection=c)
    from .modules.common import decrypt_text
    p_row=linked_person(c,user)
    if p_row:
        p_dict=dict(p_row)
        res['birthday']=p_dict.get('birthday')
        res['profession']=p_dict.get('profession') or ''
        res['marital_status']=p_dict.get('marital_status') or ''
        res['address']=decrypt_text(p_dict.get('address') or '')
        res['bio']=p_dict.get('bio') or (row['bio'] if 'bio' in row.keys() else '') or ''
        res['family_id']=p_dict.get('family_id') or ''
        if p_dict.get('family_id'):
            fam=c.execute('SELECT name FROM members_families WHERE id=?',(p_dict['family_id'],)).fetchone()
            res['family_name']=fam['name'] if fam else ''
        else:
            res['family_name']=''
        if not res.get('phone') and p_dict.get('phone'):
            res['phone']=p_dict['phone']
        if not res.get('avatar_url') and p_dict.get('avatar_url'):
            res['avatar_url']=p_dict['avatar_url']
    else:
        res['birthday']=None
        res['profession']=''
        res['marital_status']=''
        res['address']=''
        res['family_id']=''
        res['family_name']=''
        res['bio']=(row['bio'] if 'bio' in row.keys() else '') or ''
    return res


@router.get('/profile')
def get_profile(user=Depends(session)):
    with s.db() as c:
        families=[{'id':f['id'],'name':f['name']} for f in family_options(c,user,linked_person(c,user))]
        return {'user':account(c,user),'families':families}


def persist(data,user,prepared=None):
    from .modules.common import encrypt_text,check_date,current,save,Record
    if data.birthday:
        check_date(data.birthday)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
        if old['profile_version']!=data.version:fail('conflict','Seu perfil foi atualizado em outra tela. Reabra o perfil para conferir antes de salvar.',409)
        p_row=linked_person(c,user,review=True)
        raw_dump=data.model_dump(exclude={'version'},exclude_none=True)
        values={k:(v.strip() if isinstance(v,str) else v) for k,v in raw_dump.items()}
        if 'name' in values and len(values['name'])<2:fail('name','Informe seu nome com pelo menos duas letras.')
        if prepared:
            if not prepared['content_type'].startswith('image/'):fail('image','Selecione uma imagem para sua foto.')
            values['avatar_url']=_insert_upload(c,prepared,user['id'])['url']
        elif values.get('avatar_url','').startswith('/api/media/'):
            media=c.execute('SELECT content_type,created_by FROM media WHERE id=?',(values['avatar_url'].rsplit('/',1)[-1],)).fetchone()
            if not media or media['created_by']!=user['id'] or not media['content_type'].startswith('image/'):fail('image','Selecione uma foto enviada pela sua conta.')
        elif values.get('avatar_url') and not values['avatar_url'].startswith('https://'):fail('image','Use uma foto enviada pelo aplicativo ou um endereço HTTPS.')
        
        user_fields={k:int(v) if k in ('public_bio','public_profession') else v for k,v in values.items() if k in ('name','phone','avatar_url','bio','public_bio','public_profession')}
        if user_fields:
            result=c.execute('UPDATE users SET '+','.join(k+'=?' for k in user_fields)+',profile_version=profile_version+1 WHERE id=? AND profile_version=?',(*user_fields.values(),user['id'],data.version))
            if result.rowcount!=1:fail('conflict','O perfil mudou durante o salvamento. Reabra para conferir.',409)
        else:
            c.execute('UPDATE users SET profile_version=profile_version+1 WHERE id=? AND profile_version=?',(user['id'],data.version))

        # Handle family selection or new family creation
        target_family_id = None
        has_family_change = False
        if values.get('new_family_name'):
            fn = values['new_family_name'].strip()
            fam_res = save(c,'members_families','members',Record(),{
                'name':fn,'joined_on':None,'cell_id':None,'neighborhood':''
            },user)
            target_family_id = fam_res['id']
            has_family_change = True
        elif 'family_id' in values or 'family_id' in data.model_fields_set:
            fid = (values.get('family_id') or '').strip()
            if fid:
                if fid not in {row['id'] for row in family_options(c,user,p_row)}:fail('family','Solicite à gestão o vínculo com essa família.',403)
                current(c,'members_families',fid)
                target_family_id = fid
            else:
                target_family_id = None
            has_family_change = True

        # Synchronize with members_people without requiring pastoral approval
        m_fields={}
        if 'name' in values:m_fields['name']=values['name']
        if 'phone' in values:m_fields['phone']=values['phone']
        if 'birthday' in values or 'birthday' in data.model_fields_set:
            m_fields['birthday']=data.birthday.isoformat() if data.birthday else None
        if 'marital_status' in values:m_fields['marital_status']=values['marital_status']
        if 'profession' in values:m_fields['profession']=values['profession']
        if 'address' in values:m_fields['address']=encrypt_text(values['address']) if values['address'] else ''
        if 'bio' in values:m_fields['bio']=values['bio']
        if 'avatar_url' in values:m_fields['avatar_url']=values['avatar_url']
        if has_family_change:m_fields['family_id']=target_family_id

        if p_row:
            m_fields['account_user_id']=user['id']
            c.execute(
                'UPDATE members_people SET '+','.join(k+'=?' for k in m_fields)+',version=version+1 WHERE id=?',
                (*m_fields.values(),p_row['id'])
            )
        elif m_fields:
            save(c,'members_people','members',Record(),{
                'name':values.get('name') or user.get('name') or 'Membro',
                'email':user['email'],
                'phone':values.get('phone',''),
                'birthday':data.birthday.isoformat() if data.birthday else None,
                'marital_status':values.get('marital_status',''),
                'profession':values.get('profession',''),
                'address':encrypt_text(values.get('address','')) if values.get('address') else '',
                'bio':values.get('bio',''),
                'avatar_url':values.get('avatar_url',''),
                'family_id':target_family_id,
                'integration_stage':'active_member',
                'relationship':'Membro',
                'account_user_id':user['id']
            },user)

        if any(key in values for key in ('name','phone','birthday','address')):
            c.execute("UPDATE members_people SET confirmed_at=?,data_source='self_confirmed' WHERE account_user_id=? AND active=1",(s.now(),user['id']))
        s.audit(c,user['id'],'own_profile_updated')
        saved_user=account(c,user)
        from .realtime import publish
        publish('profile:updated',{'user_id':user['id']},sector='members')
        return {'ok':True,'user':saved_user}


@router.patch('/profile')
def update_profile(data:ProfileUpdate,user=Depends(session)):
    return persist(data,user)


@router.post('/profile')
async def update_profile_photo(
    request:Request,
    version:int=Form(...,ge=1),
    name:str=Form(...,min_length=2,max_length=100),
    phone:str=Form(default='',max_length=30),
    avatar_url:str|None=Form(default=None,max_length=500),
    birthday:date|None=Form(default=None),
    marital_status:str=Form(default='',max_length=40),
    profession:str=Form(default='',max_length=100),
    address:str=Form(default='',max_length=240),
    bio:str=Form(default='',max_length=500),
    family_id:str|None=Form(default=None,max_length=40),
    new_family_name:str|None=Form(default=None,max_length=120),
    public_bio:bool|None=Form(default=None),
    public_profession:bool|None=Form(default=None),
    photo:UploadFile|None=File(default=None),
    user=Depends(session)
):
    data=ProfileUpdate(
        version=version,name=name,phone=phone,avatar_url=avatar_url,
        birthday=birthday,marital_status=marital_status,
        profession=profession,address=address,bio=bio,
        family_id=family_id,new_family_name=new_family_name,public_bio=public_bio,public_profession=public_profession
    )
    supplied=set(await request.form())
    data=ProfileUpdate.model_validate({k:v for k,v in data.model_dump().items() if k in supplied})
    prepared=None
    if photo:
        raw=await photo.read(MAX_UPLOAD+1)
        if raw.startswith(b'%PDF') or (photo.filename or '').lower().endswith('.pdf'):fail('image','Selecione uma imagem para sua foto.')
        prepared=await run_in_threadpool(_prepare_upload,raw,photo.filename or 'foto.webp')
    return await run_in_threadpool(persist,data,user,prepared)
