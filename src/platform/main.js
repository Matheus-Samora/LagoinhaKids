if(location.pathname==='/'&&['overview','children','rooms','attendance','events','lessons','notifications','settings','users','team'].includes(location.hash.slice(1)))location.replace('/kids'+location.hash);
import './style.css';
import {createSectors} from './sectors.js';

const root=document.getElementById('systems');
const names={kids:'Lagoinha Kids',finance:'Lagoinha Finance',members:'Lagoinha Members',ministries:'Lagoinha Ministries'};
const descriptions={
 kids:'Turmas, aulas, chamada com etiqueta de segurança, modo totem, telão e comunicação com as famílias.',
 finance:'Contas, centros de custo, contas a pagar/receber, borderô de culto com dupla conferência, notas fiscais e CSV.',
 members:'Membresia completa, jornada de integração (Visitante a Líder), células/GCs, auto-cadastro e carteirinha digital.',
 ministries:'Integração com os 16 ministérios oficiais, escalas de culto com detecção de conflitos, repertórios e roteiros.'
};
const moduleTags={
 kids:['Chamada & TAG Térmica','Modo Totem','Alerta de Telão'],
 members:['Jornada & Discipulado','Células / GCs','Auto-Cadastro & Carteirinha'],
 ministries:['16 Ministérios','Escalas sem Conflito','Repertórios & Roteiros'],
 finance:['Centros de Custo','Borderô de Culto','Contas a Pagar & CSV']
};
const brandMeta={
 systems:{word:'systems',tagline:'GOVERNANÇA & TECNOLOGIA TI'},
 access:{word:'systems',tagline:'PORTAL DE ACESSOS INTEGRADOS'},
 kids:{word:'kids',tagline:'CUIDADO QUE CONECTA'},
 members:{word:'members',tagline:'MEMBRESIA & COMUNHÃO FAMILIAR'},
 ministries:{word:'ministries',tagline:'CADA DOM A SERVIÇO DO REINO'},
 finance:{word:'finance',tagline:'MORDOMIA, TRANSPARÊNCIA E GESTÃO'}
};
const MINISTRY_CATALOG=['Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link Future','Gourmet','Champions','DNA','Sonoplastia'];
const roleNames={admin:'Administrador',teacher:'Professor(a)',parent:'Responsável',editor:'Colaborador',viewer:'Consulta'};
let csrf='',identity=null,users=[],userSearch='',auditData=null;
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=name=>String(name||'L').trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('')||'L';

function currentAreaKey(){
 const p=location.pathname.split('/')[1];
 return brandMeta[p]?p:'systems';
}

function getSavedAccounts(){
 try{return JSON.parse(localStorage.getItem('kids_saved_accounts')||'[]');}catch{return [];}
}
function saveAccount(user){
 if(!user?.email)return;
 try{
  const list=getSavedAccounts().filter(a=>a.email!==user.email);
  list.unshift({name:user.name,email:user.email,role:user.role});
  localStorage.setItem('kids_saved_accounts',JSON.stringify(list.slice(0,5)));
 }catch{}
}
function removeSavedAccount(email){
 try{
  const list=getSavedAccounts().filter(a=>a.email!==email);
  localStorage.setItem('kids_saved_accounts',JSON.stringify(list));
 }catch{}
}

function welcome(areaKey=currentAreaKey()){
 const meta=brandMeta[areaKey]||brandMeta.systems;
 root.innerHTML=`<div class="welcome-screen" aria-label="Lagoinha ${e(meta.word)}"><div class="welcome-logo-wrap"><img src="/logo.png" alt="Logo Lagoinha"/></div><div class="welcome-text"><strong>lagoinha ${e(meta.word)}</strong><small>${e(meta.tagline)}</small></div></div>`;
 return new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:550));
}

