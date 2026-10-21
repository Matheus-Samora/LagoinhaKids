import {guardForm} from './form-lifecycle.js';
import './account-profile.css';
export function accountProfileUI({api,e,onSaved}){
 async function open(){
  const dialog=document.createElement('dialog');dialog.className='account-profile-dialog';dialog.setAttribute('aria-label','Meu perfil');
  dialog.innerHTML='<div class="account-profile-heading"><h2>Meu perfil</h2><button type="button" data-close>Fechar</button></div><div data-content><p role="status">Carregando perfil…</p></div>';
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  let previewUrl=null;dialog.addEventListener('close',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);dialog.remove();},{once:true});dialog.showModal();
  try{
   let user=(await api('/me/profile')).user;if(!dialog.isConnected)return;
   const host=dialog.querySelector('[data-content]');
   host.innerHTML=`<form class="account-profile-form"><div class="account-photo"><img alt="Sua foto" ${user.avatar_url?`src="${e(user.avatar_url)}"`:'hidden'}><span ${user.avatar_url?'hidden':''}>${e(user.name.slice(0,1))}</span></div><label>Foto de perfil (opcional)<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG ou WebP · até 10 MB</small><button type="button" class="secondary" data-remove>Remover foto</button><label>Nome<input name="name" value="${e(user.name)}" required minlength="2" maxlength="100" autocomplete="name"></label><label>E-mail<input value="${e(user.email)}" type="email" readonly></label><label>Celular (opcional)<input name="phone" value="${e(user.phone||'')}" type="tel" inputmode="tel" maxlength="30" autocomplete="tel"></label><p role="alert" class="error"></p><p role="status" aria-live="polite"></p><button type="submit">Salvar e fechar</button></form>`;
   const form=host.querySelector('form'),guard=guardForm(form,dialog),file=form.elements.photo,img=form.querySelector('img'),placeholder=form.querySelector('.account-photo span');
   let remove=false;
   const revoke=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
   file.onchange=()=>{const f=file.files[0];if(!f)return;if(f.size>10*1024*1024){form.querySelector('[role=alert]').textContent='A foto deve ter no máximo 10 MB.';file.value='';return;}revoke();previewUrl=URL.createObjectURL(f);img.src=previewUrl;img.hidden=false;placeholder.hidden=true;remove=false;form.querySelector('[role=alert]').textContent='';};
   form.querySelector('[data-remove]').onclick=()=>{revoke();file.value='';img.hidden=true;placeholder.hidden=false;remove=true;let hidden=form.querySelector('[name=remove_photo]');if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name='remove_photo';form.append(hidden);}hidden.value='true';};
   form.onsubmit=async ev=>{
    ev.preventDefault();if(guard.busy)return;guard.setBusy(true);form.querySelector('[role=alert]').textContent='';form.querySelector('[role=status]').textContent='Salvando…';
    let result;
    try{
     const fields={version:user.profile_version,name:form.elements.name.value,phone:form.elements.phone.value};if(remove)fields.avatar_url='';
     if(file.files[0]){const body=new FormData();Object.entries(fields).forEach(([k,v])=>body.append(k,String(v)));body.append('photo',file.files[0]);result=await api('/me/profile',{method:'POST',body});}
     else result=await api('/me/profile',{method:'PATCH',body:fields});
    }catch(err){guard.setBusy(false);form.querySelector('[role=status]').textContent='';form.querySelector('[role=alert]').textContent=err.message;return;}
    user=result.user;guard.complete();dialog.close();onSaved?.(user);
   };
  }catch(err){if(dialog.isConnected)dialog.querySelector('[data-content]').innerHTML=`<p role="alert">${e(err.message)}</p>`;}
 }
 return {open};
}
