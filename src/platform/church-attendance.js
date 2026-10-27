import {guardForm} from '../form-lifecycle.js';
import {uiIcon} from '../ui/icons.js';
import './church-attendance.css';

export function churchAttendanceUI({api,e}){
 const base='/workspace/church-attendance';
 let uid=null,enabled=false,timer=null,busy=false,generation=0,host=null,data=null,lastMessage='',filter='';
 const fmt=x=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(x));
 function message(value,error=false){lastMessage=value;const el=host?.isConnected&&host.querySelector('[data-ca-status]');if(el){el.textContent=value;el.setAttribute('role',error?'alert':'status');}}
 function stop(){generation++;clearTimeout(timer);timer=null;uid=null;enabled=false;busy=false;host=null;lastMessage='';filter='';}
 function locate(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(Error('Este aparelho não oferece localização. Procure a recepção.'));return;}
  navigator.geolocation.getCurrentPosition(resolve,err=>reject(Error(err.code===1?'Localização não autorizada. Libere a permissão ou procure a recepção.':err.code===3?'O GPS demorou a responder. Tente perto de uma janela ou procure a recepção.':'Não foi possível obter sua localização. Tente novamente.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
 });}
 function schedule(){clearTimeout(timer);if(uid&&enabled&&!document.hidden)timer=setTimeout(()=>void automatic(),60000);}
 async function automatic(){
  if(!uid||!enabled||document.hidden||busy)return;
  const gen=generation;busy=true;
  try{
   const info=await api(base);if(gen!==generation)return;
   enabled=info.auto_enabled;
   if(!info.linked_member)return;
   const open=info.items.filter(r=>r.can_checkin&&!r.my_presence);
   if(!enabled||!open.length)return;
   const position=await locate();if(gen!==generation||document.hidden||!enabled)return;
   let issue='';
   for(const row of open){
    if(gen!==generation||!enabled)break;
    try{await api(base+'/'+row.id+'/check-in',{method:'POST',body:{latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,captured_at:position.timestamp}});}catch(err){if(err.code==='location'||err.code==='window'){issue=err.message;continue;}throw err;}
    if(gen!==generation)return;
    message('Presença confirmada em '+row.title+'.');
   }
   if(issue)message(issue,true);
   if(host?.isConnected)await refresh();
  }catch(err){if(gen===generation){message(err.message,true);if(err.status===401){stop();return;}}}
  finally{if(gen===generation){busy=false;schedule();}}
 }
 async function setUser(id){
  if(uid===id)return;stop();if(!id)return;uid=id;const gen=generation;
  try{const info=await api(base);if(gen!==generation)return;enabled=info.auto_enabled;if(enabled)void automatic();}catch{}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(timer);timer=null;}else if(enabled)void automatic();});
 window.addEventListener('pagehide',stop);
 function field(label,name,type='text',value='',extra=''){return `<label>${e(label)}<input name="${name}" type="${type}" value="${e(value)}" required ${extra}></label>`;}
 function localValue(x){const date=new Date(x);return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(date).replace(' ','T');}
 function modal(title,content,submit){
  const d=document.createElement('dialog');d.className='ca-dialog';d.innerHTML=`<form><h2>${e(title)}</h2>${content}<p data-error role="alert"></p><div class="ca-actions"><button type="button" data-close class="secondary">Voltar</button><button type="submit">Salvar</button></div></form>`;
  document.body.append(d);const form=d.querySelector('form');const guard=guardForm(form);
  d.querySelector('[data-close]').onclick=()=>d.close();
  d.addEventListener('close',()=>d.remove(),{once:true});
  form.onsubmit=async ev=>{ev.preventDefault();const button=form.querySelector('[type=submit]');if(button.disabled)return;button.disabled=true;guard.setBusy(true);try{await submit(Object.fromEntries(new FormData(form)),form);guard.complete();d.close();await refresh();}catch(err){form.querySelector('[data-error]').textContent=err.message;}finally{guard.setBusy(false);button.disabled=false;}};
  d.showModal();return d;
 }
 function edit(row){
  const rid=row?.id||crypto.randomUUID();
  modal(row?'Editar culto':'Novo culto',`<div class="ca-fields">${field('Nome do culto','title','text',row?.title||'','maxlength="120"')}${field('Local / endereço','location','text',row?.location||'','maxlength="180"')}${field('Início · horário de Brasília','starts_at','datetime-local',row?localValue(row.starts_at):'')}${field('Fim · horário de Brasília','ends_at','datetime-local',row?localValue(row.ends_at):'')}${field('Latitude do local','latitude','number',row?.latitude??'','step="any" min="-90" max="90"')}${field('Longitude do local','longitude','number',row?.longitude??'','step="any" min="-180" max="180"')}${field('Raio em metros','radius_m','number',row?.radius_m??150,'min="30" max="1000"')}${field('Abrir antes do início · minutos','early_minutes','number',row?Math.round((new Date(row.starts_at)-new Date(row.opens_at))/60000):15,'min="0" max="180"')}${field('Fechar após o início · minutos','late_minutes','number',row?Math.round((new Date(row.closes_at)-new Date(row.starts_at))/60000):30,'min="0" max="480"')}</div><button type="button" class="secondary" data-center>Usar minha posição como local</button><p>Use este botão somente se estiver no local do culto. As coordenadas também podem ser informadas manualmente.</p>`,async f=>{
   const body={...f,request_id:rid,version:row?.version||1};for(const key of ['latitude','longitude','radius_m','early_minutes','late_minutes'])body[key]=Number(body[key]);
   await api(base+(row?'/'+rid:''),{method:row?'PUT':'POST',body});message('Culto salvo.');
  }).querySelector('[data-center]').onclick=async ev=>{const b=ev.currentTarget;b.disabled=true;try{const p=await locate();const f=b.closest('form');f.elements.latitude.value=p.coords.latitude;f.elements.longitude.value=p.coords.longitude;f.dispatchEvent(new Event('input',{bubbles:true}));}catch(err){b.closest('form').querySelector('[data-error]').textContent=err.message;}finally{b.disabled=false;}};
 }
 async function roster(row,page=1){
  const result=await api(base+'/'+row.id+'/presences?page='+page);const d=document.createElement('dialog');d.className='ca-dialog';
  d.innerHTML=`<h2>${e(row.title)}</h2><p>${result.total} presença(s)</p><div class="ca-scroll"><table><thead><tr><th>Membro</th><th>Confirmação</th><th>Horário</th><th></th></tr></thead><tbody>${result.items.map(r=>`<tr><td>${e(r.name)}</td><td>${r.method==='location'?'Localização':'Recepção'}</td><td>${e(fmt(r.checked_at))}</td><td>${data.can_remove_others?`<button type="button" class="secondary" data-remove="${e(r.person_id)}">Remover</button>`:''}</td></tr>`).join('')}</tbody></table></div><p data-error role="alert"></p><div class="ca-actions">${page>1?'<button class="secondary" data-prev>Anterior</button>':''}${result.total>page*50?'<button class="secondary" data-next>Próxima</button>':''}<button data-close>Fechar</button></div>`;
  document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.querySelector('[data-close]').onclick=()=>d.close();
  for(const [key,next] of [['prev',page-1],['next',page+1]]){const b=d.querySelector('[data-'+key+']');if(b)b.onclick=()=>{d.close();void roster(row,next).catch(err=>message(err.message,true));};}
  d.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remover esta presença? O histórico da alteração será preservado.'))return;b.disabled=true;try{await api(base+'/'+row.id+'/presences/'+encodeURIComponent(b.dataset.remove),{method:'DELETE'});d.close();await refresh();await roster(row,page);}catch(err){d.querySelector('[data-error]').textContent=err.message;b.disabled=false;}});d.showModal();
 }
 function manual(row){
  const d=modal('Confirmação pela recepção',`<label>Buscar membro<input data-search minlength="2" placeholder="Digite pelo menos 2 letras"></label><button type="button" class="secondary" data-find>Buscar</button><label>Membro<select aria-label="Membro" name="person_id" required><option value="">Selecione após buscar</option></select></label><label>Motivo da confirmação manual<textarea name="reason" minlength="10" maxlength="300" required placeholder="Ex.: GPS indisponível, conferido na recepção"></textarea></label>`,async f=>{await api(base+'/'+row.id+'/manual',{method:'POST',body:f});message('Presença registrada pela recepção.');});
  d.querySelector('[data-find]').onclick=async ev=>{const b=ev.currentTarget,q=d.querySelector('[data-search]').value.trim();if(q.length<2){d.querySelector('[data-error]').textContent='Digite pelo menos 2 letras.';return;}b.disabled=true;try{const rows=await api(base+'/people/search?q='+encodeURIComponent(q));d.querySelector('select').innerHTML=rows.map(r=>`<option value="${e(r.id)}">${e(r.name)}</option>`).join('');d.querySelector('[data-error]').textContent=rows.length?'':'Nenhum membro encontrado.';}catch(err){d.querySelector('[data-error]').textContent=err.message;}finally{b.disabled=false;}};
 }
 async function refresh(){
  const target=host;if(!target?.isConnected)return;
  const info=await api(base+filter);if(target!==host||!target.isConnected)return;data=info;enabled=info.auto_enabled;
  target.querySelector('[data-ca-auto]').textContent=enabled?'Desativar check-in automático':'Ativar check-in automático';
  target.querySelector('[data-ca-auto]').disabled=!info.linked_member&&!enabled;
  target.querySelector('[data-ca-new]').hidden=!info.manager;
  target.querySelector('[data-ca-list]').innerHTML=info.items.length?info.items.map(r=>`<article class="ca-service"><div><h3>${e(r.title)} ${!r.active?'<small>Cancelado</small>':''}</h3><p>${e(fmt(r.starts_at))} · ${e(r.location)}</p><p>Check-in: ${e(fmt(r.opens_at))} até ${e(fmt(r.closes_at))}</p><strong>${r.my_presence?'Sua presença está confirmada':r.can_checkin?'Check-in aberto':'Fora da janela de check-in'}</strong>${info.manager?`<p>${r.present_count} presença(s) · raio ${r.radius_m} m</p>`:''}</div><div class="ca-actions">${!r.my_presence&&r.can_checkin?`<button data-ca-in="${e(r.id)}">Confirmar minha presença</button>`:''}${r.my_presence?`<button class="secondary" data-ca-own="${e(r.id)}">Remover minha presença</button>`:''}${info.manager?`<button class="secondary" data-ca-roster="${e(r.id)}">Lista de presença</button>${r.active?`<button class="secondary" data-ca-edit="${e(r.id)}">Editar</button><button class="secondary" data-ca-manual="${e(r.id)}">Confirmar membro</button><button class="secondary" data-ca-cancel="${e(r.id)}">Cancelar culto</button>`:''}`:''}</div></article>`).join(''):'<p class="ca-empty">Nenhum culto neste período. A liderança pode cadastrar a programação.</p>';
  target.querySelector('[data-ca-member]').hidden=info.linked_member;
 }
 async function mount(target){
  host=target;target.innerHTML=`<section class="panel ca-panel"><h1>${uiIcon('schedules',28)} Presença nos cultos</h1><p>Confirme sua participação no local e horário do culto.</p><div class="ca-actions"><button data-ca-auto>Carregando…</button><button class="secondary" data-ca-new hidden>Novo culto</button><button class="secondary" data-ca-refresh>Atualizar</button></div><details class="ca-info"><summary>Como funciona o automático</summary><p>Funciona com o app aberto e visível, mediante sua autorização. A localização é consultada na janela do culto e não compõe um histórico de deslocamentos. O GPS é uma estimativa e pode ser impreciso.</p></details><p data-ca-member hidden>Complete e vincule seu cadastro de membro para registrar sua presença. A liderança pode ajudar.</p><form data-ca-filter class="ca-filter"><label>De<input type="date" name="start"></label><label>Até<input type="date" name="end"></label><button type="submit" class="secondary">Filtrar</button></form><p data-ca-status role="status">${e(lastMessage)}</p><div data-ca-list>Carregando cultos…</div></section>`;
  target.querySelector('[data-ca-filter]').onsubmit=ev=>{ev.preventDefault();filter='?'+new URLSearchParams(new FormData(ev.currentTarget));void refresh().catch(err=>message(err.message,true));};
  target.onclick=async ev=>{
   const b=ev.target.closest('button');if(!b||b.closest('[data-ca-filter]')||b.disabled)return;
   const gen=generation;
   try{
    if(b.hasAttribute('data-ca-new')){edit();return;}
    if(b.hasAttribute('data-ca-refresh')){await refresh();return;}
    if(b.hasAttribute('data-ca-auto')){
     b.disabled=true;
     if(!enabled&&!confirm('Autorizar check-in automático enquanto o app estiver aberto? Sua localização será consultada somente durante o horário dos cultos e não será armazenada.'))return;
     const next=!enabled;
     if(next)await locate();if(gen!==generation)return;
     await api(base+'/preferences/automatic',{method:'PATCH',body:{enabled:next}});enabled=next;
     message(next?'Automático ativado. Mantenha o app aberto durante a chegada.':'Automático desativado.');await refresh();if(enabled)void automatic();else clearTimeout(timer);return;
    }
    const id=Object.entries(b.dataset).find(([k])=>k.startsWith('ca')&&b.dataset[k])?.[1];const row=data?.items.find(r=>r.id===id);if(!row)return;
    if(b.hasAttribute('data-ca-edit'))edit(row);
    if(b.hasAttribute('data-ca-roster'))await roster(row);
    if(b.hasAttribute('data-ca-manual'))manual(row);
    if(b.hasAttribute('data-ca-cancel')&&confirm('Cancelar este culto? As presenças já registradas serão preservadas.')){b.disabled=true;await api(base+'/'+id+'?version='+row.version,{method:'DELETE'});await refresh();}
    if(b.hasAttribute('data-ca-own')&&confirm('Remover sua presença deste culto?')){b.disabled=true;await api(base+'/'+id+'/presences/'+encodeURIComponent(data.my_person_id),{method:'DELETE'});await refresh();}
    if(b.hasAttribute('data-ca-in')){b.disabled=true;const p=await locate();if(gen!==generation)return;await api(base+'/'+id+'/check-in',{method:'POST',body:{latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,captured_at:p.timestamp}});message('Sua presença foi confirmada.');await refresh();}
   }catch(err){message(err.message,true);}finally{if(b.isConnected)b.disabled=false;}
  };
  try{await refresh();}catch(err){message(err.message,true);}
 }
 return {mount,setUser,stop};
}
