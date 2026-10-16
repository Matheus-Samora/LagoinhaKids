if(location.pathname==='/'&&['overview','children','rooms','attendance','events','lessons','notifications','settings','users','team'].includes(location.hash.slice(1)))location.replace('/kids'+location.hash);
import './style.css';
import {createSectors} from './sectors.js';
import {sectorEmblem,ministryEmblem,MINISTRY_META,openAppDownloadQrModal} from './emblems.js';

const root=document.getElementById('systems');
const names={kids:'Lagoinha Kids',finance:'Lagoinha Finance',members:'Lagoinha Members',ministries:'Lagoinha Ministries'};
const descriptions={
 kids:'Turmas, aulas, chamada via carteirinha digital (QR Code) e etiqueta de segurança, modo totem, telão e comunicação com as famílias.',
 finance:'Motor de previsão financeira (30/60/90d), pré-processamento bancário, centros de custo, borderô de culto e relatórios multi-formato (Excel/CSV/PDF).',
 members:'Membresia criptografada, jornada de integração, 8 GCs oficiais com banners reais, auto-cadastro e credencial digital.',
 ministries:'Integração com os 17 ministérios oficiais (Link e Future separados, Champions, Music), construtor de escala de Louvor por instrumento e aprovação de candidatos.'
};
const moduleTags={
 kids:['Carteirinha QR Code','TAG Térmica','Alerta de Telão'],
 members:['8 GCs Oficiais com Arte','Jornada & Discipulado','Dados Criptografados'],
 ministries:['17 Ministérios Oficiais','Escala de Louvor por Função','Candidaturas & Alertas'],
 finance:['Previsão 30/60/90d','Relatórios Excel & PDF','Borderô Dupla Conferência']
};
const brandMeta={
 systems:{word:'systems',tagline:'GOVERNANÇA, SEGURANÇA & TI'},
 access:{word:'membro',tagline:'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS'},
 membro:{word:'membro',tagline:'ÁREA DE MEMBROS · ACESSOS, GCs & MINISTÉRIOS'},
 kids:{word:'kids',tagline:'CUIDADO QUE CONECTA'},
 members:{word:'members',tagline:'MEMBRESIA & COMUNHÃO EM GCs'},
 ministries:{word:'ministries',tagline:'CADA DOM A SERVIÇO DO REINO'},
 finance:{word:'finance',tagline:'MOTOR FINANCEIRO, PREVISÕES & GESTÃO'}
};
const MINISTRY_CATALOG=['Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link','Future','Gourmet','Champions','DNA','Sonoplastia'];
const roleNames={admin:'Administrador',pastor:'Pastor / Pastora',teacher:'Professor(a)',parent:'Responsável',editor:'Colaborador',viewer:'Consulta'};
let csrf='',identity=null,communityData=null,users=[],userSearch='',auditData=null,notifDrawerOpen=false;
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

