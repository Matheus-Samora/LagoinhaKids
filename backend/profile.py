"""Own account profile: versioned atomic save, including an optional photo."""
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


def account(c,user):
    row=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
    value=dict(row);value['role']=user['role']
    return public_user(value)


@router.get('/profile')
def get_profile(user=Depends(session)):
    with s.db() as c:return {'user':account(c,user)}


def persist(data,user,prepared=None):
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        old=c.execute('SELECT * FROM users WHERE id=?',(user['id'],)).fetchone()
        if old['profile_version']!=data.version:fail('conflict','Seu perfil foi atualizado em outra tela. Reabra o perfil para conferir antes de salvar.',409)
        values={k:v.strip() for k,v in data.model_dump(exclude={'version'},exclude_none=True).items()}
        if 'name' in values and len(values['name'])<2:fail('name','Informe seu nome com pelo menos duas letras.')
        if prepared:
            if not prepared['content_type'].startswith('image/'):fail('image','Selecione uma imagem para sua foto.')
            values['avatar_url']=_insert_upload(c,prepared,user['id'])['url']
        elif values.get('avatar_url','').startswith('/api/media/'):
            media=c.execute('SELECT content_type,created_by FROM media WHERE id=?',(values['avatar_url'].rsplit('/',1)[-1],)).fetchone()
            if not media or media['created_by']!=user['id'] or not media['content_type'].startswith('image/'):fail('image','Selecione uma foto enviada pela sua conta.')
        elif values.get('avatar_url') and not values['avatar_url'].startswith('https://'):fail('image','Use uma foto enviada pelo aplicativo ou um endereço HTTPS.')
        if not values:return {'ok':True,'user':account(c,user)}
        result=c.execute('UPDATE users SET '+','.join(k+'=?' for k in values)+',profile_version=profile_version+1 WHERE id=? AND profile_version=?',(*values.values(),user['id'],data.version))
        if result.rowcount!=1:fail('conflict','O perfil mudou durante o salvamento. Reabra para conferir.',409)
        s.audit(c,user['id'],'own_profile_updated')
        return {'ok':True,'user':account(c,user)}


@router.patch('/profile')
def update_profile(data:ProfileUpdate,user=Depends(session)):
    return persist(data,user)


@router.post('/profile')
async def update_profile_photo(version:int=Form(...,ge=1),name:str=Form(...,min_length=2,max_length=100),phone:str=Form(default='',max_length=30),avatar_url:str|None=Form(default=None,max_length=500),photo:UploadFile|None=File(default=None),user=Depends(session)):
    data=ProfileUpdate(version=version,name=name,phone=phone,avatar_url=avatar_url)
    prepared=None
    if photo:
        raw=await photo.read(MAX_UPLOAD+1)
        if raw.startswith(b'%PDF') or (photo.filename or '').lower().endswith('.pdf'):fail('image','Selecione uma imagem para sua foto.')
        prepared=await run_in_threadpool(_prepare_upload,raw,photo.filename or 'foto.webp')
    return await run_in_threadpool(persist,data,user,prepared)