async function api(path,options={}){
 const response=await fetch('/api'+path,{credentials:'same-origin',...options,headers:{...(!options.raw?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers},body:options.raw?options.body:(options.body?JSON.stringify(options.body):undefined)});
 const data=await response.json();if(!response.ok)throw new Error(data.detail?.message||'Não foi possível concluir. Tente novamente.');return data;
}

const sectors=createSectors({api,e,identity:()=>identity});

const brand=(areaKey=currentAreaKey())=>{
 const meta=brandMeta[areaKey]||brandMeta.systems;
 return `<a class="brand" href="${identity&&!identity.platform_admin?'/access':'/systems'}"><img src="/logo.png" alt=""><div class="brand-text"><span>lagoinha <strong>${e(meta.word)}</strong></span><small>${e(meta.tagline)}</small></div></a>`;
};

function authBrand(areaKey=currentAreaKey()){
 const meta=brandMeta[areaKey]||brandMeta.systems;
 return `<div class="auth-brand"><div class="auth-logo-badge"><img src="/logo.png" alt="Lagoinha" class="auth-logo-img"/></div><div class="auth-brand-text"><span class="auth-brand-name">lagoinha <strong>${e(meta.word)}</strong></span><span class="auth-brand-tagline">${e(meta.tagline)}</span></div></div>`;
}

function login(message='',prefillEmail=''){
 const areaKey=currentAreaKey();
 const saved=getSavedAccounts();
 const savedHtml=saved.length?`<div class="saved-accounts-card"><div class="saved-accounts-head"><span>Acessos neste dispositivo</span><small>Toque para entrar</small></div><div class="saved-accounts-chips">${saved.map(a=>`<div class="saved-account-chip"><button type="button" class="saved-account-main" data-saved-email="${e(a.email)}"><span class="avatar mini">${e(initials(a.name||a.email))}</span><div class="saved-account-text"><strong>${e(a.name||a.email)}</strong><small>${e(a.email)}</small></div></button><button type="button" class="saved-account-del" data-remove-email="${e(a.email)}" title="Remover conta deste aparelho" aria-label="Remover">✕</button></div>`).join('')}</div></div>`:'';

 root.innerHTML=`<main class="auth-screen"><section class="auth-card">${authBrand(areaKey)}<h1>Bem-vindo</h1><p class="auth-subtitle">Entre para acessar os sistemas e setores autorizados para você.</p>${savedHtml}<form id="login"><label>E-mail<input name="email" id="login-email" type="email" autocomplete="username" required maxlength="200" value="${e(prefillEmail)}"></label><label>Senha<div class="password-field"><input name="password" id="login-password" type="password" autocomplete="current-password" required maxlength="128"><button type="button" id="toggle-pwd" aria-label="Mostrar senha">Ver</button></div></label><label>Código do autenticador <small>Se você ativou a verificação em duas etapas</small><input name="otp" autocomplete="one-time-code" maxlength="40"></label><p role="alert" class="error">${e(message)}</p><button type="submit">Entrar</button></form><div class="auth-sector-pills"><span class="auth-sector-pill">🧒 Kids</span><span class="auth-sector-pill">👥 Members</span><span class="auth-sector-pill">✦ Ministries</span><span class="auth-sector-pill">💼 Finance</span></div><footer class="auth-footer"><a class="subtle" href="/kids">Acesso e cadastro das famílias no Lagoinha Kids →</a></footer></section></main>`;

 root.querySelector('#toggle-pwd')?.addEventListener('click',ev=>{
  const inp=root.querySelector('#login-password');
  if(!inp)return;
  inp.type=inp.type==='password'?'text':'password';
  ev.currentTarget.textContent=inp.type==='password'?'Ver':'Ocultar';
 });

 root.querySelectorAll('[data-saved-email]').forEach(btn=>btn.addEventListener('click',()=>{
  const email=btn.dataset.savedEmail;
  const inp=root.querySelector('#login-email'),pwd=root.querySelector('#login-password');
  if(inp){inp.value=email;pwd?.focus();}
 }));

 root.querySelectorAll('[data-remove-email]').forEach(btn=>btn.addEventListener('click',()=>{
  removeSavedAccount(btn.dataset.removeEmail);
  login('',root.querySelector('#login-email')?.value||'');
 }));

 root.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('button[type="submit"]');
  const errEl=form.querySelector('.error');
  if(errEl)errEl.textContent='';
  button.disabled=true;
  const origText=button.innerHTML;
  button.innerHTML='<span class="spin">●</span> Aguarde...';
  try{
   const r=await api('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(form))});
   csrf=r.csrf;
   if(r.user)saveAccount(r.user);
   await welcome(currentAreaKey());
   await load();
  }catch(error){
   errEl.textContent=error.message;
   button.disabled=false;
   button.innerHTML=origText;
   form.classList.remove('shake');
   void form.offsetWidth;
   form.classList.add('shake');
  }
 });
}

