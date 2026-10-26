import {readApiResponse} from '../api-response.js';
import {workspaceUI} from './workspace.js';
import {hasPendingForms} from '../form-lifecycle.js';
import {deferredRefresh} from './live-refresh.js';
import {communityHallUI} from './hall.js';
import {accountProfileUI} from '../account-profile.js';
import {realtime, showRealtimeToast} from './realtime.js';
import {notificationCenterUI} from '../notification-center.js';
import {personalDataUI} from './personal.js';
import {uiIcon} from '../ui/icons.js';
import {recoveryScreen} from './recovery.js';
if(location.pathname==='/'&&['overview','children','rooms','attendance','events','lessons','notifications','settings','users','team'].includes(location.hash.slice(1)))location.replace('/kids'+location.hash);
import './style.css';
import {subscribeWebPush} from '../web-push.js';
import {createSectors} from './sectors.js';
import {sectorEmblem,ministryEmblem,MINISTRY_META,openAppDownloadQrModal} from './emblems.js';
import {t,getLang,setLang,getTheme,toggleTheme,SUPPORTED_LANGS,translateDOM} from './i18n.js';

const noticeCenter=notificationCenterUI({api,e:x=>e(x),subscribe:()=>subscribeWebPush(api),onChange:count=>{
 if(identity)identity.notification_unread_count=count;
 const button=root.querySelector('#topbar-notif-btn');if(!button)return;
 button.querySelector('.notif-count-badge')?.remove();
 if(count){const badge=document.createElement('span');badge.className='badge notif-count-badge';badge.textContent=count>99?'99+':String(count);button.append(badge);}
}});
const root=document.getElementById('systems');
const names={kids:'Lagoinha Kids',finance:'Lagoinha Finance',members:'Lagoinha Members',ministries:'Lagoinha Ministries'};
const descriptions={kids:'Turmas, presença e comunicação com as famílias.',finance:'Contas, lançamentos e relatórios.',members:'Membros, famílias e GCs.',ministries:'Equipes, escalas e materiais.'};
const moduleTags={
 kids:['QR Code','TAG Térmica','Chamada'],
 members:['GCs','Discipulado','Membros'],
 ministries:['16 Ministérios','Escala Louvor','Voluntários'],
 finance:['Previsão','Relatórios','Fechamento do culto']
};
const brandMeta={
 systems:{word:'Systems',tagline:'TI & ACESSOS'},
 access:{word:'Membro',tagline:'ÁREA DE MEMBROS'},
 membro:{word:'Membro',tagline:'ÁREA DE MEMBROS'},
 kids:{word:'Kids',tagline:'MINISTÉRIO INFANTIL'},
 members:{word:'Members',tagline:'MEMBROS & GCs'},
 ministries:{word:'Ministries',tagline:'MINISTÉRIOS & ESCALAS'},
 finance:{word:'Finance',tagline:'GESTÃO FINANCEIRA'}
};
const MINISTRY_CATALOG=['Music','Intercessão','Hero','Shine','Bem Casados','Rocket','Legacy','Kids','Manutenção','Voluntário','Follow','Link','Future','Gourmet','Champions','DNA'];
const roleNames={admin:'Administrador',pastor:'Pastor / Pastora',teacher:'Professor(a)',parent:'Responsável',editor:'Responsável — lançar e editar',viewer:'Visualizador — somente leitura'};
let csrf='',identity=null,communityData=null,users=[],userSearch='',auditData=null,notifDrawerOpen=false,activeSectionTab=location.hash.slice(1).split('/')[0]||'all';
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=name=>String(name||'L').trim().split(/\s+/).slice(0,2).map(p=>p[0]?.toUpperCase()||'').join('')||'L';

const WORK_TABS=new Set(['tasks','calendar','account','operations','groups','reception']);
const AREA_TABS={
 membro:[
  {id:'all',label:'Início',icon:'home'},
  {id:'hall',label:'Hall de Membros',icon:'community'},
  {id:'announcements',label:'Comunicados',icon:'announcements'},
  {id:'gcs',label:'GCs',icon:'groups'},
  {id:'ministries',label:'Ministérios',icon:'ministries'}
 ],
 systems:[
  {id:'all',label:'Visão Geral',icon:'home'},
  {id:'permissions',label:'Acessos',icon:'permissions'},
  {id:'audit',label:'Auditoria',icon:'systems'}
 ],
 members:[
  {id:'all',label:'Visão Geral',icon:'home'},
  {id:'hall',label:'Hall de Membros',icon:'community'},
  {id:'people',label:'Membros',icon:'identity'},
  {id:'families',label:'Famílias',icon:'family'},
  {id:'cells',label:'GCs',icon:'groups'}
 ],
 ministries:[
  {id:'all',label:'Visão Geral',icon:'home'},
  {id:'worship',label:'Louvor',icon:'worship'},
  {id:'schedules',label:'Escalas',icon:'schedules'},
  {id:'assignments',label:'Equipes',icon:'volunteers'},
  {id:'resources',label:'Materiais',icon:'resources'}
 ],
 finance:[
  {id:'all',label:'Visão Geral',icon:'home'},
  {id:'entries',label:'Lançamentos',icon:'transactions'},
  {id:'closings',label:'Fechamento do culto',icon:'closing'},
  {id:'accounts',label:'Contas',icon:'bank'},
  {id:'cost-centers',label:'Centros',icon:'costs'},
  {id:'invoices',label:'Notas Fiscais',icon:'invoice'}
 ]
};

for(const [area,tabs] of Object.entries(AREA_TABS)){tabs.push({id:'tasks',label:'Tarefas',icon:'closing'},{id:'calendar',label:'Agenda',icon:'schedules'},{id:'account',label:'Minha conta',icon:'identity'});if(area==='membro')tabs.push({id:'reception',label:'Recepção Kids',icon:'kids'},{id:'groups',label:'Liderança de GC',icon:'groups'});else tabs.push({id:'operations',label:area==='systems'?'Operações':area==='finance'?'Conferência':area==='members'?'Integração & GCs':'Gestão da equipe',icon:'systems'});}

function currentAreaKey(){
 const p=location.pathname.split('/')[1];
 return brandMeta[p]?p:'systems';
}

function getSavedAccounts(){try{localStorage.removeItem('kids_saved_accounts');}catch{}return [];}

function saveAccount(){try{localStorage.removeItem('kids_saved_accounts');}catch{}}

function removeSavedAccount(email){
 try{
  const list=getSavedAccounts().filter(a=>a.email!==email);
  localStorage.setItem('kids_saved_accounts',JSON.stringify(list));
 }catch{}
}

function welcome(areaKey=currentAreaKey()){
 const meta=brandMeta[areaKey]||brandMeta.systems;
 root.innerHTML=`<div class="welcome-screen" aria-label="Lagoinha ${e(meta.word)}"><div class="welcome-logo-wrap"><img src="/logo.png" alt="Logo Lagoinha"/></div><div class="welcome-text"><strong>Lagoinha ${e(meta.word)}</strong><small>${t('brand.'+areaKey+'_tagline', meta.tagline)}</small></div></div>`;
 translateDOM(root);
 return new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:550));
}

async function api(path,options={}){
 const raw=options.raw||options.body instanceof FormData;
 let response;try{response=await fetch('/api'+path,{credentials:'same-origin',...options,signal:AbortSignal.timeout(45000),headers:{...(!raw?{'Content-Type':'application/json'}:{}),'X-CSRF-Token':csrf,...options.headers},body:raw?options.body:(options.body?JSON.stringify(options.body):undefined)});}catch{throw new Error('Conexão interrompida. Reabra os dados para conferir se foram salvos antes de tentar novamente.');}
 return readApiResponse(response,{method:options.method||'GET'});
}

