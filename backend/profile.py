"""Own account profile: versioned atomic save, including an optional photo."""
from datetime import date
from fastapi import APIRouter,Depends,UploadFile,File,Form
from pydantic import BaseModel,Field,ConfigDict
from starlette.concurrency import run_in_threadpool
from . import store as s
from .app import session,fail,public_user,MAX_UPLOAD,_prepare_upload,_insert_upload

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


def account(c,user):
    row=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
    value=dict(row);value['role']=user['role']
    res=public_user(value,connection=c)
    from .modules.common import decrypt_text
    p_row=c.execute('SELECT * FROM members_people WHERE (account_user_id=? OR lower(email)=lower(?)) AND active=1 ORDER BY id LIMIT 1',(user['id'],user['email'])).fetchone()
    if p_row:
        p_dict=dict(p_row)
        res['birthday']=p_dict.get('birthday')
        res['profession']=p_dict.get('profession') or ''
        res['marital_status']=p_dict.get('marital_status') or ''
        res['address']=decrypt_text(p_dict.get('address') or '')
        if not res.get('phone') and p_dict.get('phone'):
            res['phone']=p_dict['phone']
    else:
        res['birthday']=None
        res['profession']=''
        res['marital_status']=''
        res['address']=''
    return res


@router.get('/profile')
def get_profile(user=Depends(session)):
    with s.db() as c:return {'user':account(c,user)}


def persist(data,user,prepared=None):
    from .modules.common import encrypt_text,check_date
    if data.birthday:
        check_date(data.birthday)
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
        if old['profile_version']!=data.version:fail('conflict','Seu perfil foi atualizado em outra tela. Reabra o perfil para conferir antes de salvar.',409)
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
        
        user_fields={k:v for k,v in values.items() if k in ('name','phone','avatar_url')}
        if user_fields:
            result=c.execute('UPDATE users SET '+','.join(k+'=?' for k in user_fields)+',profile_version=profile_version+1 WHERE id=? AND profile_version=?',(*user_fields.values(),user['id'],data.version))
            if result.rowcount!=1:fail('conflict','O perfil mudou durante o salvamento. Reabra para conferir.',409)
        else:
            c.execute('UPDATE users SET profile_version=profile_version+1 WHERE id=? AND profile_version=?',(user['id'],data.version))

        # Synchronize with members_people without requiring pastoral approval
        p_row=c.execute(
            'SELECT * FROM members_people WHERE (account_user_id=? OR lower(email)=lower(?)) AND active=1 ORDER BY id LIMIT 1',
            (user['id'],user['email'])
        ).fetchone()

        m_fields={}
        if 'name' in values:m_fields['name']=values['name']
        if 'phone' in values:m_fields['phone']=values['phone']
        if 'birthday' in values or 'birthday' in data.model_fields_set:
            m_fields['birthday']=data.birthday.isoformat() if data.birthday else None
        if 'marital_status' in values:m_fields['marital_status']=values['marital_status']
        if 'profession' in values:m_fields['profession']=values['profession']
        if 'address' in values:m_fields['address']=encrypt_text(values['address']) if values['address'] else ''

        if p_row:
            m_fields['account_user_id']=user['id']
            c.execute(
                'UPDATE members_people SET '+','.join(k+'=?' for k in m_fields)+',version=version+1 WHERE id=?',
                (*m_fields.values(),p_row['id'])
            )
        elif m_fields:
            from .modules.common import save,Record
            save(c,'members_people','members',Record(),{
                'name':values.get('name') or user.get('name') or 'Membro',
                'email':user['email'],
                'phone':values.get('phone',''),
                'birthday':data.birthday.isoformat() if data.birthday else None,
                'marital_status':values.get('marital_status',''),
                'profession':values.get('profession',''),
                'address':encrypt_text(values.get('address','')) if values.get('address') else '',
                'integration_stage':'active_member',
                'relationship':'Membro',
                'account_user_id':user['id']
            },user)

        s.audit(c,user['id'],'own_profile_updated')
        return {'ok':True,'user':account(c,user)}


@router.patch('/profile')
def update_profile(data:ProfileUpdate,user=Depends(session)):
    return persist(data,user)


@router.post('/profile')
async def update_profile_photo(
    version:int=Form(...,ge=1),
    name:str=Form(...,min_length=2,max_length=100),
    phone:str=Form(default='',max_length=30),
    avatar_url:str|None=Form(default=None,max_length=500),
    birthday:date|None=Form(default=None),
    marital_status:str=Form(default='',max_length=40),
    profession:str=Form(default='',max_length=100),
    address:str=Form(default='',max_length=240),
    photo:UploadFile|None=File(default=None),
    user=Depends(session)
):
    data=ProfileUpdate(
        version=version,name=name,phone=phone,avatar_url=avatar_url,
        birthday=birthday,marital_status=marital_status,
        profession=profession,address=address
    )
    prepared=None
    if photo:
        raw=await photo.read(MAX_UPLOAD+1)
        if raw.startswith(b'%PDF') or (photo.filename or '').lower().endswith('.pdf'):fail('image','Selecione uma imagem para sua foto.')
        prepared=await run_in_threadpool(_prepare_upload,raw,photo.filename or 'foto.webp')
    return await run_in_threadpool(persist,data,user,prepared)