const sectors=createSectors({api,e,identity:()=>identity,openQrModal:()=>openAppDownloadQrModal()});

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

 root.innerHTML=`<main class="auth-screen"><section class="auth-card">${authBrand(areaKey)}<h1>Bem-vindo</h1><p class="auth-subtitle">Entre para acessar suas áreas liberadas, GCs e Ministérios da Lagoinha.</p>${savedHtml}<form id="login"><label>E-mail<input name="email" id="login-email" type="email" autocomplete="username" required maxlength="200" value="${e(prefillEmail)}"></label><label>Senha<div class="password-field"><input name="password" id="login-password" type="password" autocomplete="current-password" required maxlength="128"><button type="button" id="toggle-pwd" aria-label="Mostrar senha">Ver</button></div></label><label>Código do autenticador <small>Se você ativou a verificação em duas etapas</small><input name="otp" autocomplete="one-time-code" maxlength="40"></label><p role="alert" class="error">${e(message)}</p><button type="submit">Entrar no Sistema</button></form><div class="auth-sector-pills"><span class="auth-sector-pill">🧒 Kids</span><span class="auth-sector-pill">👥 Members &amp; GCs</span><span class="auth-sector-pill">✦ 17 Ministérios</span><span class="auth-sector-pill">💼 Finance</span></div><div style="display:flex;justify-content:center;margin-top:10px;"><button type="button" class="secondary" id="auth-qr-btn" style="font-size:12px;min-height:36px;padding:6px 14px;">📱 QR Code · Baixar App Mobile</button></div><footer class="auth-footer"><a class="subtle" href="/kids">Cadastro de Membros e Famílias (Lagoinha Kids) →</a></footer></section></main>`;

 root.querySelector('#auth-qr-btn')?.addEventListener('click',()=>openAppDownloadQrModal());
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
  button.innerHTML='<span class="spin">●</span> Autenticando...';
  try{
   const r=await api('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(form))});
   csrf=r.csrf;
   if(r.user)saveAccount(r.user);
   sessionStorage.removeItem('lagoinha_login_redirected');
   await welcome(currentAreaKey());
   await load(true);
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

async function load(justLoggedIn=false){
 identity=await api('/platform/me');
 if(identity?.user)saveAccount(identity.user);
 try{communityData=await api('/platform/community');}catch{communityData={cells:[],ministries:[],my_applications:[],notifications:[]};}
 const path=location.pathname.split('/')[1];

 // Smart login redirect: send user directly to their permitted sector if they just logged in on root/systems
 if(!identity.platform_admin){
  const enabledNonKids=identity.modules.filter(m=>m.enabled&&m.id!=='kids'&&['admin','pastor','editor'].includes(m.role));
  if(justLoggedIn&&enabledNonKids.length===1&&(!path||path==='systems')){
   location.replace(enabledNonKids[0].url);
   return;
  }
  if(!path||path==='systems'){
   location.replace('/access');
   return;
  }
 }
 if(identity.platform_admin&&(!path||path==='systems'))users=await api('/platform/users');
 render();
}

function statCard(label,value,helper,symbol){
 return `<article class="stat"><div><span>${label}</span><strong>${value}</strong><small>${helper}</small></div><span class="stat-icon" aria-hidden="true">${symbol}</span></article>`;
}

function portalHero(module,selected){
 const firstName=e((identity?.user?.name||'Olá').split(' ')[0]);
 if(module)return '';
 if(identity.platform_admin&&selected!=='access'&&selected!=='membro'){
  const totalGrants=users.reduce((acc,u)=>acc+(u.grants||[]).filter(g=>g.enabled).length,0);
  const totalAdmins=users.filter(u=>u.platform_admin).length;
  const totalPastors=users.filter(u=>u.pastor).length;
  return `<section class="welcome theme-systems"><div><span class="pill">🛡️ ADMINISTRAÇÃO CENTRAL DE TI · CRIPTOGRAFIA ATIVA</span><h1>Olá, ${firstName}.<br>Governança, Segurança e <em>Comunhão.</em></h1><p>Gerencie identidades globais, conceda o cargo Pastor/Pastora ou libere permissões restritas por setor e ministério.</p><div class="welcome-actions"><a class="button" href="#permissions-section">Gerenciar usuários e permissões ↓</a><a class="button ghost" href="/membro">🌟 Ver Portal do Membro (GCs &amp; Ministérios)</a><button type="button" class="button ghost" data-open-qr="1">📱 QR Code do App</button><a class="button ghost" href="/api/platform/backup" download="lagoinha-systems-backup.json">📥 Backup JSON</a></div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>
  <div class="stats">
   ${statCard('Usuários cadastrados',users.length,`${totalPastors} Pastor(a) · ${totalAdmins} Admin TI`,'👥')}
   ${statCard('Sistemas integrados',identity.modules.length,'Kids, Members, Ministries e Finance','⚡')}
   ${statCard('Acessos concedidos',totalGrants,'Isolamento estrito por usuário','🔑')}
   ${statCard('Segurança de Dados','AES-128','Criptografia Fernet + HMAC-SHA256','🔒')}
  </div>`;
 }
 const enabledModules=identity.modules.filter(m=>m.enabled);
 const roleBadge=identity.pastor?'👑 ACESSO PASTORAL GLOBAL (TODOS OS SETORES)':'✦ PORTAL DO MEMBRO & SETORES AUTORIZADOS';
 return `<section class="welcome theme-members"><div><span class="pill">${roleBadge}</span><h1>Olá, ${firstName}.<br>Bem-vindo à sua <em>Área de Membros.</em></h1><p>Acesse abaixo exclusivamente os setores liberados para o seu perfil, inscreva-se em um dos <strong>8 GCs oficiais</strong> pelos banners ou candidate-se para servir nos <strong>17 Ministérios</strong> da Lagoinha.</p><div class="welcome-actions"><a class="button" href="#gc-showcase-section">🏠 Ver Banners dos GCs ↓</a><a class="button ghost" href="#ministry-showcase-section">✦ Candidatar-se a um Ministério ↓</a><button type="button" class="button ghost" data-open-qr="1">📱 Baixar App (QR Code)</button></div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>
 <div class="stats">
  ${statCard('Minhas Áreas Liberadas',enabledModules.length,identity.pastor?'Acesso Pastoral completo':'Setores autorizados para você','🔓')}
  ${statCard('GCs Oficiais Ativos',(communityData?.cells||[]).length,'Escolha o GC mais próximo de você','🏠')}
  ${statCard('Ministérios Oficiais',MINISTRY_CATALOG.length,'Candidate-se para servir com seus dons','✦')}
  ${statCard('Minhas Solicitações',(communityData?.my_applications||[]).length,'Acompanhamento de GCs e Ministérios','📨')}
 </div>`;
}

function notificationsBanner(){
 const notifs=identity?.notifications||[];
 const unread=notifs.filter(n=>!n.read_at);
 if(!unread.length&&!notifDrawerOpen)return '';
 return `<section class="panel notif-panel" style="margin-bottom:22px;border-color:#4338ca;background:linear-gradient(135deg,#eef2ff,#ffffff);">
  <div class="section-title" style="margin-bottom:10px;">
   <div>
    <h2 style="font-size:17px;color:#312e81;">🔔 Central de Notificações &amp; Candidaturas (${unread.length} nova${unread.length===1?'':'s'})</h2>
    <p style="margin:2px 0 0;font-size:13px;color:#4338ca;">Avisos de novos candidatos aos seus Ministérios/GCs e confirmações da liderança.</p>
   </div>
   ${unread.length?`<button type="button" class="secondary" id="mark-all-notifs-read" style="min-height:36px;padding:6px 12px;font-size:12px;">✓ Marcar todas como lidas</button>`:''}
  </div>
  <div class="insight-list" style="max-height:240px;overflow-y:auto;">
   ${notifs.slice(0,12).map(n=>`<div class="insight-item" style="${n.read_at?'opacity:0.75;':'border-left:4px solid #4338ca;background:#fff;'}">
    <div>
     <strong>${e(n.title)}</strong>
     <small style="color:#3f3f46;font-size:12.5px;">${e(n.message)}</small>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
     <small>${e(new Date(n.created_at).toLocaleDateString('pt-BR'))}</small>
     ${!n.read_at?`<button type="button" class="secondary" data-read-notif="${n.id}" style="min-height:30px;padding:4px 10px;font-size:11px;">Lida</button>`:'<span class="badge">Lida</span>'}
    </div>
   </div>`).join('')||'<p class="subtle">Nenhuma notificação até o momento.</p>'}
  </div>
 </section>`;
}

function memberCommunityPortal(){
 const cells=communityData?.cells||[];
 const mins=communityData?.ministries||MINISTRY_CATALOG.map(name=>({name,total:0,leaders:0}));
 const myApps=communityData?.my_applications||[];

 const myAppsHtml=myApps.length?`<section class="panel" style="margin-top:26px;">
  <div class="section-title">
   <div>
    <h2>📨 Minhas Solicitações de Entrada (GCs &amp; Ministérios)</h2>
    <p style="margin:4px 0 0;">Acompanhe seus pedidos enviados aos líderes responsáveis de cada setor.</p>
   </div>
  </div>
  <div class="insight-list">
   ${myApps.map(a=>`<div class="insight-item">
    <div>
     <strong>${a.target_type==='gc'?'🏠 GC: ':'✦ Ministério: '}${e(a.target_name)}</strong>
     <small>Função: ${e(a.role_desired||'Participante')} · Enviado em ${e(new Date(a.created_at).toLocaleDateString('pt-BR'))}</small>
    </div>
    <span class="badge" style="${a.status==='approved'?'background:#dcfce7;color:#166534;':a.status==='rejected'?'background:#fee2e2;color:#991b1b;':'background:#fef3c7;color:#92400e;'}">
     ${a.status==='approved'?'🟢 Aprovado e Integrado':a.status==='rejected'?'🔴 Encerrado':'⏳ Aguardando Contato do Líder'}
    </span>
   </div>`).join('')}
  </div>
 </section>`:'';

 return `${myAppsHtml}
 <section id="gc-showcase-section" style="margin-top:34px;">
  <div class="section-title" style="margin-bottom:18px;">
   <div>
    <span class="eyebrow" style="color:#0f766e;">COMUNHÃO NAS CASAS · GRUPOS DE CRESCIMENTO</span>
    <h2>🏠 Escolha seu GC pelos Banners Oficiais (${cells.length} GCs Ativos)</h2>
    <p style="margin:4px 0 0;color:#52525b;">Confira a arte, o endereço e o dia de encontro de cada GC. Toque em <strong>Participar deste GC</strong> para avisar o líder!</p>
   </div>
  </div>
  <div class="gc-showcase-grid">
   ${cells.map(gc=>{
    const alreadyPending=myApps.some(a=>a.target_type==='gc'&&a.target_name.toLowerCase()===gc.name.toLowerCase()&&a.status==='pending');
    const banner=gc.banner_url||'/gc/gc-ide.webp';
    return `<article class="gc-banner-card">
     <div class="gc-banner-media">
      <img src="${e(banner)}" alt="Banner ${e(gc.name)}" loading="lazy"/>
      <span class="gc-day-pill">${e(gc.meeting_day||'Terça-feira | 19h30')}</span>
     </div>
     <div class="gc-banner-body">
      <div class="gc-banner-head">
       <h3>${e(gc.name)}</h3>
       <span class="badge">${e(gc.neighborhood||'Lagoinha')}</span>
      </div>
      <p class="gc-banner-address">📍 ${e(gc.address||gc.neighborhood||'Consulte o endereço com a liderança')}</p>
      <div class="gc-banner-meta">
       <span>👤 ${e(gc.leader_name||'Liderança GC')}</span>
       <span>👥 ${gc.member_count||0} membro(s)</span>
      </div>
      <button type="button" class="${alreadyPending?'secondary':''}" data-apply-gc="${e(gc.id)}" data-gc-name="${e(gc.name)}" data-gc-addr="${e(gc.address||gc.neighborhood||'')}" data-gc-banner="${e(banner)}">
       ${alreadyPending?'⏳ Solicitação em Análise':'🏠 Quero Participar deste GC →'}
      </button>
     </div>
    </article>`;
   }).join('')}
  </div>
 </section>

 <section id="ministry-showcase-section" style="margin-top:42px;">
  <div class="section-title" style="margin-bottom:18px;">
   <div>
    <span class="eyebrow" style="color:#4338ca;">CADA DOM A SERVIÇO DO REINO · 17 MINISTÉRIOS OFICIAIS</span>
    <h2>✦ Candidate-se para Servir nos Ministérios da Lagoinha</h2>
    <p style="margin:4px 0 0;color:#52525b;">Cada card possui identidade única. Ao se candidatar, o líder responsável pelo ministério recebe uma notificação imediata para entrar em contato, preparar e aprovar você!</p>
   </div>
  </div>
  <div class="ministry-showcase-grid">
   ${mins.map(m=>{
    const meta=MINISTRY_META[m.name]||{tagline:'Ministério Oficial',desc:'Sirva com excelência na casa de Deus.',roles:['Voluntário','Equipe']};
    const alreadyPending=myApps.some(a=>a.target_type==='ministry'&&a.target_name.toLowerCase()===m.name.toLowerCase()&&a.status==='pending');
    const isChampions=m.name==='Champions';
    return `<article class="ministry-showcase-card ${isChampions?'champions-featured':''}">
     ${isChampions?`<div class="champions-hero-banner"><img src="/ministries/champions.webp" alt="Ministério Champions" loading="lazy"/><span class="champions-pill">🏆 ARTE OFICIAL · CHAMPIONS</span></div>`:''}
     <div class="ministry-showcase-top">
      ${ministryEmblem(m.name)}
      <div class="ministry-showcase-counts">
       <span class="badge">${m.total||0} ativo(s)</span>
      </div>
     </div>
     <div class="ministry-showcase-content">
      <small class="ministry-tagline">${e(meta.tagline)}</small>
      <h3>Ministério ${e(m.name)}</h3>
      <p>${e(meta.desc)}</p>
      <div class="ministry-role-pills">
       ${(meta.roles||[]).slice(0,4).map(r=>`<span class="card-tag">${e(r)}</span>`).join('')}
      </div>
     </div>
     <button type="button" class="${alreadyPending?'secondary':''}" data-apply-ministry="${e(m.name)}">
      ${alreadyPending?'⏳ Candidatura Enviada':'✦ Candidatar-se ao Ministério →'}
     </button>
    </article>`;
   }).join('')}
  </div>
 </section>
 <dialog id="community-apply-dialog"><div class="sector-modal"></div></dialog>`;
}

function openApplyModal(targetType,targetId,targetName,extra={}){
 const dialog=root.querySelector('#community-apply-dialog');
 if(!dialog)return;
 const meta=targetType==='ministry'?(MINISTRY_META[targetName]||{roles:['Voluntário','Integrante','Liderança']}):{roles:['Participante do GC','Anfitrião de Casa','Auxiliar de GC']};
 const roles=meta.roles||['Participante'];

 dialog.querySelector('.sector-modal').innerHTML=`
  <div class="section-title">
   <h2>${targetType==='gc'?`🏠 Participar do ${e(targetName)}`:`✦ Candidatar-se · Ministério ${e(targetName)}`}</h2>
   <button type="button" class="secondary" id="close-apply-modal">Fechar</button>
  </div>
  ${extra.banner?`<div style="border-radius:14px;overflow:hidden;max-height:220px;margin-bottom:14px;border:1px solid #e4e4e7;"><img src="${e(extra.banner)}" alt="${e(targetName)}" style="width:100%;height:200px;object-fit:cover;display:block;"/></div>`:''}
  ${targetName==='Champions'?`<div style="border-radius:14px;overflow:hidden;max-height:200px;margin-bottom:14px;border:1px solid #e4e4e7;"><img src="/ministries/champions.webp" alt="Champions" style="width:100%;height:190px;object-fit:cover;display:block;"/></div>`:''}
  <p class="subtle" style="margin-top:0;">
   ${targetType==='gc'
    ?`Endereço do GC: <strong>${e(extra.address||'Consulte com o líder')}</strong>. Sua solicitação será enviada diretamente para a liderança de GCs entrar em contato e receber você!`
    :`Ao enviar sua candidatura, o responsável pelo <strong>Ministério ${e(targetName)}</strong> receberá uma notificação imediata para conversar com você, preparar e aprovar sua entrada na equipe.`}
  </p>
  <form id="community-apply-form" class="record-form">
   <label>Seu Nome
    <input value="${e(identity?.user?.name||'')}" disabled>
   </label>
   <label>${targetType==='gc'?'Como deseja participar?':'Função ou Instrumento em que deseja servir'}
    <select name="role_desired" required>
     ${roles.map(r=>`<option value="${e(r)}">${e(r)}</option>`).join('')}
    </select>
   </label>
   <label>Seu WhatsApp / Telefone para o líder entrar em contato
    <input name="phone" type="tel" required placeholder="Ex.: (33) 99999-0000" value="${e(identity?.user?.phone||'')}" maxlength="40">
   </label>
   <label>Experiência, disponibilidade ou mensagem para o líder (opcional)
    <input name="notes" placeholder="${targetType==='ministry'?'Ex.: Já toco violão há 3 anos, disponível aos domingos...':'Ex.: Moro próximo ao bairro e gostaria de caminhar junto!'}" maxlength="400">
   </label>
   <p class="error" role="alert"></p>
   <button type="submit">${targetType==='gc'?'Confirmar Inscrição no GC':'Enviar Candidatura ao Líder'}</button>
  </form>`;

 dialog.querySelector('#close-apply-modal').onclick=()=>dialog.close();
 dialog.querySelector('#community-apply-form').onsubmit=async ev=>{
  ev.preventDefault();
  const f=ev.currentTarget,b=f.querySelector('button[type=submit]');
  b.disabled=true;
  try{
   const fd=new FormData(f);
   const res=await api('/platform/apply',{
    method:'POST',
    body:{
     target_type:targetType,
     target_id:targetId,
     target_name:targetName,
     role_desired:fd.get('role_desired'),
     phone:fd.get('phone'),
     notes:fd.get('notes')||''
    }
   });
   dialog.close();
   communityData=await api('/platform/community');
   identity=await api('/platform/me');
   render(res.message);
  }catch(err){
   f.querySelector('.error').textContent=err.message;
  }finally{
   b.disabled=false;
  }
 };
 dialog.showModal();
}

function render(message=''){
 const selected=location.pathname.split('/')[1]||identity.active_module;
 const module=identity.modules.find(m=>m.id===selected);
 const isMemberPortal=!module&&(selected==='access'||selected==='membro'||!identity.platform_admin);
 const areaKey=module?module.id:(isMemberPortal?'membro':'systems');
 const navLinks=identity.modules.filter(m=>m.enabled).map(m=>`<a class="topbar-sector-link ${module?.id===m.id?'active':''}" href="${m.url}">${e(m.name.replace('Lagoinha ',''))}</a>`).join('');
 const unreadCount=(identity?.notifications||[]).filter(n=>!n.read_at).length;

 // Strict visibility: non-admin users only see cards for the modules explicitly liberated for them
 const visibleModules=identity.platform_admin&&!isMemberPortal
  ?identity.modules
  :identity.modules.filter(m=>m.enabled);

 root.innerHTML=`<header class="platform-topbar">
  ${brand(areaKey)}
  <nav class="topbar-nav-pills" aria-label="Atalhos dos setores">
   ${identity.platform_admin?`<a class="topbar-sector-link ${!module&&!isMemberPortal?'active':''}" href="/systems">🛡️ Painel TI</a>`:''}
   <a class="topbar-sector-link ${isMemberPortal?'active':''}" href="/membro">🌟 Área do Membro</a>
   ${navLinks}
  </nav>
  <div class="topbar-user-area">
   <button type="button" class="quiet" id="topbar-qr-btn" title="Baixar Aplicativo via QR Code" style="padding:6px 12px;min-height:38px;font-size:12.5px;">📱 App QR</button>
   <button type="button" class="quiet" id="topbar-notif-btn" title="Notificações" style="padding:6px 12px;min-height:38px;font-size:12.5px;position:relative;">🔔 ${unreadCount?`<span class="badge" style="background:#dc2626;color:#fff;padding:2px 6px;font-size:10.5px;">${unreadCount}</span>`:''}</button>
   <div class="topbar-user-chip">
    <span class="avatar mini">${e(initials(identity.user.name))}</span>
    <span>${e(identity.user.name)}${identity.pastor?' <small style="color:#b45309;font-weight:800;">(Pastor/a)</small>':''}</span>
   </div>
   <button class="quiet" id="logout">Sair</button>
  </div>
 </header>
 <main class="workspace page-enter">
  ${!module?portalHero(module,selected):`<section class="intro"><span class="eyebrow">${identity.platform_admin?'ADMINISTRAÇÃO CENTRAL':identity.pastor?'ACESSO PASTORAL PLENO':'SEU ESPAÇO AUTORIZADO'}</span><h1>${e(module.name)}</h1><p>${e(descriptions[module.id])}</p></section>`}
  <p class="status" role="status">${e(message)}</p>
  ${notificationsBanner()}
  ${module?moduleView(module):`
   <div class="section-title" style="margin-bottom:16px;">
    <div>
     <h2>${isMemberPortal?'🔓 Minhas Áreas de Gestão Liberadas':'Sistemas e Setores da Igreja'}</h2>
     <span class="subtle">${visibleModules.length?'Toque em Abrir área para entrar diretamente no setor autorizado para seu usuário':'Você está na Área de Membros. Inscreva-se abaixo em um GC ou Ministério!'}</span>
    </div>
   </div>
   ${visibleModules.length?`<section class="grid" aria-label="Sistemas disponíveis">${visibleModules.map(card).join('')}</section>`:''}
   ${isMemberPortal?memberCommunityPortal():''}
  `}
  ${identity.platform_admin&&!module&&!isMemberPortal?permissions()+auditSection():''}
 </main>
 <footer class="platform-footer">Lagoinha Systems v2.3 · Criptografia Ponta a Ponta (AES-128) · Comunhão, GCs e Ministérios.</footer>`;

 if(module?.enabled&&module.id!=='kids')void sectors.mount(module);

 root.querySelector('#logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST'});identity=null;csrf='';users=[];await welcome('systems');login();}catch(error){render(error.message);}};
 root.querySelector('#topbar-qr-btn')?.addEventListener('click',()=>openAppDownloadQrModal());
 root.querySelectorAll('[data-open-qr]').forEach(b=>b.addEventListener('click',()=>openAppDownloadQrModal()));
 root.querySelector('#topbar-notif-btn')?.addEventListener('click',()=>{notifDrawerOpen=!notifDrawerOpen;render(message);});

 root.querySelectorAll('[data-read-notif]').forEach(btn=>btn.addEventListener('click',async()=>{
  const nid=btn.dataset.readNotif;
  await api(`/platform/notifications/${nid}/read`,{method:'POST'});
  identity=await api('/platform/me');
  render(message);
 }));

 root.querySelector('#mark-all-notifs-read')?.addEventListener('click',async()=>{
  const unread=(identity?.notifications||[]).filter(n=>!n.read_at);
  for(const n of unread){await api(`/platform/notifications/${n.id}/read`,{method:'POST'});}
  identity=await api('/platform/me');
  render('Todas as notificações foram marcadas como lidas.');
 });

 root.querySelectorAll('[data-apply-gc]').forEach(btn=>btn.addEventListener('click',()=>{
  openApplyModal('gc',btn.dataset.applyGc,btn.dataset.gcName,{address:btn.dataset.gcAddr,banner:btn.dataset.gcBanner});
 }));

 root.querySelectorAll('[data-apply-ministry]').forEach(btn=>btn.addEventListener('click',()=>{
  openApplyModal('ministry',btn.dataset.applyMinistry,btn.dataset.applyMinistry);
 }));

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
   await load();root.querySelector('.status').textContent='Permissão atualizada. O servidor já aplica o novo acesso restrito ao usuário.';
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
   }else if(kind==='toggle-pastor'){
    const isPastor=btn.dataset.pastor==='true';
    if(!confirm(isPastor?'Remover cargo Pastor / Pastora deste usuário?':'Conceder cargo Pastor / Pastora (acesso e permissão de edição em todos os setores operacionais) a este usuário?')){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{pastor:!isPastor}});
    await load();root.querySelector('.status').textContent=isPastor?'Cargo Pastoral removido.':'Cargo Pastor / Pastora concedido com acesso a todos os setores!';
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
 const tags=(moduleTags[m.id]||[]).map(t=>`<span class="card-tag">${e(t)}</span>`).join('');
 const roleLabel=m.role?` · ${roleNames[m.role]||m.role}`:'';
 const scopeLabel=m.scope?` (${m.scope})`:'';
 return `<article class="card ${m.enabled?'':'locked'}" data-module="${e(m.id)}">${sectorEmblem(m.id)}<span class="badge">${m.enabled?(m.status==='operational'?`🟢 Liberado${e(roleLabel)}${e(scopeLabel)}`:'Em desenvolvimento'):'🔒 Acesso restrito'}</span><h2>${e(m.name)}</h2><p>${e(descriptions[m.id])}</p><div class="card-tags">${tags}</div>${m.enabled?`<a class="button" href="${m.url}">${m.id==='kids'?'Abrir Lagoinha Kids →':'Abrir Setor →'}</a>`:'<p class="subtle">Acesso liberado apenas mediante autorização do responsável pelo setor.</p>'}</article>`;
}

