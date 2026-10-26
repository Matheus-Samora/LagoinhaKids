import './notification-center.css';
import {uiIcon} from './ui/icons.js';
import {guardForm} from './form-lifecycle.js';

export function notificationCenterUI({api,e,subscribe,onChange=()=>{}}){
 const categories=[['all','Todas'],['urgent','Chamados'],['tasks','Solicitações'],['announcements','Comunicados'],['activity','Atividades'],['system','Sistema']];
 let activeDialog=null,activeController=null;
 function mount(host,{noticeId=null}={}){
  let items=[],next=null,unreadCount=0,category='all',unread=false,busy=false,preferences=null,settings=false,error='',generation=0,preferencesGuard=null;
  const pendingReads=new Set();
  function canLeavePreferences(){if(preferencesGuard?.busy)return false;if(preferencesGuard?.dirty&&!confirm('Descartar as preferências que ainda não foram salvas?'))return false;preferencesGuard?.dispose();preferencesGuard=null;return true;}
  const relative=value=>{const date=new Date(value),minutes=Math.floor((Date.now()-date)/60000);return minutes<1?'Agora':minutes<60?`Há ${minutes} min`:new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(date);};
  async function load(append=false){
   const current=++generation;busy=true;error='';render();
   try{
    const query=new URLSearchParams({category,unread:String(unread),limit:'30'});if(append&&next)query.set('before',next);
    const data=await api('/notification-center?'+query);
    if(noticeId&&!append&&!data.items.some(item=>item.id===Number(noticeId))){const selected=await api('/notification-center/'+Number(noticeId));data.items.unshift(selected);}
    if(current!==generation||!host.isConnected)return;
    items=append?[...items,...data.items]:data.items;next=data.next_before;unreadCount=data.unread_count;onChange(unreadCount);
   }catch(err){if(current===generation)error=err.message;}
   finally{if(current===generation&&host.isConnected){busy=false;render();}}
  }
  async function read(item,details){
   if(!item||item.read_at||pendingReads.has(item.id))return;pendingReads.add(item.id);
   try{await api(`/notification-center/${item.id}/read`,{method:'POST'});if(!host.isConnected)return;item.read_at=new Date().toISOString();unreadCount=Math.max(0,unreadCount-1);details.classList.remove('is-unread');onChange(unreadCount);const total=host.querySelector('[data-unread-total]');if(total)total.textContent=String(unreadCount);}
   catch(err){error=err.message;render();}finally{pendingReads.delete(item.id);}
  }
  function render(){
   if(preferencesGuard?.connected&&(preferencesGuard.dirty||preferencesGuard.busy)){const alert=host.querySelector('.notice-error');if(alert)alert.textContent=error;return;}
   preferencesGuard?.dispose();preferencesGuard=null;
   const icons={all:'notifications',urgent:'health',tasks:'closing',announcements:'announcements',activity:'schedules',system:'systems'};
   host.innerHTML=`<section class="notice-hub" aria-label="Central de notificações">
    <header class="notice-hub-head"><div class="notice-title"><span class="notice-title-icon">${uiIcon('notifications',24)}</span><div><h2>Avisos</h2><p>Não lidos: <span data-unread-total>${unreadCount}</span></p></div></div><div class="notice-header-actions"><button type="button" data-notice-refresh aria-label="Atualizar avisos" title="Atualizar avisos"><svg class="ls-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 4v6h-6M4 20v-6h6M5.5 8a7 7 0 0 1 11.6-3L20 10M4 14l2.9 5A7 7 0 0 0 18.5 16"/></svg></button>${activeDialog?'<button type="button" data-notice-close aria-label="Fechar notificações" title="Fechar"><span aria-hidden="true">×</span></button>':''}</div></header>
    <div class="notice-view-tabs" aria-label="Visualização dos avisos"><button type="button" data-notice-inbox aria-pressed="${!settings}">${uiIcon('notifications',17)}Caixa de entrada</button><button type="button" data-notice-settings aria-label="Preferências de notificações" aria-pressed="${settings}">${uiIcon('permissions',17)}Preferências</button></div>
    <p class="notice-error" role="alert">${e(error)}</p>
    ${settings?renderPreferences():`<div class="notice-filters" role="group" aria-label="Filtrar notificações">${categories.map(([id,label])=>`<button type="button" data-notice-filter="${id}" aria-pressed="${category===id}">${uiIcon(icons[id],16)}${label}</button>`).join('')}</div><div class="notice-inbox-tools"><label class="notice-unread-control"><input type="checkbox" data-notice-unread ${unread?'checked':''}> Apenas não lidos</label><button type="button" data-notice-read-all ${busy||!unreadCount?'disabled':''}>${uiIcon('closing',15)}Marcar como lidos</button></div>
    <div class="notice-list" aria-busy="${busy}">${items.map(item=>`<details class="notice-item ${item.read_at?'':'is-unread'} ${item.priority==='high'?'is-urgent':''}" data-notice-id="${item.id}" ${Number(noticeId)===item.id?'open':''}><summary><span class="notice-item-icon">${uiIcon(icons[item.category]||'notifications',20)}</span><span class="notice-summary"><span class="notice-meta"><span class="notice-type">${e(item.category_label)}</span><time datetime="${e(item.created_at)}">${e(relative(item.created_at))}</time></span><strong>${e(item.title)}</strong><span class="notice-preview">${e(item.message)}</span></span><span class="notice-dot" aria-hidden="true"></span></summary><div class="notice-detail"><p>${e(item.message)}</p><a href="${e(item.url)}">Abrir área ${uiIcon('exit',15)}</a>${item.kind==='urgent_call'?'<small>Confirme sua resposta no chamado da salinha. Ler o aviso não confirma que você está a caminho.</small>':''}</div></details>`).join('')}${!items.length?`<div class="notice-empty" role="status"><span>${uiIcon('notifications',34)}</span><h3>${busy?'Buscando seus avisos…':category!=='all'||unread?'Nenhum aviso neste filtro':'Tudo em dia'}</h3><p>${busy?'Só um instante.':category!=='all'||unread?'Experimente outra categoria ou veja todos os avisos.':'Quando houver uma novidade, ela aparece por aqui.'}</p></div>`:''}</div>${next?`<button type="button" class="notice-load" data-notice-more ${busy?'disabled':''}>${busy?'Carregando…':'Ver avisos anteriores'}</button>`:''}`}
   </section>`;
   host.querySelector('[data-notice-refresh]').onclick=()=>{if(!canLeavePreferences())return;void load();};
   host.querySelector('[data-notice-inbox]').onclick=()=>{if(!canLeavePreferences())return;settings=false;render();};
   host.querySelector('[data-notice-close]')?.addEventListener('click',()=>activeDialog?.close());
   host.querySelector('[data-notice-settings]').onclick=async()=>{if(settings)return;settings=true;host.scrollTop=0;if(settings&&!preferences){try{preferences=await api('/notification-center/preferences');}catch(err){error=err.message;}}render();};
   host.querySelectorAll('[data-notice-filter]').forEach(button=>button.onclick=()=>{category=button.dataset.noticeFilter;noticeId=null;items=[];next=null;void load();});
   host.querySelector('[data-notice-unread]')?.addEventListener('change',event=>{unread=event.target.checked;noticeId=null;items=[];next=null;void load();});
   host.querySelector('[data-notice-more]')?.addEventListener('click',()=>void load(true));
   host.querySelector('[data-notice-read-all]')?.addEventListener('click',async event=>{event.target.disabled=true;try{await api('/notification-center/read-all',{method:'POST'});await load();}catch(err){error=err.message;render();}});
   host.querySelectorAll('[data-notice-id]').forEach(details=>details.addEventListener('toggle',()=>{if(details.open){const item=items.find(item=>item.id===Number(details.dataset.noticeId));void read(item,details);}}));
   host.querySelector('[data-notice-subscribe]')?.addEventListener('click',async event=>{const button=event.target;button.disabled=true;try{await subscribe();button.textContent='Solicitação processada neste aparelho';}catch(err){error=err.message;button.disabled=false;render();}});
   const preferenceForm=host.querySelector('[data-notice-preferences]');
   if(preferenceForm)preferencesGuard=guardForm(preferenceForm,host===activeDialog?activeDialog:null);
   preferenceForm?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]'),guard=preferencesGuard;if(guard?.busy)return;guard?.setBusy(true);button.disabled=true;
    const body={...preferences.settings};for(const key of ['push_enabled','urgent','tasks','announcements','activity','system','quiet_enabled'])body[key]=form.elements[key].checked;
    body.quiet_start=form.elements.quiet_start.value;body.quiet_end=form.elements.quiet_end.value;
    try{const result=await api('/notification-center/preferences',{method:'PUT',body});preferences.settings=result.settings;guard?.complete();form.querySelector('[role=status]').textContent='Preferências salvas.';}
    catch(err){error=err.message;const alert=host.querySelector('.notice-error');if(alert)alert.textContent=error;}finally{guard?.setBusy(false);button.disabled=false;}
   });
  }
  function renderPreferences(){
   if(!preferences)return '<p>Carregando preferências...</p>';
   const p=preferences.settings;
   return `<form data-notice-preferences class="notice-preferences"><label class="notice-switch"><input type="checkbox" name="push_enabled" ${p.push_enabled?'checked':''}><span><strong>Notificações no celular</strong><small>Desativar o push mantém todos os avisos nesta central.</small></span></label><button type="button" data-notice-subscribe>${uiIcon('notifications',17)}Habilitar neste aparelho</button><p class="notice-help">No iPhone, adicione o app à Tela de Início e abra pelo ícone. O sistema controla som, vibração e modo Foco.</p><fieldset><legend>Quais avisos você quer receber?</legend>${preferences.categories.map(c=>`<label class="notice-switch"><input type="checkbox" name="${c.id}" ${p[c.id]?'checked':''}><span>${e(c.label)}${c.id==='urgent'?'<small>Usado para chamados da salinha. Não substitui contato direto em uma emergência.</small>':''}</span></label>`).join('')}</fieldset><fieldset><legend>Horário de silêncio</legend><label class="notice-switch"><input type="checkbox" name="quiet_enabled" ${p.quiet_enabled?'checked':''}><span>Pausar avisos comuns neste horário</span></label><div class="notice-time-grid"><label>Início<input type="time" name="quiet_start" value="${e(p.quiet_start)}" required></label><label>Fim<input type="time" name="quiet_end" value="${e(p.quiet_end)}" required></label></div><small>Horário de Brasília. Chamados da salinha podem chegar durante o silêncio se essa categoria estiver habilitada.</small></fieldset><p role="status" aria-live="polite"></p><button type="submit">Salvar preferências</button></form>`;
  }
  void load();return {refresh:()=>{if(settings||host.querySelector('details[open]')){const button=host.querySelector('[data-notice-refresh]');if(button){button.classList.add('has-updates');button.setAttribute('aria-label','Ver novos avisos');button.title='Ver novos avisos';}return;}return load();}};
 }
 function open({noticeId=null}={}){
  if(activeDialog?.isConnected){activeDialog.focus();return;}
  const dialog=document.createElement('dialog');dialog.className='notice-drawer';dialog.setAttribute('aria-label','Central de notificações');document.body.append(dialog);activeDialog=dialog;
  dialog.addEventListener('close',()=>{dialog.remove();activeDialog=null;},{once:true});dialog.showModal();activeController=mount(dialog,{noticeId});
 }
 return {open,mount,notify:()=>activeController?.refresh()};
}