async function load(){
 identity=await api('/platform/me');
 if(identity?.user)saveAccount(identity.user);
 const path=location.pathname.split('/')[1];
 if(!identity.platform_admin&&(!path||path==='systems')){location.replace('/access');return;}
 if(identity.platform_admin&&(!path||path==='systems'))users=await api('/platform/users');
 render();
}

function statCard(label,value,helper,symbol){
 return `<article class="stat"><div><span>${label}</span><strong>${value}</strong><small>${helper}</small></div><span class="stat-icon" aria-hidden="true">${symbol}</span></article>`;
}

function portalHero(module){
 const firstName=e((identity?.user?.name||'Olá').split(' ')[0]);
 if(module)return '';
 if(identity.platform_admin){
  const totalGrants=users.reduce((acc,u)=>acc+(u.grants||[]).filter(g=>g.enabled).length,0);
  const totalAdmins=users.filter(u=>u.platform_admin).length;
  return `<section class="welcome theme-systems"><div><span class="pill">🛡️ ADMINISTRAÇÃO CENTRAL DE TI</span><h1>Olá, ${firstName}.<br>Governança e setores em <em>harmonia.</em></h1><p>Gerencie identidades globais, libere permissões granulares por ministério, audite eventos de segurança e exporte backups de governança.</p><div class="welcome-actions"><a class="button" href="#permissions-section">Gerenciar usuários e permissões ↓</a><a class="button ghost" href="/api/platform/backup" download="lagoinha-systems-backup.json">📥 Exportar Backup JSON</a><a class="button ghost" href="/kids">Abrir Lagoinha Kids →</a></div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>
  <div class="stats">
   ${statCard('Usuários cadastrados',users.length,'Contas únicas na plataforma','👥')}
   ${statCard('Sistemas integrados',identity.modules.length,'Kids, Members, Ministries e Finance','⚡')}
   ${statCard('Acessos concedidos',totalGrants,'Permissões ativas por setor','🔑')}
   ${statCard('Administradores TI',totalAdmins,'Governança global do sistema','🛡️')}
  </div>`;
 }
 const enabledCount=identity.modules.filter(m=>m.enabled).length;
 return `<section class="welcome theme-systems"><div><span class="pill">✦ MEUS ESPAÇOS AUTORIZADOS</span><h1>Olá, ${firstName}.<br>Seus sistemas em <em>um só lugar.</em></h1><p>Escolha abaixo o setor em que deseja trabalhar hoje. Todas as operações são protegidas de acordo com o seu perfil.</p></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>
 <div class="stats">
  ${statCard('Setores liberados',enabledCount,`De ${identity.modules.length} módulos da plataforma`,'🔓')}
  ${statCard('Conta autenticada',e(identity.user.name.split(' ')[0]),e(identity.user.email),'👤')}
  ${statCard('Segurança ativa','Verificada','Permissões validadas por requisição','🛡️')}
  ${statCard('Acesso rápido','1 clique','Alterne entre os setores no topo','⚡')}
 </div>`;
}