const personal=personalDataUI({api,e});
const operationsUI=workspaceUI({api,e,identity:()=>identity,onProfileSaved:profileSaved});
const portalHall=communityHallUI({api,e,identity:()=>identity,onProfileSaved:profileSaved});
const sectors=createSectors({api,e,identity:()=>identity,onProfileSaved:profileSaved,openQrModal:()=>openAppDownloadQrModal()});

const brand=(areaKey=currentAreaKey())=>{
 const meta=brandMeta[areaKey]||brandMeta.systems;
 return `<a class="brand" href="${identity&&!identity.platform_admin?'/access':'/systems'}"><img src="/logo.png" alt=""><div class="brand-text"><span>Lagoinha <strong>${e(meta.word)}</strong></span><small>${t('brand.'+areaKey+'_tagline', meta.tagline)}</small></div></a>`;
};

function authBrand(areaKey=currentAreaKey()){
 const meta=brandMeta[areaKey]||brandMeta.systems;
 return `<div class="auth-brand"><div class="auth-logo-badge"><img src="/logo.png" alt="Lagoinha" class="auth-logo-img"/></div><div class="auth-brand-text"><span class="auth-brand-name">Lagoinha <strong>${e(meta.word)}</strong></span><span class="auth-brand-tagline">${t('brand.'+areaKey+'_tagline', meta.tagline)}</span></div></div>`;
}

