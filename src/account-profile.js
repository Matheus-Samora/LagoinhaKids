import {guardForm} from './form-lifecycle.js';
import './account-profile.css';
import {uiIcon} from './ui/icons.js';

export function accountProfileUI({api,e,onSaved}){
 async function open(){
  const dialog=document.createElement('dialog');dialog.className='account-profile-dialog';dialog.setAttribute('aria-label','Meu perfil');
  dialog.innerHTML=`<div class="account-profile-heading"><div><h2>Meu perfil</h2><p>Seus dados e sua presença na comunidade.</p></div><button type="button" data-close aria-label="Fechar perfil"><span aria-hidden="true" class="account-close-icon">×</span><span>Fechar</span></button></div><div data-content><p role="status" class="account-profile-loading">Carregando perfil…</p></div>`;
  document.body.append(dialog);dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  let previewUrl=null;dialog.addEventListener('close',()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);dialog.remove();},{once:true});dialog.showModal();
  try{
   const profileData=await api('/me/profile');if(!dialog.isConnected)return;
   let user=profileData.user;
   const families=profileData.families||[];
   const host=dialog.querySelector('[data-content]');
   const ms=user.marital_status||'';
   const initials=user.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toLocaleUpperCase('pt-BR');
   host.innerHTML=`<form class="account-profile-form">
    <div class="account-profile-body">
     <section class="account-profile-photo" aria-label="Foto do perfil">
      <div class="account-photo"><img alt="Sua foto" ${user.avatar_url?`src="${e(user.avatar_url)}"`:'hidden'}><span ${user.avatar_url?'hidden':''}>${e(initials)}</span></div>
      <div class="account-photo-controls"><strong>${e(user.name)}</strong><p>Uma foto ajuda a comunidade a reconhecer você.</p>
       <div class="account-photo-actions"><label class="account-photo-picker">${uiIcon('camera',17)}<span>Alterar foto</span><input type="file" name="photo" accept="image/jpeg,image/png,image/webp" aria-label="Alterar foto de perfil"></label><button type="button" class="secondary" data-remove>Remover</button></div>
       <small data-photo-help>JPG, PNG ou WebP. Até 10 MB.</small>
      </div>
     </section>
     <section class="account-profile-section" aria-labelledby="profile-personal-heading">
      <div class="account-section-heading">${uiIcon('identity',21)}<div><h3 id="profile-personal-heading">Dados pessoais</h3><p>Informações da sua conta, visíveis apenas a quem tem autorização.</p></div></div>
      <div class="account-profile-grid">
       <label class="account-wide">Nome completo <span class="account-required">Obrigatório</span><input name="name" value="${e(user.name)}" required minlength="2" maxlength="100" autocomplete="name"></label>
       <label class="account-wide">E-mail de acesso<input value="${e(user.email)}" type="email" readonly autocomplete="email"><small>Usado para entrar na sua conta.</small></label>
       <label>Celular<input name="phone" value="${e(user.phone||'')}" type="tel" inputmode="tel" maxlength="30" autocomplete="tel" placeholder="(DDD) 99999-9999"></label>
       <label>Data de nascimento<input name="birthday" value="${e(user.birthday||'')}" type="date" autocomplete="bday"></label>
       <label>Estado civil<select name="marital_status"><option value="">Não informado</option>${['Solteiro(a)','Casado(a)','Viúvo(a)','Separado(a) / Divorciado(a)','União Estável'].map(v=>`<option value="${e(v)}" ${ms===v||v.startsWith('Separado')&&(ms.includes('Divorciado')||ms.includes('Separado'))?'selected':''}>${e(v)}</option>`).join('')}</select></label>
       <label>Família<select name="family_id" id="profile-family-select"><option value="">Sem família vinculada</option>${families.map(f=>`<option value="${e(f.id)}" ${user.family_id===f.id?'selected':''}>${e(f.name)}</option>`).join('')}<option value="__new__">Cadastrar nova família</option></select></label>
       <div id="new-family-group" class="account-wide" hidden><label>Nome da nova família<input name="new_family_name" type="text" maxlength="120" placeholder="Ex.: Família Silva"></label></div>
       <label class="account-wide">Endereço residencial<input name="address" value="${e(user.address||'')}" type="text" maxlength="240" autocomplete="street-address" placeholder="Rua, número e bairro"></label>
      </div>
     </section>
     <section class="account-profile-section" aria-labelledby="profile-community-heading">
      <div class="account-section-heading">${uiIcon('community',21)}<div><h3 id="profile-community-heading">No Hall de membros</h3><p>Escolha como quer se apresentar à comunidade.</p></div></div>
      <div class="account-profile-grid">
       <label class="account-wide">Sobre você<textarea name="bio" rows="3" maxlength="500" placeholder="Conte um pouco sobre você e sua caminhada na igreja.">${e(user.bio||'')}</textarea></label>
       <label class="account-wide">Profissão<input name="profession" value="${e(user.profession||'')}" type="text" maxlength="100" autocomplete="organization-title" placeholder="Ex.: Professor(a), autônomo(a), estudante"></label>
      </div>
      <fieldset class="account-privacy"><legend>Visibilidade no Hall</legend>
       <label class="account-privacy-option"><span><strong>Minha biografia</strong><small>Permitir que outros membros leiam sobre você.</small></span><input type="checkbox" name="public_bio" ${user.public_bio!==false?'checked':''}></label>
       <label class="account-privacy-option"><span><strong>Minha profissão</strong><small>Mostrar sua profissão no perfil público.</small></span><input type="checkbox" name="public_profession" ${user.public_profession!==false?'checked':''}></label>
      </fieldset>
      <p class="account-private-note">${uiIcon('permissions',16)}<span>E-mail, telefone, endereço e nascimento não aparecem no Hall.</span></p>
     </section>
    </div>
    <div class="account-profile-feedback"><p role="alert" class="error"></p><p role="status" aria-live="polite"></p></div>
    <footer class="account-profile-footer"><span>As alterações são aplicadas ao salvar.</span><button type="button" class="secondary" data-cancel>Cancelar</button><button type="submit">Salvar alterações</button></footer>
   </form>`;

   const form=host.querySelector('form'),guard=guardForm(form,dialog),file=form.elements.photo,img=form.querySelector('img'),placeholder=form.querySelector('.account-photo span');
   const famSelect=form.querySelector('#profile-family-select'),newFamGroup=form.querySelector('#new-family-group');
   if(famSelect)famSelect.onchange=()=>{const creating=famSelect.value==='__new__';newFamGroup.hidden=!creating;form.elements.new_family_name.required=creating;};
   form.querySelector('[data-cancel]').onclick=()=>dialog.close();
   const photoHelp=form.querySelector('[data-photo-help]'),removeButton=form.querySelector('[data-remove]');
   removeButton.disabled=!user.avatar_url;
   img.onerror=()=>{img.hidden=true;placeholder.hidden=false;};
   let remove=false;
   const revoke=()=>{if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;};
   file.onchange=()=>{const f=file.files[0];if(!f)return;if(f.size>10*1024*1024){form.querySelector('[role=alert]').textContent='A foto deve ter no máximo 10 MB.';file.value='';return;}revoke();previewUrl=URL.createObjectURL(f);img.src=previewUrl;img.hidden=false;placeholder.hidden=true;remove=false;form.querySelector('[name=remove_photo]')?.remove();removeButton.disabled=false;photoHelp.textContent=f.name+' · pronta para salvar';form.querySelector('[role=alert]').textContent='';};
   form.querySelector('[data-remove]').onclick=()=>{revoke();file.value='';img.hidden=true;placeholder.hidden=false;remove=true;removeButton.disabled=true;photoHelp.textContent='A foto será removida ao salvar.';let hidden=form.querySelector('[name=remove_photo]');if(!hidden){hidden=document.createElement('input');hidden.type='hidden';hidden.name='remove_photo';form.append(hidden);}hidden.value='true';};
   
   form.onsubmit=async ev=>{
    ev.preventDefault();if(guard.busy)return;guard.setBusy(true);form.querySelector('[role=alert]').textContent='';form.querySelector('[role=status]').textContent='Salvando dados pessoais…';
    let result;
    try{
     const selectedFam=form.elements.family_id.value;
     const fields={
      version:user.profile_version,
      public_bio:form.elements.public_bio.checked,
      public_profession:form.elements.public_profession.checked,
      name:form.elements.name.value.trim(),
      phone:form.elements.phone.value.trim(),
      birthday:form.elements.birthday.value||null,
      marital_status:form.elements.marital_status.value.trim(),
      profession:form.elements.profession.value.trim(),
      address:form.elements.address.value.trim(),
      bio:(form.elements.bio?.value||'').trim()
     };
     if(selectedFam==='__new__'){
      const nfn=(form.elements.new_family_name?.value||'').trim();
      if(!nfn){
       form.querySelector('[role=alert]').textContent='Informe o nome da nova família.';
       guard.setBusy(false);
       form.querySelector('[role=status]').textContent='';
       return;
      }
      fields.new_family_name=nfn;
     }else{
      fields.family_id=selectedFam||'';
     }
     if(remove)fields.avatar_url='';
     if(file.files[0]){
      const body=new FormData();
      Object.entries(fields).forEach(([k,v])=>{if(v!==null&&v!==undefined)body.append(k,String(v));});
      body.append('photo',file.files[0]);
      result=await api('/me/profile',{method:'POST',body});
     }else{
      result=await api('/me/profile',{method:'PATCH',body:fields});
     }
    }catch(err){guard.setBusy(false);form.querySelector('[role=status]').textContent='';form.querySelector('[role=alert]').textContent=err.message;return;}
    user=result.user;guard.complete();dialog.close();onSaved?.(user);
   };
  }catch(err){if(dialog.isConnected)dialog.querySelector('[data-content]').innerHTML=`<p role="alert">${e(err.message)}</p>`;}
 }
 return {open};
}