function render(message=''){
 const selected=location.pathname.split('/')[1]||identity.active_module;
 const module=identity.modules.find(m=>m.id===selected);
 const areaKey=module?module.id:(identity.platform_admin?'systems':'access');
 const navLinks=identity.modules.filter(m=>m.enabled).map(m=>`<a class="topbar-sector-link ${module?.id===m.id?'active':''}" href="${m.url}">${e(m.name.replace('Lagoinha ',''))}</a>`).join('');

 root.innerHTML=`<header class="platform-topbar">${brand(areaKey)}<nav class="topbar-nav-pills" aria-label="Atalhos dos setores"><a class="topbar-sector-link ${!module?'active':''}" href="${identity.platform_admin?'/systems':'/access'}">${identity.platform_admin?'Painel TI':'Meus acessos'}</a>${navLinks}</nav><div class="topbar-user-area"><div class="topbar-user-chip"><span class="avatar mini">${e(initials(identity.user.name))}</span><span>${e(identity.user.name)}</span></div><button class="quiet" id="logout">Sair</button></div></header><main class="workspace page-enter">${!module?portalHero(module):`<section class="intro"><span class="eyebrow">${identity.platform_admin?'ADMINISTRAÇÃO CENTRAL':'SEU ESPAÇO'}</span><h1>${e(module.name)}</h1><p>${e(descriptions[module.id])}</p></section>`}<p class="status" role="status">${e(message)}</p>${module?moduleView(module):`<div class="section-title" style="margin-bottom:16px;"><h2>Sistemas e Setores da Igreja</h2><span class="subtle">Toque em Abrir área para entrar no módulo desejado</span></div><section class="grid" aria-label="Sistemas disponíveis">${identity.modules.map(card).join('')}</section>`}${identity.platform_admin&&!module&&selected!=='access'?permissions()+auditSection():''}</main><footer class="platform-footer">Lagoinha Systems · Cuidado, organização e conexão entre todos os setores.</footer>`;

 if(module?.enabled&&module.id!=='kids')void sectors.mount(module);
 root.querySelector('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});identity=null;csrf='';users=[];await welcome('systems');login();}catch(error){render(error.message);}};

 root.querySelector('#user-filter-input')?.addEventListener('input',ev=>{
  userSearch=ev.currentTarget.value;
  const pos=ev.currentTarget.selectionStart;
  render(message);
  const input=root.querySelector('#user-filter-input');
  if(input){input.focus();try{input.setSelectionRange(pos,pos);}catch{}}
 });

 root.querySelector('#create-identity')?.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;const b=form.querySelector('button');b.disabled=true;
  try{const r=await api('/platform/users',{method:'POST',body:Object.fromEntries(new FormData(form))});await load();root.querySelector('.status').textContent=r.message;}catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{b.disabled=false;}
 });

 root.querySelectorAll('[data-grant]').forEach(form=>form.addEventListener('submit',async event=>{
  event.preventDefault();const b=form.querySelector('button');b.disabled=true;const d=new FormData(form);
  try{
   await api(`/platform/users/${form.dataset.user}/modules/${form.dataset.grant}`,{method:'PUT',body:{role:d.get('role'),enabled:d.get('enabled')==='on',scope:d.get('scope')||''}});
   await load();root.querySelector('.status').textContent='Permissão atualizada. O servidor já aplica o novo acesso.';
  }catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{b.disabled=false;}
 }));

 root.querySelectorAll('[data-user-patch]').forEach(btn=>btn.addEventListener('click',async()=>{
  const uid=btn.dataset.uid,kind=btn.dataset.userPatch;
  btn.disabled=true;
  try{
   if(kind==='toggle-active'){
    const active=btn.dataset.active==='true';
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{active:!active}});
    await load();root.querySelector('.status').textContent=!active?'Conta reativada com sucesso.':'Conta bloqueada e sessões encerradas.';
   }else if(kind==='toggle-admin'){
    const isAdmin=btn.dataset.admin==='true';
    if(!confirm(isAdmin?'Remover privilégio de Administrador Central de TI deste usuário?':'Conceder privilégio total de Administrador Central de TI a este usuário?')){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{platform_admin:!isAdmin}});
    await load();root.querySelector('.status').textContent='Privilégio de administração central atualizado.';
   }else if(kind==='reset-pwd'){
    const pwd=prompt('Informe a nova senha temporária para este usuário (mínimo de 12 caracteres):');
    if(!pwd){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{password:pwd}});
    await load();root.querySelector('.status').textContent='Senha redefinida e sessões anteriores revogadas.';
   }
  }catch(error){root.querySelector('.status').textContent=error.message;btn.disabled=false;}
 }));

 root.querySelector('#load-global-audit')?.addEventListener('click',async ev=>{
  const b=ev.currentTarget;b.disabled=true;b.textContent='Carregando auditoria...';
  try{
   auditData=await api('/platform/audit');
   render('Trilha de auditoria global carregada.');
  }catch(error){root.querySelector('.status').textContent=error.message;b.disabled=false;b.textContent='🔍 Carregar Trilha de Auditoria';}
 });
}