function login(message='',prefillEmail=''){
 const areaKey=currentAreaKey();
 const saved=getSavedAccounts();
 const savedHtml=saved.length?`<div class="saved-accounts-card"><div class="saved-accounts-head"><span>Acessos salvos</span><small>Toque para entrar</small></div><div class="saved-accounts-chips">${saved.map(a=>`<div class="saved-account-chip"><button type="button" class="saved-account-main" data-saved-email="${e(a.email)}"><span class="avatar mini">${e(initials(a.name||a.email))}</span><div class="saved-account-text"><strong>${e(a.name||a.email)}</strong><small>${e(a.email)}</small></div></button><button type="button" class="saved-account-del" data-remove-email="${e(a.email)}" title="Remover conta" aria-label="Remover"></button></div>`).join('')}</div></div>`:'';

 root.innerHTML=`<main class="auth-screen"><section class="auth-card">${authBrand(areaKey)}<h1>${t('auth.welcome', 'Bem-vindo')}</h1><p class="auth-subtitle">${t('auth.welcome_system', 'Entre na sua conta.')}</p>${savedHtml}<form id="login"><label>${t('auth.email', 'E-mail')}<input name="email" id="login-email" type="email" autocomplete="username" required maxlength="200" value="${e(prefillEmail)}"></label><label>${t('auth.password', 'Senha')}<div class="password-field"><input name="password" id="login-password" type="password" autocomplete="current-password" required maxlength="128"><button type="button" id="toggle-pwd" aria-label="Mostrar senha">${t('action.show', 'Ver')}</button></div></label><label id="platform-otp" hidden>Código do autenticador<input name="otp" autocomplete="one-time-code" maxlength="40"></label><p role="alert" class="error">${e(message)}</p><button type="submit">${t('auth.sign_in_system', 'Entrar')}</button></form><button type="button" class="secondary" id="recover-access">Esqueci minha senha</button><footer class="auth-footer"><a class="subtle" href="/kids">Lagoinha Kids →</a><div class="aux-controls-bar"><button type="button" class="aux-btn" id="auth-qr-btn">${t('auth.install_app', 'Instalar app')}</button><button type="button" class="aux-btn" id="auth-theme-btn" title="Alternar tema">${getTheme()==='dark' ? t('theme.light', '☀️ Claro') : t('theme.dark', '🌙 Escuro')}</button><select id="auth-lang-select" class="aux-lang-select" aria-label="Idioma">${SUPPORTED_LANGS.map(l=>`<option value="${l.code}" ${l.code===getLang()?'selected':''}>${l.flag} ${l.code.toUpperCase()}</option>`).join('')}</select></div></footer></section></main>`;
 translateDOM(root);

 root.querySelector('#auth-qr-btn')?.addEventListener('click',()=>openAppDownloadQrModal());
 root.querySelector('#recover-access').onclick=()=>recoveryScreen({root,api,e,login});
 root.querySelector('#auth-theme-btn')?.addEventListener('click',()=>{toggleTheme();login(message,root.querySelector('#login-email')?.value||'');});
 root.querySelector('#auth-lang-select')?.addEventListener('change',ev=>{setLang(ev.target.value);login(message,root.querySelector('#login-email')?.value||'');});
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
  button.innerHTML='<span class="spin">●</span> Entrando...';
  try{
   const r=await api('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(form))});
   csrf=r.csrf;
   if(r.user)saveAccount(r.user);
   sessionStorage.removeItem('lagoinha_login_redirected');
   await welcome(currentAreaKey());
   await load(true);
   realtime.connect(csrf,'');
  }catch(error){
   if(error.code==='mfa'){const field=form.querySelector('#platform-otp');if(field){field.hidden=false;field.querySelector('input').focus();}}
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

function profileSaved(user){
 identity.user=user;saveAccount(user);
 if(activeSectionTab==='hall'){
  const badge=root.querySelector('#account-profile');if(badge)badge.innerHTML=user.avatar_url?`<img src="${e(user.avatar_url)}" alt="Sua foto" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:`<span class="avatar mini">${e(initials(user.name))}</span>`;
  const name=root.querySelector('.sidebar-user-info strong');if(name)name.textContent=user.name;
  document.dispatchEvent(new CustomEvent('lagoinha:profile-saved',{detail:user}));
 }else render('Perfil salvo.');
}

function portalHero(module,selected){
 if(module)return '';
 const ti=identity.platform_admin&&!['access','membro'].includes(selected);
 const actions=ti
  ?'<button type="button" data-switch-tab="permissions">Acessos</button><a class="button secondary" href="/membro">Área do membro</a><a class="button secondary" href="/api/platform/backup" download>Exportar dados</a>'
  :`<button type="button" data-switch-tab="gcs">Encontrar GC</button><button type="button" class="secondary" data-switch-tab="ministries">Servir em ministério</button>${identity.platform_admin||identity.pastor||identity.modules.some(m=>m.id==='members'&&m.enabled)?`<a class="button secondary" href="/membro#hall" id="open-hall-hero">${uiIcon('community',18)} Hall de Membros</a>`: ''}<button type="button" class="secondary" id="open-my-profile-hero">${uiIcon('identity',18)} Meu perfil</button>`;
 return `<section class="portal-heading"><h1>${ti?'Administração':'Minha área'}</h1><div class="sector-actions">${actions}</div></section>`;
}

function notificationsBanner(){return '';}

function memberCommunityPortal(tab='all'){
 if(tab==='hall')return '<div id="member-hall-root"></div>';
 const cells=communityData?.cells||[];
 const mins=communityData?.ministries||MINISTRY_CATALOG.map(name=>({name,total:0,leaders:0}));
 const myApps=communityData?.my_applications||[];
 const mySchedules=communityData?.my_schedules||[];

 const mySchedulesHtml=(tab==='all'&&mySchedules.length)?`<section class="panel my-schedules-section" style="margin-top:20px;">
  <div class="section-title">
   <h2>${uiIcon('schedules',20)} Minhas Escalações (${mySchedules.length})</h2>
   <span class="subtle" style="font-size:12.5px;">Confirme sua presença ou informe indisponibilidade</span>
  </div>
  <div class="my-schedules-grid">
   ${mySchedules.map(s=>{
    const isConfirmed=s.status==='confirmed';
    const isDeclined=s.status==='declined';
    const statusBadge=isConfirmed
     ?'<span class="badge" style="background:#dcfce7;color:#166534;font-weight:600;">✓ Presença Confirmada</span>'
     :isDeclined
      ?'<span class="badge" style="background:#fee2e2;color:#991b1b;font-weight:600;">✕ Indisponível</span>'
      :'<span class="badge" style="background:#fef3c7;color:#92400e;font-weight:600;">⏳ Confirmação Pendente</span>';
    return `
     <article class="my-schedule-card">
      <div class="my-schedule-card-main">
       <div class="my-schedule-header">
        <span class="badge" style="background:#09090b;color:#fff;font-weight:600;">${e(s.ministry)}</span>
        ${statusBadge}
       </div>
       <h3 style="margin:8px 0 4px;font-size:16px;">${e(s.title)}</h3>
       <p class="subtle" style="margin:0 0 6px;font-size:13px;">
        📅 <strong>${e(new Date(s.service_date+'T12:00:00').toLocaleDateString('pt-BR'))}</strong> às <strong>${e(s.service_time||'18:00')}</strong>
        ${s.role_notes?` · <span style="color:#09090b;font-weight:500;">Função: ${e(s.role_notes)}</span>`:''}
       </p>
      </div>
      <div class="my-schedule-actions">
       ${!isConfirmed?`<button type="button" class="btn primary mini-btn" data-schedule-respond="${e(s.id)}" data-status="confirmed">✓ Confirmar Presença</button>`:''}
       ${!isDeclined?`<button type="button" class="btn secondary mini-btn danger-btn" data-schedule-respond="${e(s.id)}" data-status="declined">Informar Indisponibilidade</button>`:''}
      </div>
     </article>
    `;
   }).join('')}
  </div>
 </section>`:'';

 const myAppsHtml=(tab==='all'&&myApps.length)?`<section class="panel" style="margin-top:20px;">
  <div class="section-title">
   <h2>Minhas solicitações</h2>
  </div>
  <div class="insight-list">
   ${myApps.map(a=>`<div class="insight-item">
    <div>
     <strong>${a.target_type==='gc'?'GC: ':'Ministério: '}${e(a.target_name)}</strong>
     <small>${e(a.role_desired||'Participante')} · ${e(new Date(a.created_at).toLocaleDateString('pt-BR'))}</small>
    </div>
    <span class="badge" style="${a.status==='approved'?'background:#dcfce7;color:#166534;':a.status==='rejected'?'background:#fee2e2;color:#991b1b;':'background:#fef3c7;color:#92400e;'}">
     ${a.status==='approved'?'Aprovado':a.status==='rejected'?'Encerrado':'⏳ Pendente'}
    </span>
   </div>`).join('')}
  </div>
 </section>`:'';

 const anns=communityData?.announcements||[];
 const isLeader=Boolean(
  identity?.platform_admin||
  identity?.pastor||
  identity?.modules?.some(m=>m.enabled&&['admin','pastor','editor'].includes(m.role))
 );

 const sectorLabels={all:'Geral',kids:'Kids',members:'Membros & GCs',ministries:'Ministérios',finance:'Financeiro'};
 const sectorColors={all:'#18181b',kids:'#b45309',members:'#0f766e',ministries:'#4338ca',finance:'#15803d'};

 const announcementsHtml=(tab==='all'||tab==='announcements')?`
 <section id="announcements-section" style="margin-top:20px;">
  <div class="section-title" style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
   <h2>Comunicados e Eventos</h2>
   ${isLeader?`<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn primary" id="open-new-announcement-btn" style="min-height:38px;padding:6px 14px;font-size:12.5px;">+ Comunicado</button></div>`:''}
  </div>
  ${anns.length?`
   <div class="announcements-mural-grid">
    ${anns.map(a=>{
     const sCol=sectorColors[a.target_sector]||'#18181b';
     const canDelete=identity?.platform_admin||identity?.pastor||a.author_id===identity?.user?.id;
     return `
      <article class="announcement-card">
       <div>
        <div class="announcement-badge-row">
         <span class="announcement-badge-sector" style="background:${sCol};color:#ffffff;">
          ${e(sectorLabels[a.target_sector]||a.target_sector)}
         </span>
         ${a.event_date?`<span class="badge" style="background:#fef3c7;color:#92400e;">${uiIcon('schedules',14)} ${e(a.event_date)}</span>`:''}
        </div>
        <h3 style="margin:10px 0 6px;">${e(a.title)}</h3>
        <p class="announcement-body">${e(a.message)}</p>
        ${a.location?`<div class="announcement-meta-item" style="margin-top:8px;">${uiIcon('groups',16)} <span>${e(a.location)}</span></div>`:''}
       </div>
       <div class="announcement-footer">
        <span><strong>${e(a.author_name||'Liderança')}</strong> · ${e(new Date(a.created_at).toLocaleDateString('pt-BR'))}</span>
        ${canDelete?`<button type="button" class="mini-button danger-button" data-del-ann="${e(a.id)}" title="Arquivar" style="padding:3px 8px;font-size:11px;">✕</button>`:''}
       </div>
      </article>
     `;
    }).join('')}
   </div>
  `:`
   <div class="panel" style="text-align:center;padding:16px;background:var(--surface);border:1px dashed var(--line);border-radius:12px;">
    <p class="subtle" style="margin:0;font-size:13px;">Nenhum comunicado ativo.</p>
   </div>
  `}
 </section>`:'';

 const gcsHtml=(tab==='all'||tab==='gcs')?`
 <section id="gc-showcase-section" style="margin-top:24px;">
  <div class="section-title" style="margin-bottom:14px;">
   <h2>Grupos de Crescimento (${cells.length})</h2>
  </div>
  <form data-gc-search class="sector-search"><label>Bairro ou nome<input name="q" maxlength="80"></label><label>Dia<input name="day" maxlength="30" placeholder="Ex.: sexta"></label><button>Filtrar</button><button type="reset">Limpar</button></form><p data-gc-results role="status"></p><div class="gc-showcase-grid">
   ${cells.map(gc=>{
    const alreadyPending=myApps.some(a=>a.target_type==='gc'&&(a.target_id?String(a.target_id)===String(gc.id):a.target_name.toLowerCase()===gc.name.toLowerCase())&&a.status==='pending');
    const banner=gc.banner_url||'/gc/gc-ide.webp';
    return `<article class="gc-banner-card">
     <div class="gc-banner-media">
      <img src="${e(banner)}" alt="${e(gc.name)}" loading="lazy"/>
      <span class="gc-day-pill">${e(gc.meeting_day||'Terça | 19h30')}</span>
     </div>
     <div class="gc-banner-body">
      <div class="gc-banner-head">
       <h3>${e(gc.name)}</h3>
       <span class="badge">${e(gc.neighborhood||'Lagoinha')}</span>
      </div>
      <p class="gc-banner-address">${e(gc.address||gc.neighborhood||'')}</p>
      <div class="gc-banner-meta">
       <span>${e(gc.leader_name||'Liderança')}</span>
       <span>${gc.member_count||0} membro(s)</span>
      </div>
      <button type="button" class="${alreadyPending?'secondary':''}" data-apply-gc="${e(gc.id)}" data-gc-name="${e(gc.name)}" data-gc-addr="${e(gc.address||gc.neighborhood||'')}" data-gc-banner="${e(banner)}">
       ${alreadyPending?'⏳ Solicitação enviada':'Participar'}
      </button>
     </div>
    </article>`;
   }).join('')}
  </div>
 </section>`:'';

 const ministriesHtml=(tab==='all'||tab==='ministries')?`
 <section id="ministry-showcase-section" style="margin-top:28px;">
  <div class="section-title" style="margin-bottom:14px;">
   <h2>Ministérios (${mins.length})</h2>
  </div>
  <div class="ministry-showcase-grid">
   ${mins.map(m=>{
    const meta=MINISTRY_META[m.name]||{tagline:'Ministério',description:'Equipe ministerial.',roles:['Voluntário','Equipe']};
    const alreadyPending=myApps.some(a=>a.target_type==='ministry'&&a.target_name.toLowerCase()===m.name.toLowerCase()&&a.status==='pending');
    const banner=meta.bannerUrl;
    return `<article class="ministry-showcase-card ${banner?'has-banner':''}">
     ${banner?`<div class="ministry-card-banner"><img src="${e(banner)}" alt="Ministério ${e(m.name)}" loading="lazy"/></div>`:''}
     <div class="ministry-showcase-top">
      ${banner?`<small class="ministry-tagline">${e(meta.tagline)}</small>`:ministryEmblem(m.name)}
      <div class="ministry-showcase-counts">
       <span class="badge">${m.total||0} ativo(s)</span>
      </div>
     </div>
     <div class="ministry-showcase-content">
      ${!banner?`<small class="ministry-tagline">${e(meta.tagline)}</small>`:''}
      <h3>${e(m.name)}</h3>
      <p>${e(meta.description||meta.desc)}</p>
      <div class="ministry-role-pills">
       ${(meta.roles||[]).slice(0,3).map(r=>`<span class="card-tag">${e(r)}</span>`).join('')}
      </div>
     </div>
     <button type="button" class="${alreadyPending?'secondary':''}" data-apply-ministry="${e(m.name)}" data-ministry-banner="${e(banner||'')}">
      ${alreadyPending?'⏳ Enviado':'Candidatar-se'}
     </button>
    </article>`;
   }).join('')}
  </div>
 </section>`:'';

 return `${myAppsHtml}${announcementsHtml}${gcsHtml}${ministriesHtml}<dialog id="community-apply-dialog"><div class="sector-modal"></div></dialog>`;
}

function openApplyModal(targetType,targetId,targetName,extra={}){
 const dialog=root.querySelector('#community-apply-dialog');
 if(!dialog)return;
 const meta=targetType==='ministry'?(MINISTRY_META[targetName]||{roles:['Voluntário','Integrante','Liderança']}):{roles:['Participante','Anfitrião','Auxiliar']};
 const roles=meta.roles||['Participante'];
 const bannerImg=extra.banner||meta.bannerUrl;

 dialog.querySelector('.sector-modal').innerHTML=`
  <div class="section-title">
   <h2>${targetType==='gc'?e(targetName):`Ministério ${e(targetName)}`}</h2>
   <button type="button" class="secondary" id="close-apply-modal">Fechar</button>
  </div>
  ${bannerImg?`<div style="border-radius:14px;overflow:hidden;max-height:200px;margin-bottom:14px;border:1px solid var(--line);"><img src="${e(bannerImg)}" alt="${e(targetName)}" style="width:100%;height:180px;object-fit:cover;display:block;"/></div>`:''}
  <form id="community-apply-form" class="record-form">
   <label>Nome
    <input value="${e(identity?.user?.name||'')}" disabled>
   </label>
   ${targetType==='gc' ? '<input type="hidden" name="role_desired" value="Participante">' : `<label>Função<select name="role_desired" required>${roles.map(r=>`<option value="${e(r)}">${e(r)}</option>`).join('')}</select></label>`}
   <label>Telefone
    <input name="phone" type="tel" required placeholder="(33) 99999-0000" value="${e(identity?.user?.phone||'')}" maxlength="40">
   </label>
   <label>Observações (opcional)
    <input name="notes" maxlength="400">
   </label>
   <p class="error" role="alert"></p>
   <button type="submit">Confirmar</button>
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

async function openPublishAnnouncementModal(){
 const dialog=root.querySelector('#community-apply-dialog');
 if(!dialog)return;
 const isRoot=identity?.platform_admin||identity?.pastor;
 const leaderModules=identity?.modules?.filter(m=>m.enabled&&['admin','pastor','editor'].includes(m.role))||[];

 dialog.querySelector('.sector-modal').innerHTML=`
  <div class="section-title">
   <h2>Novo Comunicado</h2>
   <button type="button" class="secondary" id="close-ann-modal">Fechar</button>
  </div>
  <form id="publish-announcement-form" class="record-form">
   <label>Título
    <input name="title" required maxlength="120">
   </label>
   <div class="form-grid-2">
    <label>Setor
     <select name="target_sector" required>
      ${isRoot?`<option value="all">Todos os Setores</option>`:''}
      ${(isRoot||leaderModules.some(m=>m.id==='kids'))?`<option value="kids">Kids</option>`:''}
      ${(isRoot||leaderModules.some(m=>m.id==='members'))?`<option value="members">Membros &amp; GCs</option>`:''}
      ${(isRoot||leaderModules.some(m=>m.id==='ministries'))?`<option value="ministries">Ministérios</option>`:''}
      ${(isRoot||leaderModules.some(m=>m.id==='finance'))?`<option value="finance">Financeiro</option>`:''}
      ${(!isRoot&&!leaderModules.length)?`<option value="all">Todos os Setores</option>`:''}
     </select>
    </label>
    <label>Data / Horário (opcional)
     <input name="event_date" placeholder="Ex.: 20/11 às 19h30" maxlength="40">
    </label>
   </div>
   <label>Local (opcional)
    <input name="location" maxlength="120">
   </label>
   <label>Destinatários
    <select name="audience"><option value="sector">Todos do setor</option><option value="leaders">Somente líderes</option><option value="people">Pessoas específicas</option></select>
   </label>
   <fieldset id="notice-people" hidden><legend>Selecione as pessoas</legend><div id="notice-recipients" style="max-height:180px;overflow:auto;"></div></fieldset>
   <div class="form-grid-2"><label>Publicar em (opcional)<input type="datetime-local" name="publish_at"></label><label>Expirar em (opcional)<input type="datetime-local" name="expires_at"></label></div><label><input type="checkbox" name="require_ack"> Exigir confirmação de leitura</label><p id="notice-audience-count" role="status"></p>
   <label>Mensagem
    <textarea name="message" rows="4" required maxlength="1000" style="width:100%;padding:10px;border-radius:10px;font:inherit;"></textarea>
   </label>
   <p class="error" role="alert"></p>
   <button type="submit">Publicar</button>
  </form>
 `;

 const noticeForm=dialog.querySelector('#publish-announcement-form');
 const announcementRequestId=crypto.randomUUID();
 let recipientRequest=0;
 async function loadNoticeRecipients(){
  const request=++recipientRequest;
  const people=noticeForm.elements.audience.value==='people';
  dialog.querySelector('#notice-people').hidden=!people;
  if(!people){try{const result=await api('/platform/announcement-recipients?sector='+encodeURIComponent(noticeForm.elements.target_sector.value));if(request===recipientRequest){const count=noticeForm.elements.audience.value==='leaders'?result.filter(p=>p.leader).length:result.length;dialog.querySelector('#notice-audience-count').textContent=count+' pessoa(s) na audiência selecionada.';}}catch{}return;}
  const list=dialog.querySelector('#notice-recipients');
  list.textContent='Carregando...';
  try{
   const result=await api('/platform/announcement-recipients?sector='+encodeURIComponent(noticeForm.elements.target_sector.value));
   if(request!==recipientRequest)return;
   dialog.querySelector('#notice-audience-count').textContent=result.length+' pessoa(s) disponíveis para seleção.';
   list.innerHTML=result.map(person=>`<label style="display:flex;gap:8px;align-items:center;min-height:44px;"><input type="checkbox" name="recipient_ids" value="${person.id}">${e(person.name)}</label>`).join('')||'Nenhuma pessoa disponível neste setor.';
  }catch(error){if(request===recipientRequest)list.textContent=error.message;}
 }
 noticeForm.elements.audience.onchange=()=>void loadNoticeRecipients();
 noticeForm.elements.target_sector.onchange=()=>void loadNoticeRecipients();
 void loadNoticeRecipients();
 dialog.querySelector('#close-ann-modal').onclick=()=>dialog.close();
 dialog.querySelector('#publish-announcement-form').onsubmit=async ev=>{
  ev.preventDefault();
  const f=ev.currentTarget,b=f.querySelector('button[type=submit]');
  b.disabled=true;
  try{
   const fd=new FormData(f);
   const res=await api('/platform/announcements',{
    method:'POST',
    body:{
     request_id:announcementRequestId,
     title:fd.get('title'),
     target_sector:fd.get('target_sector'),
     audience:fd.get('audience'),
     recipient_ids:fd.getAll('recipient_ids').map(Number),
     publish_at:fd.get('publish_at')||null,expires_at:fd.get('expires_at')||null,require_ack:fd.get('require_ack')==='on',
     event_date:fd.get('event_date')||null,
     location:fd.get('location')||null,
     message:fd.get('message')
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
 const personalOnly=false;
 const canHall=identity.platform_admin||identity.pastor||identity.modules.some(m=>m.id==='members'&&m.enabled);
 const tabs=(AREA_TABS[areaKey]||AREA_TABS.membro).filter(item=>(item.id!=='hall'||canHall)&&(item.id!=='reception'||['teacher','admin'].includes(identity.user.role)&&identity.modules.some(m=>m.id==='kids'&&m.enabled))&&(item.id!=='operations'||areaKey==='systems'||identity.platform_admin||identity.pastor||['admin','editor'].includes(module?.role))&&(item.id!=='groups'||identity.gc_leader||identity.platform_admin||identity.pastor||identity.modules.some(m=>m.id==='members'&&m.enabled&&['admin','editor'].includes(m.role))));
 if(!tabs.some(tItem=>tItem.id===activeSectionTab))activeSectionTab='all';

 const currentTabObj=tabs.find(tItem=>tItem.id===activeSectionTab)||tabs[0];
 const unreadCount=identity?.notification_unread_count??(identity?.notifications||[]).filter(n=>!n.read_at).length;

 const visibleModules=identity.platform_admin&&!isMemberPortal
  ?identity.modules
  :identity.modules.filter(m=>m.enabled);

 const sidebarTabsHtml=tabs.map(tItem=>`
  <button type="button" class="platform-nav-btn ${activeSectionTab===tItem.id?'active':''}" data-switch-tab="${e(tItem.id)}">
   <span class="nav-btn-icon" aria-hidden="true">${uiIcon(tItem.icon,22)}</span>
   <span>${e(tItem.label)}</span>
  </button>
 `).join('');

 const sectorLinksHtml=`
  ${identity.platform_admin?`<a class="platform-nav-link ${!module&&!isMemberPortal?'active':''}" href="/systems"><span class="nav-btn-icon">${uiIcon('systems')}</span><span>${t("nav.systems", "Painel TI")}</span></a>`:''}
  <a class="platform-nav-link ${isMemberPortal?'active':''}" href="/membro"><span class="nav-btn-icon">${uiIcon('identity')}</span><span>${t("nav.member", "Área do Membro")}</span></a>
  ${identity.modules.filter(m=>m.enabled).map(m=>`<a class="platform-nav-link ${module?.id===m.id?'active':''}" href="${m.url}"><span class="nav-btn-icon">${uiIcon(m.id)}</span><span>${e(m.name.replace('Lagoinha ',''))}</span></a>`).join('')}
 `;

 const bottomTabs=[...tabs.slice(0,4),...tabs.filter(t=>t.id==='account'&&!tabs.slice(0,4).some(x=>x.id==='account'))];
 const bottomNavHtml=bottomTabs.map(tItem=>`
  <button type="button" class="platform-bnav-item ${activeSectionTab===tItem.id?'active':''}" data-switch-tab="${e(tItem.id)}">
   <span class="bnav-emoji" aria-hidden="true">${uiIcon(tItem.icon,22)}</span>
   <span>${e(tItem.label)}</span>
  </button>
 `).join('');

 const meta=brandMeta[areaKey]||brandMeta.systems;

 root.innerHTML=`<div class="platform-shell">
  <aside class="platform-sidebar" aria-label="Menu principal">
   <div class="platform-sidebar-top">
    ${brand(areaKey)}
    <div class="sidebar-group">
     <small class="sidebar-group-label">${e(meta.word)}</small>
     <nav class="platform-sidebar-nav" aria-label="Seções da área">
      ${sidebarTabsHtml}
     </nav>
    </div>
    <div class="sidebar-group">
     <small class="sidebar-group-label">Setores</small>
     <nav class="platform-sidebar-nav" aria-label="Alternar setor">
      ${sectorLinksHtml}
     </nav>
    </div>
   </div>
   <div class="platform-sidebar-bottom">
    <div class="sidebar-user-card">
     <button type="button" id="account-profile" class="quiet" aria-label="Meu perfil">${identity.user.avatar_url?`<img src="${e(identity.user.avatar_url)}" alt="Sua foto" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`:`<span class="avatar mini">${e(initials(identity.user.name))}</span>`}</button>
     <div class="sidebar-user-info">
      <strong>${e(identity.user.name)}</strong>
      <small>${identity.platform_admin?'Admin TI':identity.pastor?'Pastor(a)':'Membro'}</small>
     </div>
     <button type="button" class="quiet topbar-btn-compact" id="sidebar-logout" title="Sair">${uiIcon('exit',18)} ${t("nav.sign_out", "Sair")}</button>
    </div>
    <div class="aux-controls-bar" aria-label="Preferências">
     <button type="button" class="aux-btn" id="topbar-qr-btn" title="QR Code" aria-label="QR Code para instalar o aplicativo">${uiIcon('qr',18)}</button>
     <button type="button" class="aux-btn" id="topbar-theme-btn" title="Tema">${getTheme()==='dark' ? '☀️' : '🌙'}</button>
     <select id="topbar-lang-select" class="aux-lang-select" aria-label="Idioma">
      ${SUPPORTED_LANGS.map(l=>`<option value="${l.code}" ${l.code===getLang()?'selected':''}>${l.flag} ${l.code.toUpperCase()}</option>`).join('')}
     </select>
    </div>
   </div>
  </aside>
  <div class="platform-main">
   <header class="platform-topbar">
    <div class="topbar-left">
     <div class="mobile-only-brand">${brand(areaKey)}</div>
     <div class="desktop-breadcrumb">
      <span>Lagoinha ${e(meta.word)}</span>
      <span class="crumb-sep">›</span>
      <strong>${e(currentTabObj?.label||'Início')}</strong>
     </div>
    </div>
    <div class="topbar-user-area">
     <button type="button" class="quiet topbar-btn-compact" id="topbar-profile-btn" aria-label="Meu perfil">${uiIcon('identity',18)}</button><button type="button" class="quiet topbar-btn-compact" id="topbar-notif-btn" title="Notificações">${uiIcon('notifications',18)} ${t("nav.notices", "Avisos")}${unreadCount?`<span class="badge notif-count-badge">${unreadCount}</span>`:''}</button>
     <button type="button" class="quiet topbar-btn-compact" id="logout">${uiIcon('exit',18)} ${t("nav.sign_out", "Sair")}</button>
    </div>
   </header>
   <div class="mobile-sector-switcher" aria-label="Atalhos de setores">
    ${sectorLinksHtml}
   </div>
   <label class="mobile-section-picker">Seção<select data-mobile-section>${tabs.map(t=>`<option value="${e(t.id)}" ${t.id===activeSectionTab?'selected':''}>${e(t.label)}</option>`).join('')}</select></label>
   <main class="workspace page-enter">
    ${!module&&activeSectionTab==='all'?portalHero(module,selected):''}
    <p class="status" role="status">${e(message)}</p>
    ${notificationsBanner()}

    ${module?moduleView(module):`
     ${activeSectionTab==='all'&&visibleModules.length?`
      <div class="section-title" style="margin-bottom:14px;">
       <h2>${isMemberPortal?'Meus Setores':'Setores'}</h2>
      </div>
      <section class="grid" aria-label="Sistemas disponíveis">${visibleModules.map(card).join('')}</section>
     `:''}
     ${isMemberPortal?memberCommunityPortal(activeSectionTab):''}
    `}
    ${identity.platform_admin&&!module&&!isMemberPortal?`
     ${(activeSectionTab==='permissions')?permissions():''}
     ${(activeSectionTab==='audit')?auditSection():''}
    `:''}
   </main>
   <nav class="platform-bottom-nav" aria-label="Navegação inferior">
    ${bottomNavHtml}
   </nav>
  </div>
 </div>`;

 root.querySelector('[data-gc-search]')?.addEventListener('submit',async event=>{event.preventDefault();const f=event.currentTarget,rows=await api('/workspace/groups/search?q='+encodeURIComponent(f.elements.q.value)+'&day='+encodeURIComponent(f.elements.day.value));const ids=new Set(rows.map(x=>String(x.id)));root.querySelectorAll('.gc-showcase-grid .gc-banner-card').forEach(card=>{card.hidden=!ids.has(card.querySelector('[data-apply-gc]')?.dataset.applyGc);});root.querySelector('[data-gc-results]').textContent=rows.length+' GC(s) encontrado(s).';});
 root.querySelector('[data-gc-search]')?.addEventListener('reset',()=>{root.querySelectorAll('.gc-showcase-grid .gc-banner-card').forEach(card=>card.hidden=false);root.querySelector('[data-gc-results]').textContent='';});
 if(WORK_TABS.has(activeSectionTab)){root.querySelector('.workspace').innerHTML='<div id="work-root"></div>';void operationsUI.mount(root.querySelector('#work-root'),activeSectionTab,areaKey);}
 if(isMemberPortal&&activeSectionTab==='hall'&&canHall)void portalHall.mount(root.querySelector('#member-hall-root'));
 if(!WORK_TABS.has(activeSectionTab)&&module?.enabled&&module.id!=='kids'){if(personalOnly)void personal.mount(root.querySelector('#sector-content'),module.id);else void sectors.mount(module,activeSectionTab);}

 root.querySelector('[data-mobile-section]')?.addEventListener('change',event=>{root.querySelector('[data-switch-tab="'+event.target.value+'"]')?.click();event.target.value=activeSectionTab;});
 root.querySelectorAll('[data-switch-tab]').forEach(btn=>btn.addEventListener('click',()=>{
  const nextTab=btn.dataset.switchTab||'all';
  const previousTab=activeSectionTab;
  activeSectionTab=nextTab;
  if(WORK_TABS.has(nextTab)||WORK_TABS.has(previousTab)){history.replaceState({},'',location.pathname+location.search+'#'+nextTab);render();return;}
  const recordTools=root.querySelector('[data-record-tools]');if(recordTools)recordTools.style.display=nextTab==='hall'?'none':'flex';
  history.replaceState({},'',location.pathname+location.search+'#'+nextTab);
  if(module?.enabled&&module.id!=='kids'){
   root.querySelectorAll('[data-switch-tab]').forEach(b=>b.classList.toggle('active',b.dataset.switchTab===nextTab));
   const crumb=root.querySelector('.desktop-breadcrumb strong');
   const tObj=tabs.find(x=>x.id===nextTab);
   if(crumb&&tObj)crumb.textContent=tObj.label;
   if(!personalOnly)sectors.setTab(nextTab);
   window.scrollTo({top:0,behavior:'smooth'});
  }else{
   render(message);
   window.scrollTo({top:0,behavior:'smooth'});
  }
 }));

 root.querySelector('#open-my-profile-hero')?.addEventListener('click',()=>accountProfileUI({api,e,onSaved:profileSaved}).open());
  root.querySelectorAll('[data-schedule-respond]').forEach(b=>{
   b.onclick=async()=>{
    const sid=b.dataset.scheduleRespond;
    const status=b.dataset.status;
    if(status==='declined'){
     let dlg=root.querySelector('#community-apply-dialog')||document.querySelector('#community-apply-dialog');
     if(!dlg){
      dlg=document.createElement('dialog');
      dlg.id='community-apply-dialog';
      dlg.innerHTML='<div class="sector-modal"></div>';
      root.append(dlg);
     }
     dlg.querySelector('.sector-modal').innerHTML=`
      <div class="section-title">
       <h2>Informar Indisponibilidade</h2>
       <button type="button" class="secondary" id="close-decl-modal">Voltar</button>
      </div>
      <p style="margin:0 0 14px;font-size:13.5px;color:var(--muted,#71717a);line-height:1.5;">
       Você confirma que <strong>não poderá comparecer</strong> a esta escala? A liderança e coordenação serão avisadas para reorganizar a equipe do culto.
      </p>
      <form id="decline-schedule-form">
       <label style="display:block;margin-bottom:6px;font-size:13px;font-weight:600;">Motivo da indisponibilidade (opcional)
        <textarea name="reason" rows="3" maxlength="200" placeholder="Ex.: Viagem a trabalho, compromisso familiar..." style="width:100%;margin-top:6px;padding:10px;border:1px solid var(--border,#e4e4e7);border-radius:10px;font:inherit;box-sizing:border-box;resize:vertical;"></textarea>
       </label>
       <p class="error" role="alert" style="color:#ef4444;font-size:12.5px;margin:6px 0;"></p>
       <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button type="button" class="secondary" id="cancel-decl-modal" style="min-height:38px;">Cancelar</button>
        <button type="submit" class="btn danger" style="background:#dc2626;color:#ffffff;min-height:38px;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;">✕ Confirmar Indisponibilidade</button>
       </div>
      </form>`;
     dlg.querySelector('#close-decl-modal').onclick=()=>dlg.close();
     dlg.querySelector('#cancel-decl-modal').onclick=()=>dlg.close();
     dlg.querySelector('#decline-schedule-form').onsubmit=async(ev)=>{
      ev.preventDefault();
      const reason=ev.currentTarget.elements.reason.value.trim();
      dlg.close();
      b.disabled=true;
      try{
       await api(`/ministries/schedules/${sid}/respond`,{method:'POST',body:{status:'declined',reason}});
       communityData=await api('/platform/community');
       render('Indisponibilidade comunicada à coordenação.');
      }catch(err){
       b.disabled=false;
       alert(err.message);
      }
     };
     dlg.showModal();
     return;
    }
    b.disabled=true;
    try{
     await api(`/ministries/schedules/${sid}/respond`,{method:'POST',body:{status,reason:''}});
     communityData=await api('/platform/community');
     render('Presença confirmada na escala!');
    }catch(err){
     b.disabled=false;
     alert(err.message);
    }
   };
  });

 if(module?.enabled&&!personalOnly&&module.id!=='kids'&&!WORK_TABS.has(activeSectionTab)){
  const container=root.querySelector('#sector-content');
  const bar=document.createElement('div');
  bar.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;';bar.dataset.recordTools='true';if(activeSectionTab==='hall')bar.style.display='none';
  const archiveButton=document.createElement('button');
  archiveButton.type='button';archiveButton.className='secondary';archiveButton.textContent='Arquivados';
  archiveButton.onclick=()=>void personal.archives(module.id,()=>sectors.mount(module,activeSectionTab)).catch(error=>{root.querySelector('.status').textContent=error.message;});
  bar.append(archiveButton);
  container.before(bar);
 }
 const bindPushBtn=(btn)=>{
  if(!btn)return;
  btn.onclick=async(event)=>{const b=event.currentTarget;b.disabled=true;try{await subscribeWebPush(api);b.textContent='Ativado ✓';}catch(error){b.disabled=false;b.textContent=t("nav.enable_notices", "Avisos");root.querySelector('.status').textContent=error.message;}};
 };
 bindPushBtn(root.querySelector('#enable-push'));
 root.querySelectorAll('[data-enable-push]').forEach(bindPushBtn);
 const handleLogout=async()=>{try{realtime.disconnect();await api('/auth/logout',{method:'POST'});identity=null;csrf='';users=[];await welcome('systems');login();}catch(error){render(error.message);}};
 root.querySelector('#logout')?.addEventListener('click',handleLogout);
 root.querySelector('#topbar-profile-btn')?.addEventListener('click',()=>accountProfileUI({api,e,onSaved:profileSaved}).open());
 root.querySelector('#account-profile')?.addEventListener('click',()=>accountProfileUI({api,e,onSaved:profileSaved}).open());
 root.querySelector('#sidebar-logout')?.addEventListener('click',handleLogout);
 root.querySelector('#topbar-theme-btn')?.addEventListener('click',()=>{toggleTheme();render(message);});
 root.querySelector('#topbar-lang-select')?.addEventListener('change',ev=>{setLang(ev.target.value);render(message);});
 translateDOM(root);
 root.querySelector('#topbar-qr-btn')?.addEventListener('click',()=>openAppDownloadQrModal());
 root.querySelectorAll('[data-open-qr]').forEach(b=>b.addEventListener('click',()=>openAppDownloadQrModal()));
 root.querySelector('#topbar-notif-btn')?.addEventListener('click',()=>noticeCenter.open());
 const pushedNotice=new URLSearchParams(location.search).get('notice');
 if(pushedNotice&&/^\d+$/.test(pushedNotice)){
  const url=new URL(location.href);url.searchParams.delete('notice');history.replaceState(null,'',url);
  noticeCenter.open({noticeId:Number(pushedNotice)});
 }

 root.querySelector('#open-new-announcement-btn')?.addEventListener('click',()=>openPublishAnnouncementModal());
 root.querySelectorAll('[data-del-ann]').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!confirm('Arquivar este comunicado?'))return;
  btn.disabled=true;
  try{
   await api('/platform/announcements/'+btn.dataset.delAnn,{method:'DELETE'});
   communityData=await api('/platform/community');
   render('Comunicado arquivado.');
  }catch(err){
   root.querySelector('.status').textContent=err.message;
   btn.disabled=false;
  }
 }));

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
  render('Notificações marcadas como lidas.');
 });

 root.querySelectorAll('[data-apply-gc]').forEach(btn=>btn.addEventListener('click',()=>{
  openApplyModal('gc',btn.dataset.applyGc,btn.dataset.gcName,{address:btn.dataset.gcAddr,banner:btn.dataset.gcBanner});
 }));

 root.querySelectorAll('[data-apply-ministry]').forEach(btn=>btn.addEventListener('click',()=>{
  openApplyModal('ministry',btn.dataset.applyMinistry,btn.dataset.applyMinistry,{banner:btn.dataset.ministryBanner});
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
  try{const r=await api('/workspace/invitations',{method:'POST',body:Object.fromEntries(new FormData(form))});await load();const status=root.querySelector('.status');status.textContent='Convite criado. Entregue este link somente à pessoa identificada: ';const input=document.createElement('input');input.readOnly=true;input.value=r.url;status.append(input);}catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{b.disabled=false;}
 });

 root.querySelectorAll('[data-grant]').forEach(form=>form.addEventListener('submit',async event=>{
  event.preventDefault();const b=form.querySelector('button');b.disabled=true;const d=new FormData(form);
  try{
   await api(`/platform/users/${form.dataset.user}/modules/${form.dataset.grant}`,{method:'PUT',body:{role:d.get('role'),enabled:d.get('enabled')==='on',scopes:d.getAll('scope').includes('')?[]:d.getAll('scope')}});
   await load();root.querySelector('.status').textContent='Permissão atualizada.';
  }catch(error){form.querySelector('[role=alert]').textContent=error.message;}finally{b.disabled=false;}
 }));

 root.querySelectorAll('[data-user-patch]').forEach(btn=>btn.addEventListener('click',async()=>{
  const uid=btn.dataset.uid,kind=btn.dataset.userPatch;
  btn.disabled=true;
  try{
   if(kind==='toggle-active'){
    const active=btn.dataset.active==='true';
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{active:!active}});
    await load();root.querySelector('.status').textContent=!active?'Conta reativada.':'Conta bloqueada.';
   }else if(kind==='toggle-admin'){
    const isAdmin=btn.dataset.admin==='true';
    if(!confirm(isAdmin?'Remover acesso de TI? A pessoa ficará limitada aos demais acessos atribuídos.':'Conceder acesso de TI? A pessoa poderá alterar todos os setores e permissões.')){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{platform_admin:!isAdmin}});
    await load();root.querySelector('.status').textContent='Privilégio atualizado.';
   }else if(kind==='toggle-pastor'){
    const isPastor=btn.dataset.pastor==='true';
    if(!confirm(isPastor?'Remover acesso pastoral? Os acessos setoriais atribuídos permanecem.':'Conceder acesso pastoral? A pessoa poderá alterar todos os setores, exceto a área de TI.')){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{pastor:!isPastor}});
    await load();root.querySelector('.status').textContent=isPastor?'Cargo Pastoral removido.':'Cargo Pastor / Pastora concedido.';
   }else if(kind==='reset-pwd'){
    const pwd=prompt('Nova senha (mínimo 12 caracteres):');
    if(!pwd){btn.disabled=false;return;}
    await api(`/platform/users/${uid}`,{method:'PATCH',body:{password:pwd}});
    await load();root.querySelector('.status').textContent='Senha redefinida.';
   }
  }catch(error){root.querySelector('.status').textContent=error.message;btn.disabled=false;}
 }));

 root.querySelector('#load-global-audit')?.addEventListener('click',async ev=>{
  const b=ev.currentTarget;b.disabled=true;b.textContent='Carregando...';
  try{
   auditData=await api('/platform/audit');
   render('Auditoria carregada.');
  }catch(error){root.querySelector('.status').textContent=error.message;b.disabled=false;b.textContent='Carregar Auditoria';}
 });
}

function card(m){
 const badgeHtml = !m.enabled ? '<span class="badge">Restrito</span>' : (m.status !== 'operational' ? '<span class="badge">Em breve</span>' : '');
 return `<article class="card ${m.enabled?'':'locked'}" data-module="${e(m.id)}">${sectorEmblem(m.id)}${badgeHtml}<h2>${e(m.name)}</h2><p>${e(descriptions[m.id])}</p>${m.enabled?`<a class="button" href="${m.url}">Abrir →</a>`:'<p class="subtle">Solicite acesso ao líder.</p>'}</article>`;
}

function moduleView(m){if(!m.enabled)return `<section class="panel"><h2>Acesso restrito</h2><a class="button secondary" href="/membro">Voltar</a></section>`;return '<div id="sector-content"><p>Carregando…</p></div>';}

function permissions(){
 const filteredUsers=users.filter(u=>!userSearch||(u.name+' '+u.email).toLowerCase().includes(userSearch.toLowerCase()));
 return `<section class="permissions" id="permissions-section"><div class="permissions-header"><div><h2>Usuários e Permissões</h2></div><label style="min-width:240px;font-size:13px;font-weight:600;">Buscar<input id="user-filter-input" value="${e(userSearch)}" placeholder="Nome ou e-mail..." maxlength="100"></label></div><details class="panel"><summary><strong>+ Novo usuário</strong></summary><form id="create-identity" class="create-identity"><label>Nome<input name="name" required minlength="2" maxlength="100" autocomplete="name"></label><label>E-mail<input name="email" type="email" required maxlength="200" autocomplete="email"></label><p class="subtle">A pessoa define a própria senha por um link individual.</p><p class="error" role="alert"></p><button>Criar usuário</button></form></details>${filteredUsers.map(u=>`<details class="panel"><summary><span class="avatar mini">${e(initials(u.name))}</span><strong>${e(u.name)}</strong><span>${e(u.email)}</span>${!u.active?'<span class="badge" style="background:#fee2e2;color:#991b1b;">Bloqueado</span>':''}${u.pastor?'<span class="badge" style="background:#fef3c7;color:#92400e;border-color:#fde68a;">Pastor(a)</span>':''}${u.platform_admin?'<span class="badge">Admin TI</span>':`<span class="badge">${u.pastor?'Todos os setores':`${(u.grants||[]).filter(g=>g.enabled).length} setor(es)`}</span>`}</summary><div style="display:flex;flex-wrap:wrap;gap:8px;padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:8px;"><button type="button" class="secondary" data-user-patch="reset-pwd" data-uid="${u.id}">Redefinir senha</button><button type="button" class="secondary" data-user-patch="toggle-pastor" data-uid="${u.id}" data-pastor="${Boolean(u.pastor)}">${u.pastor?'Remover Pastor(a)':'Definir Pastor(a)'}</button>${u.id!==identity.user.id?`<button type="button" class="secondary" data-user-patch="toggle-active" data-uid="${u.id}" data-active="${u.active}">${u.active?'Bloquear':'Reativar'}</button><button type="button" class="secondary" data-user-patch="toggle-admin" data-uid="${u.id}" data-admin="${u.platform_admin}">${u.platform_admin?'Remover Admin TI':'Tornar Admin TI'}</button>`:'<span class="subtle" style="align-self:center;">Sua conta</span>'}</div>${u.platform_admin?'':Object.entries(names).map(([id,name])=>{const g=u.grants.find(g=>g.module===id);const roles=id==='kids'?['admin','pastor','teacher','parent']:['admin','pastor','editor','viewer'];const selectedScopes=(()=>{try{return g?.scope?.startsWith('[')?JSON.parse(g.scope):g?.scope?[g.scope]:[];}catch{return [];}})();const scopeSelect=id==='ministries'?`<label>Ministérios<select name="scope" multiple size="5"><option value="" ${!selectedScopes.length?'selected':''}>Todos os ministérios</option>${MINISTRY_CATALOG.map(m=>`<option value="${e(m)}" ${selectedScopes.includes(m)?'selected':''}>${e(m)}</option>`).join('')}</select></label>`:'';return `<form class="grant" data-user="${u.id}" data-grant="${id}" style="${id==='ministries'?'grid-template-columns:minmax(160px,1.2fr) minmax(150px,1fr) minmax(180px,1fr) auto;':''}"><label class="check"><input name="enabled" type="checkbox" ${g?.enabled||u.pastor?'checked':''}>${e(name)}</label><label>Perfil<select name="role">${roles.map(role=>`<option value="${role}" ${role===(u.pastor?'pastor':(g?.role||(id==='kids'?'parent':'viewer')))?'selected':''}>${roleNames[role]}</option>`).join('')}</select></label>${scopeSelect}<button>Salvar</button><p role="alert" class="error"></p></form>`;}).join('')}</details>`).join('')}</section>`;
}

function auditSection(){
 return `<section class="panel" style="margin-top:24px;">
  <div class="section-title">
   <h2>Auditoria e Backup</h2>
   <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <button type="button" class="secondary" id="load-global-audit">${auditData?'Atualizar':'Carregar Auditoria'}</button>
    <a class="button secondary" href="/api/platform/backup" download="lagoinha-systems-backup.json">Exportar dados JSON</a>
   </div>
  </div>
  ${auditData?`<div class="sector-insights-grid" style="margin-top:16px;margin-bottom:0;">
   <div class="insight-card">
    <div class="insight-head"><h3>Acessos</h3><span class="badge">${(auditData.security_logs||[]).length}</span></div>
    <div class="insight-list" style="max-height:300px;overflow-y:auto;">
     ${(auditData.security_logs||[]).slice(0,25).map(l=>`<div class="insight-item"><div><strong>${e(l.action)}</strong><small>${e(l.actor_name)} (${e(l.actor_email||'sistema')})</small></div><small>${e(new Date(l.created_at).toLocaleString('pt-BR'))}</small></div>`).join('')}
    </div>
   </div>
   <div class="insight-card">
    <div class="insight-head"><h3>Alterações nos Setores</h3><span class="badge">${(auditData.module_logs||[]).length}</span></div>
    <div class="insight-list" style="max-height:300px;overflow-y:auto;">
     ${(auditData.module_logs||[]).slice(0,25).map(l=>`<div class="insight-item"><div><strong>[${e(l.module.toUpperCase())}] ${e(l.action)}</strong><small>${e(l.actor_name)}</small></div><small>${e(new Date(l.created_at).toLocaleString('pt-BR'))}</small></div>`).join('')||'<p class="subtle">Sem registros.</p>'}
    </div>
   </div>
  </div>`:''}
 </section>`;
}

await welcome(currentAreaKey());
const resetToken=new URLSearchParams(location.search).get('reset')||new URLSearchParams(location.hash.slice(1)).get('reset');
if(resetToken){history.replaceState(null,'',location.pathname);recoveryScreen({root,api,e,login,token:resetToken});}
else {try{const me=await api('/me');csrf=me.csrf;await load();realtime.connect(csrf,'');}catch{login();}}

if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});