function moduleView(m){if(!m.enabled)return `<section class="panel"><h2>Acesso restrito a este setor</h2><p>Seu usuário possui acesso apenas às áreas liberadas pelos administradores ou líderes responsáveis.</p><a class="button secondary" href="/membro">Voltar para Área do Membro</a></section>`;return '<div id="sector-content"><p>Carregando registros…</p></div>';}

function permissions(){
 const filteredUsers=users.filter(u=>!userSearch||(u.name+' '+u.email).toLowerCase().includes(userSearch.toLowerCase()));
 return `<section class="permissions" id="permissions-section"><div class="permissions-header"><div><h2>Usuários, Cargo Pastoral e Permissões por Setor</h2><p style="margin:4px 0 0;">Cada usuário acessa apenas o que for liberado aqui. O cargo <strong>Pastor / Pastora</strong> concede acesso e edição em todos os setores operacionais (sem alterar o painel exclusivo de TI).</p></div><label style="min-width:260px;font-size:13px;font-weight:600;">Filtrar usuário<input id="user-filter-input" value="${e(userSearch)}" placeholder="Nome ou e-mail..." maxlength="100"></label></div><details class="panel"><summary><strong>+ Novo usuário central</strong><span>Crie uma identidade e escolha os módulos permitidos</span></summary><form id="create-identity" class="create-identity"><label>Nome<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label><label>Senha inicial<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><p class="subtle">Nenhum setor administrativo é liberado automaticamente. O usuário terá acesso à Área de Membros e aos setores que você ativar.</p><p class="error" role="alert"></p><button>Criar usuário</button></form></details>${filteredUsers.map(u=>`<details class="panel"><summary><span class="avatar mini">${e(initials(u.name))}</span><strong>${e(u.name)}</strong><span>${e(u.email)}</span>${!u.active?'<span class="badge" style="background:#fee2e2;color:#991b1b;">🔴 Bloqueado</span>':''}${u.pastor?'<span class="badge" style="background:#fef3c7;color:#92400e;border-color:#fde68a;">👑 Pastor / Pastora</span>':''}${u.platform_admin?'<span class="badge">🛡️ Administrador central</span>':`<span class="badge">${u.pastor?'Todos os setores (Pastoral)':`${(u.grants||[]).filter(g=>g.enabled).length} sistema(s) ativo(s)`}</span>`}</summary><div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:8px;"><button type="button" class="secondary" data-user-patch="reset-pwd" data-uid="${u.id}">🔑 Redefinir senha</button><button type="button" class="secondary" data-user-patch="toggle-pastor" data-uid="${u.id}" data-pastor="${Boolean(u.pastor)}">${u.pastor?'Remover Cargo Pastor(a)':'👑 Definir como Pastor / Pastora'}</button>${u.id!==identity.user.id?`<button type="button" class="secondary" data-user-patch="toggle-active" data-uid="${u.id}" data-active="${u.active}">${u.active?'🔒 Bloquear conta':'🔓 Reativar conta'}</button><button type="button" class="secondary" data-user-patch="toggle-admin" data-uid="${u.id}" data-admin="${u.platform_admin}">${u.platform_admin?'Remover Admin Central':'🛡️ Tornar Admin Central'}</button>`:'<span class="subtle" style="align-self:center;">Sua própria conta administrativa</span>'}</div>${u.platform_admin?'<p>Acesso administrativo total a todos os sistemas e configurações de TI.</p>':u.pastor?'<p class="notice" style="margin:8px 0;">👑 <strong>Acesso Pastoral Ativo:</strong> Este usuário possui acesso de leitura, criação e alteração em todos os setores (Kids, Members, Ministries e Finance), sem acesso ao painel exclusivo de TI.</p>':''}${u.platform_admin?'':Object.entries(names).map(([id,name])=>{const g=u.grants.find(g=>g.module===id);const roles=id==='kids'?['admin','pastor','teacher','parent']:['admin','pastor','editor','viewer'];const scopeSelect=id==='ministries'?`<label>Escopo Ministerial (opcional)<select name="scope"><option value="">Todos os 17 ministérios</option>${MINISTRY_CATALOG.map(m=>`<option value="${e(m)}" ${g?.scope===m?'selected':''}>Somente ${e(m)}</option>`).join('')}</select></label>`:'';return `<form class="grant" data-user="${u.id}" data-grant="${id}" style="${id==='ministries'?'grid-template-columns:minmax(160px,1.2fr) minmax(150px,1fr) minmax(180px,1fr) auto;':''}"><label class="check"><input name="enabled" type="checkbox" ${g?.enabled||u.pastor?'checked':''}>${e(name)}</label><label>Perfil<select name="role">${roles.map(role=>`<option value="${role}" ${role===(u.pastor?'pastor':(g?.role||(id==='kids'?'parent':'viewer')))?'selected':''}>${roleNames[role]}</option>`).join('')}</select></label>${scopeSelect}<button>Salvar acesso</button><p role="alert" class="error"></p></form>`;}).join('')}</details>`).join('')}</section>`;
}

function auditSection(){
 return `<section class="panel" style="margin-top:28px;">
  <div class="section-title">
   <div>
    <h2>🛡️ Auditoria Global de Segurança, Criptografia &amp; Integridade</h2>
    <p style="margin:4px 0 0;">Acompanhe logins, concessões de acesso, alterações em módulos e exporte snapshots íntegros do banco de dados.</p>
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