function card(m){
 const icons={kids:'🧒',finance:'💼',members:'👥',ministries:'✦'};
 const tags=(moduleTags[m.id]||[]).map(t=>`<span class="card-tag">${e(t)}</span>`).join('');
 const roleLabel=m.role?` · ${roleNames[m.role]||m.role}`:'';
 const scopeLabel=m.scope?` (${m.scope})`:'';
 return `<article class="card ${m.enabled?'':'locked'}" data-module="${e(m.id)}"><span class="module-icon" aria-hidden="true">${icons[m.id]||'✦'}</span><span class="badge">${m.enabled?(m.status==='operational'?`🟢 Disponível${e(roleLabel)}${e(scopeLabel)}`:'Em desenvolvimento'):'🔒 Acesso não autorizado'}</span><h2>${e(m.name)}</h2><p>${e(descriptions[m.id])}</p><div class="card-tags">${tags}</div>${m.enabled?`<a class="button" href="${m.url}">${m.id==='kids'?'Abrir Kids →':'Abrir área →'}</a>`:'<p class="subtle">Solicite liberação de acesso à administração de TI.</p>'}</article>`;
}

function moduleView(m){if(!m.enabled)return `<section class="panel"><h2>Acesso não autorizado</h2><p>Solicite acesso ao responsável de TI.</p><a class="button secondary" href="/access">Meus acessos</a></section>`;return '<div id="sector-content"><p>Carregando registros…</p></div>';}

function permissions(){
 const filteredUsers=users.filter(u=>!userSearch||(u.name+' '+u.email).toLowerCase().includes(userSearch.toLowerCase()));
 return `<section class="permissions" id="permissions-section"><div class="permissions-header"><div><h2>Usuários, ciclo de vida e permissões por setor</h2><p style="margin:4px 0 0;">Defina quais sistemas cada pessoa pode acessar, delegue coordenação por ministério ou gerencie bloqueio e senha.</p></div><label style="min-width:260px;font-size:13px;font-weight:600;">Filtrar usuário<input id="user-filter-input" value="${e(userSearch)}" placeholder="Nome ou e-mail..." maxlength="100"></label></div><details class="panel"><summary><strong>+ Novo usuário central</strong><span>Crie uma identidade e escolha os módulos permitidos</span></summary><form id="create-identity" class="create-identity"><label>Nome<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label><label>Senha inicial<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><p class="subtle">Nenhum sistema é liberado automaticamente. Defina os acessos após o cadastro.</p><p class="error" role="alert"></p><button>Criar usuário</button></form></details>${filteredUsers.map(u=>`<details class="panel"><summary><span class="avatar mini">${e(initials(u.name))}</span><strong>${e(u.name)}</strong><span>${e(u.email)}</span>${!u.active?'<span class="badge" style="background:#fee2e2;color:#991b1b;">🔴 Bloqueado</span>':''}${u.platform_admin?'<span class="badge">🛡️ Administrador central</span>':`<span class="badge">${(u.grants||[]).filter(g=>g.enabled).length} sistema(s) ativo(s)</span>`}</summary><div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:8px;"><button type="button" class="secondary" data-user-patch="reset-pwd" data-uid="${u.id}">🔑 Redefinir senha</button>${u.id!==identity.user.id?`<button type="button" class="secondary" data-user-patch="toggle-active" data-uid="${u.id}" data-active="${u.active}">${u.active?'🔒 Bloquear conta':'🔓 Reativar conta'}</button><button type="button" class="secondary" data-user-patch="toggle-admin" data-uid="${u.id}" data-admin="${u.platform_admin}">${u.platform_admin?'Remover Admin Central':'🛡️ Tornar Admin Central'}</button>`:'<span class="subtle" style="align-self:center;">Sua própria conta administrativa</span>'}</div>${u.platform_admin?'<p>Acesso administrativo total a todos os sistemas e configurações de TI. A função central é separada dos administradores de cada módulo.</p>':Object.entries(names).map(([id,name])=>{const g=u.grants.find(g=>g.module===id);const roles=id==='kids'?['admin','teacher','parent']:['admin','editor','viewer'];const scopeSelect=id==='ministries'?`<label>Escopo Ministerial (opcional)<select name="scope"><option value="">Todos os 16 ministérios</option>${MINISTRY_CATALOG.map(m=>`<option value="${e(m)}" ${g?.scope===m?'selected':''}>Somente ${e(m)}</option>`).join('')}</select></label>`:'';return `<form class="grant" data-user="${u.id}" data-grant="${id}" style="${id==='ministries'?'grid-template-columns:minmax(160px,1.2fr) minmax(150px,1fr) minmax(180px,1fr) auto;':''}"><label class="check"><input name="enabled" type="checkbox" ${g?.enabled?'checked':''}>${e(name)}</label><label>Perfil<select name="role">${roles.map(role=>`<option value="${role}" ${role===(g?.role||(id==='kids'?'parent':'viewer'))?'selected':''}>${roleNames[role]}</option>`).join('')}</select></label>${scopeSelect}<button>Salvar acesso</button><p role="alert" class="error"></p></form>`;}).join('')}</details>`).join('')}</section>`;
}