function updateTopBadge(count){
 const button=root.querySelector('#topbar-notif-btn');if(!button)return;
 button.querySelector('.notif-count-badge')?.remove();
 if(count){const badge=document.createElement('span');badge.className='badge notif-count-badge';badge.textContent=count>99?'99+':String(count);button.append(badge);}
}

async function refreshNoticeBadge(){
 if(!identity||document.hidden)return;
 try{
  const next=await api('/notification-center/summary');identity.notification_unread_count=next.unread_count;
  updateTopBadge(next.unread_count);
 }catch{}
}
setInterval(()=>void refreshNoticeBadge(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshNoticeBadge();});
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{
 if(event.data?.type==='NEW_NOTICE'){void refreshNoticeBadge();noticeCenter.notify();}
});

realtime.on('notification:new', notice => {
 if (notice.unread_count !== undefined) {
  if (identity) identity.notification_unread_count = notice.unread_count;
  updateTopBadge(notice.unread_count);
 }
 noticeCenter.notify();
 showRealtimeToast({
  title: notice.title || 'Novo aviso',
  message: notice.message || '',
  onClick: () => noticeCenter.open({ noticeId: notice.id })
 });
});

realtime.on('notification:count', ({ unread_count }) => {
 if (identity) identity.notification_unread_count = unread_count;
 updateTopBadge(unread_count);
});

const editedForms=new WeakSet();
for(const name of ['input','change'])root.addEventListener(name,event=>{
 if(event.target.form)editedForms.add(event.target.form);
});
const communityRefresh=deferredRefresh({
 blocked:()=>!identity||document.hidden||hasPendingForms()||[...root.querySelectorAll('form')].some(form=>editedForms.has(form))||Boolean(document.querySelector('dialog[open]'))||Boolean(root.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select,[contenteditable="true"]')),
 key:()=>identity?.user?.id,
 read:()=>api('/platform/community'),
 apply:data=>{communityData=data;render();}
});
realtime.on('ministries:my_schedule',()=>void communityRefresh.request());
realtime.on('announcement:new',()=>void communityRefresh.request());
setInterval(()=>void communityRefresh.flush(),5000);

window.addEventListener('hashchange',()=>{if(!identity)return;activeSectionTab=location.hash.slice(1).split('/')[0]||'all';render();});