function auditSection(){
 return `<section class="panel" style="margin-top:28px;">
  <div class="section-title">
   <div>
    <h2>🛡️ Auditoria Global de Segurança &amp; Governança</h2>
    <p style="margin:4px 0 0;">Acompanhe logins, concessões de acesso, alterações em módulos e exporte snapshots de governança.</p>
   </div>
   <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button type="button" class="secondary" id="load-global-audit">${auditData?'🔄 Atualizar Auditoria':'🔍 Carregar Trilha de Auditoria'}</button>
    <a class="button secondary" href="/api/platform/backup" download="lagoinha-systems-backup.json">📥 Baixar Backup JSON</a>
   </div>
  </div>
  ${auditData?`<div class="sector-insights-grid" style="margin-top:16px;margin-bottom:0;">
   <div class="insight-card">
    <div class="insight-head"><h3>🔐 Eventos de Autenticação &amp; Acessos</h3><span class="badge">${(auditData.security_logs||[]).length} recentes</span></div>
    <div class="insight-list" style="max-height:300px;overflow-y:auto;">
     ${(auditData.security_logs||[]).slice(0,25).map(l=>`<div class="insight-item"><div><strong>${e(l.action)}</strong><small>${e(l.actor_name)} (${e(l.actor_email||'sistema')})</small></div><small>${e(new Date(l.created_at).toLocaleString('pt-BR'))}</small></div>`).join('')}
    </div>
   </div>
   <div class="insight-card">
    <div class="insight-head"><h3>📋 Alterações nos Setores (Members, Ministries, Finance)</h3><span class="badge">${(auditData.module_logs||[]).length} recentes</span></div>
    <div class="insight-list" style="max-height:300px;overflow-y:auto;">
     ${(auditData.module_logs||[]).slice(0,25).map(l=>`<div class="insight-item"><div><strong>[${e(l.module.toUpperCase())}] ${e(l.action)}</strong><small>Por ${e(l.actor_name)} · ID ${e(String(l.record_id).slice(0,8))}</small></div><small>${e(new Date(l.created_at).toLocaleString('pt-BR'))}</small></div>`).join('')||'<p class="subtle">Nenhuma alteração registrada nos setores ainda.</p>'}
    </div>
   </div>
  </div>`:''}
 </section>`;
}

await welcome(currentAreaKey());
try{const me=await api('/me');csrf=me.csrf;await load();}catch{login();}

if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
