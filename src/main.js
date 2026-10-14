import {createSchoolUI} from './school.js';
import {generateQR, openScannerModal, initUSBScannerListener} from './scanner.js';
import './style.css';
import './mobile.css';
import './auth.css';
import {Capacitor} from '@capacitor/core';
import {Camera,CameraResultType,CameraSource,CameraDirection} from '@capacitor/camera';
import {App} from '@capacitor/app';
import {PushNotifications} from '@capacitor/push-notifications';
import {LocalNotifications} from '@capacitor/local-notifications';

const app=document.getElementById('app'), modal=document.getElementById('modal');
const NATIVE=Capacitor.isNativePlatform();
const DEFAULT_TUNNEL='https://mountain-interactive-doors-suit.trycloudflare.com';
let storedServer='';
try{storedServer=NATIVE?(localStorage.getItem('kids_server')||DEFAULT_TUNNEL):'';}catch{}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
const S={apiOrigin:storedServer,token:'',user:null,csrf:'',rooms:[],lessons:[],events:[],eventAudience:'all',activePaging:[],activeGuests:[],selectedChild:null,selectedLesson:null,children:[],notifications:[],users:[],audit:[],page:'overview',search:'',room:'all',google:false,busy:false,stream:null,faceFile:null,faceUrl:null,faceMode:'enroll'};
const roles={admin:'Administração',teacher:'Professora / Professor',parent:'Responsável'};
const statusName={absent:'Não chegou',present:'Na salinha',departed:'Saída registrada'};
const paths={overview:'Visão geral',children:'Alunos',rooms:'Turmas',attendance:'Chamada',events:'Mural de Eventos',lessons:'Aulinhas',notifications:'Notificações',users:'Usuários e acessos',settings:'Minha conta'};
const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=(name)=>escape(name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join(''));
const icon=(name,size=20)=>{const shapes={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',kids:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v2"/>',rooms:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',check:'<path d="m5 12 4 4L19 6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12a2 2 0 0 0 4 0"/>',calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',speaker:'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',qrcode:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zm4 4h3v3h-3zm-4 4h3v-3h-3zm4-4h3v-3h-3z"/>',whatsapp:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',back:'<path d="M19 12H5m7 7-7-7 7-7"/>',face:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="9" cy="10" r=".5"/><circle cx="15" cy="10" r=".5"/><path d="M8 15q4 4 8 0"/>',out:'<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10"/>',shield:'<path d="m12 3 8 3v6q0 6-8 9-8-3-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',heart:'<path d="M12 21 3 12C-3 4 7-1 12 6 17-1 27 4 21 12Z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.home}</svg>`;};
const age=(birth)=>{const b=new Date(birth+'T12:00:00');const n=new Date();return n.getFullYear()-b.getFullYear()-(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate())?1:0);};
const time=(v)=>v?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)):'—';
function toast(text,error=false){const t=document.getElementById('toast');t.textContent=text;t.className='show'+(error?' error':'');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className='',5000);}
async function api(path,options={}){
 const headers={...(NATIVE?{'X-Native-Client':'1'}:{}),...(S.token?{'Authorization':'Bearer '+S.token}:{}),...(S.csrf?{'X-CSRF-Token':S.csrf}:{}),...options.headers};
 if(options.body && !(options.body instanceof FormData)){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
 let response;try{response=await fetch(S.apiOrigin+'/api'+path,{credentials:'include',...options,headers,signal:AbortSignal.timeout(15000)});}catch{setConnection(false);throw new Error('Sem conexão com o servidor. Tente novamente.');}
 setConnection(true);
 const data=await response.json();
 if(!response.ok){if(response.status===401 && S.user){S.user=null;renderLogin();}const err=new Error(data.detail?.message||data.detail?.[0]?.msg||'Não foi possível concluir a operação.');err.code=data.detail?.code;throw err;}
 return data;
}
function getSavedAccounts(){
 try{return JSON.parse(localStorage.getItem('kids_saved_accounts')||'[]');}catch{return [];}
}
function saveAccount(user){
 if(!user||!user.email)return;
 let accs=getSavedAccounts().filter(a=>a.email.toLowerCase()!==user.email.toLowerCase());
 accs.unshift({name:user.name,email:user.email.toLowerCase(),role:user.role,savedAt:Date.now()});
 try{localStorage.setItem('kids_saved_accounts',JSON.stringify(accs.slice(0,6)));}catch{}
}
function removeSavedAccount(email){
 let accs=getSavedAccounts().filter(a=>a.email.toLowerCase()!==email.toLowerCase());
 try{localStorage.setItem('kids_saved_accounts',JSON.stringify(accs));}catch{}
}
function authBrand(){
 return `<div class="auth-brand">
  <div class="auth-logo-badge">
    <img src="/logo.png" alt="Lagoinha Kids" class="auth-logo-img"/>
  </div>
  <div class="auth-brand-text">
    <span class="auth-brand-name">lagoinha <strong>kids</strong></span>
    <span class="auth-brand-tagline">CUIDADO QUE CONECTA</span>
  </div>
 </div>`;
}
function brand(){return `<div class="brand"><img src="/logo.png" alt="Logo Lagoinha"/><div>lagoinha <strong>kids</strong><small>CUIDADO QUE CONECTA</small></div></div>`;}
function renderLogin(register=false,prefillEmail=''){
 const saved=getSavedAccounts();
 const savedSection=(!register&&saved.length)?`<div class="saved-accounts-card"><div class="saved-accounts-head"><span>Acessos neste dispositivo</span><small>Toque para entrar</small></div><div class="saved-accounts-chips">${saved.map(a=>`<div class="saved-account-chip"><button type="button" class="saved-account-main" data-action="select-saved" data-email="${escape(a.email)}"><span class="avatar mini">${initials(a.name||a.email)}</span><div class="saved-account-text"><strong>${escape(a.name||a.email)}</strong><small>${escape(roles[a.role]||a.role||'Acesso')}</small></div></button><button type="button" class="saved-account-del" data-action="remove-saved" data-email="${escape(a.email)}" title="Remover conta deste aparelho" aria-label="Remover">✕</button></div>`).join('')}</div></div>`:'';
 const demoSection='';
 app.innerHTML=`<main class="auth-screen"><section class="auth-card">${authBrand()}<h1>${register?'Criar conta':'Bem-vindo'}</h1><p class="auth-subtitle">${register?'Seu acesso ao Lagoinha Kids.':'Entre para continuar.'}</p>${savedSection||demoSection}<form data-form="${register?'register':'login'}">${register?'<label>Nome<input name="name" autocomplete="name" required minlength="2" maxlength="100"/></label><label>Celular<input name="phone" type="tel" autocomplete="tel" maxlength="30"/></label>':''}<label>E-mail<input name="email" id="login-email" type="email" autocomplete="username" required maxlength="200" value="${escape(prefillEmail)}"/></label><label>Senha<div class="password-field"><input name="password" id="login-password" aria-label="Senha" type="password" autocomplete="${register?'new-password':'current-password'}" required ${register?'minlength="12"':''} maxlength="128"/><button type="button" data-action="toggle-password" aria-label="Mostrar senha">Ver</button></div></label>${!register?'<label id="login-otp-label" hidden>Código do autenticador<input name="otp" autocomplete="one-time-code" maxlength="40"/></label>':''}${register?'<label class="checkbox-label terms-choice"><input name="terms_accepted" type="checkbox" required/>Li e aceito os <button type="button" class="text-link" data-action="privacy-terms">termos e a política de privacidade</button>.</label>':'<button type="button" class="auth-forgot text-link" data-action="password-help">Esqueci minha senha</button>'}<p class="form-error" role="alert"></p><button class="btn primary full" type="submit">${register?'Criar conta':'Entrar'}</button></form>${S.google?'<div class="divider"><span>ou</span></div><button class="btn google full" data-action="google"><span class="google-g">G</span> Continuar com Google</button>':''}<p class="signup">${register?'Já tem conta?':'Primeiro acesso?'} <button data-action="${register?'login-screen':'register-screen'}">${register?'Entrar':'Criar conta'}</button></p><footer class="auth-footer"><button class="text-link" data-action="privacy-terms">Privacidade</button><button class="text-link" data-action="install-modal">Instalar app</button>${NATIVE?'<button class="text-link" data-action="server-options">Conexão</button>':''}</footer><p id="connection-status" class="connection-status" role="status" ${navigator.onLine?'hidden':''}>Sem conexão. Verifique sua internet.</p></section></main>`;
}
function welcome(){
 app.innerHTML=`<div class="welcome-screen" aria-label="Lagoinha Kids"><div class="welcome-logo-wrap"><img src="/logo.png" alt="Lagoinha Kids"/></div><div class="welcome-text"><strong>lagoinha kids</strong><small>CUIDADO QUE CONECTA</small></div></div>`;
 return new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:700));
}
function recoveryModal(){showModal('Recuperar acesso','Enviaremos um link para seu e-mail.',`<form data-form="recovery"><label>E-mail<input type="email" name="email" autocomplete="email" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Enviar link</button></form>`);}
function resetModal(token){showModal('Nova senha','Use pelo menos 12 caracteres.',`<form data-form="reset"><input type="hidden" name="token" value="${escape(token)}"/><label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required/></label><label>Confirmar senha<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="128" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Salvar senha</button></form>`);}
async function familyModal(ch){
 const family=await api(`/children/${ch.id}/family`);
 showModal('Responsáveis',escape(ch.name),`<div class="family-list">${family.map(u=>`<p><strong>${escape(u.name)}</strong> · ${u.primary_guardian?'Principal':'Autorizado para retirada'} ${!u.primary_guardian?`<button class="text-link" data-action="revoke-family" data-child="${ch.id}" data-user="${u.id}">Remover</button>`:''}</p>`).join('')}</div>${S.user.role==='admin'||ch.parent_id===S.user.id?`<form data-form="family-invite" data-id="${ch.id}"><label>E-mail de quem será autorizado<input name="email" type="email" required/></label><p class="soft-info">A pessoa deve aceitar o convite com uma conta deste e-mail. Compartilhe o link apenas com ela.</p><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Criar convite</button></form>`:''}`);
}
async function historyModal(ch){const rows=await api(`/children/${ch.id}/history`);showModal('Histórico',escape(ch.name),rows.length?rows.map(r=>`<article class="history-entry"><strong>${r.action==='in'?'Entrada':'Saída'} · ${new Date(r.created_at).toLocaleString('pt-BR')}</strong><p>${escape(r.guardian_name)}</p></article>`).join(''):'<p>Ainda não há registros de chegada e saída.</p>');}
async function load(){
 const [children,rooms,notifications,lessons,events,activePaging,users,audit,activeGuests]=await Promise.all([api('/children'),api('/rooms'),api('/notifications'),api('/lessons'),api('/events'),api('/paging/active'),S.user.role==='admin'?api('/users'):[],S.user.role==='admin'?api('/audit'):[],S.user.role!=='parent'?api('/guests/active'):[]]);
 Object.assign(S,{children,rooms,notifications,lessons,events,activePaging,users,audit,activeGuests});render();
}
function navItems(){
 if(S.user.role==='parent')return [['overview','Meus filhos','kids'],['events','Eventos','calendar'],['lessons','Aulinhas','clock'],['notifications','Avisos','bell']];
 if(S.user.role==='teacher')return [['rooms','Minhas turmas','rooms'],['attendance','Chamada','check'],['events','Eventos','calendar'],['notifications','Avisos','bell']];
 return [['overview','Visão geral','home'],['rooms','Turmas','rooms'],['children','Alunos','kids'],['attendance','Chamada','check'],['events','Eventos','calendar'],['notifications','Avisos','bell'],['users','Usuários e acessos','shield'],['settings','Minha conta','settings']];
}
function mobileNavItems(){
 if(S.user.role==='parent')return [['overview','Meus filhos','kids'],['events','Eventos','calendar'],['lessons','Aulinhas','clock'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 if(S.user.role==='teacher')return [['rooms','Turmas','rooms'],['attendance','Chamada','check'],['events','Eventos','calendar'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 return [['overview','Visão','home'],['rooms','Turmas','rooms'],['attendance','Chamada','check'],['events','Eventos','calendar'],['notifications','Avisos','bell'],['settings','Conta','settings']];
}
const navHistory=[];
let lastBackTime=0;

function initialPage(){
 if(!S.user)return 'overview';
 return S.user.role==='teacher'?'rooms':'overview';
}

function canGoBack(){
 return (navHistory.length>0)||(S.user&&S.page!==initialPage());
}

function navigateTo(page,replace=false){
 if(!allowDiscard())return;
 if(!replace&&S.page&&S.page!==page){
  navHistory.push(S.page);
  if(navHistory.length>30)navHistory.shift();
 }
 S.page=page;
 S.search='';
 S.room='all';
 try{history.pushState({page},'','#'+page);}catch{}
 render();
 void syncLive();
}

function handleBackButton(){
 if(!allowDiscard())return;
 if(modal&&modal.open){
  modal.close();
  return;
 }
 if(navHistory.length>0){
  const prev=navHistory.pop();
  S.page=prev;
  S.search='';
  S.room='all';
  render();
  void syncLive();
  return;
 }
 const home=initialPage();
 if(S.user&&S.page!==home){
  S.page=home;
  S.search='';
  S.room='all';
  render();
  void syncLive();
  return;
 }
 const now=Date.now();
 if(now-lastBackTime<2500){
  if(Capacitor.isNativePlatform()){
   App.exitApp();
  }else{
   toast('Saindo do aplicativo...');
   history.back();
  }
 }else{
  lastBackTime=now;
  try{history.pushState({page:home,exitNotice:true},'','#'+home);}catch{}
  toast('Pressione voltar novamente para sair do aplicativo');
 }
}

if(Capacitor.isNativePlatform()){
 App.addListener('backButton',()=>{
  handleBackButton();
 });
}
window.addEventListener('popstate',()=>{
 handleBackButton();
});

 function render(){
  if(!S.user)return renderLogin();
  const unread=S.notifications.filter(n=>!n.read_at).length;
  app.innerHTML=`<div class="shell"><aside class="sidebar" data-role="${S.user.role}">${brand()}<div class="sidebar-caption">NOSSO ESPAÇO</div><nav aria-label="Navegação principal">${navItems().map(([page,label,i])=>`<button class="nav-link ${S.page===page?'active':''}" data-page="${page}">${icon(i)}<span>${label}</span>${page==='notifications'&&unread?`<b class="notification-count">${unread}</b>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><button class="nav-link" data-action="install-modal" style="margin-bottom:8px;">${icon('arrow',16)}<span>Baixar App (APK / iOS)</span></button><div class="care-note"><span>✳</span><p>Pequenos passos.<br><strong>Grandes descobertas.</strong></p></div><button class="account" data-page="settings"><span class="avatar">${initials(S.user.name)}</span><span><strong>${escape(S.user.name.split(' ')[0])}</strong><small>${roles[S.user.role]}</small></span></button><button class="logout" data-action="logout">${icon('out',17)} Sair do aplicativo</button></div></aside><main><header class="topbar"><div class="topbar-left">${canGoBack()?`<button type="button" class="back-nav-btn" data-action="go-back" title="Voltar para a tela anterior" aria-label="Voltar para a tela anterior">${icon('back',16)}<span>Voltar</span></button>`:`<div class="topbar-brand" data-page="${initialPage()}"><img src="/logo.png" alt="Lagoinha" class="topbar-logo"/><div class="topbar-brand-text">lagoinha <strong>kids</strong></div></div>`}<div class="crumb-trail"><span class="crumb-prefix">Nosso espaço</span><span class="crumb-sep">/</span><strong>${S.user.role==='parent'&&S.page==='overview'?'Meus filhos':(paths[S.page]||'Aulinhas')}</strong></div></div><div class="top-actions">${S.user.role!=='parent'?`<button class="mini-button scanner-top-btn" data-action="open-scanner" title="Escanear Carteirinha QR" style="margin-right:8px;font-weight:600;">${icon('qrcode',15)} Check-in QR</button>`:''}<button class="mini-button" data-action="install-modal" title="Instalar aplicativo móvel" style="margin-right:8px;font-weight:600;">📱 Baixar App</button><span class="date">${new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date())}</span><button class="bell-button" data-page="notifications" aria-label="Abrir notificações" title="Avisos e recados">${icon('bell',20)}${unread?`<span class="bell-badge">${unread>99?'99+':unread}</span>`:''}</button><button class="avatar small" data-page="settings" title="Minha conta" aria-label="Minha conta">${initials(S.user.name)}</button><button class="logout-top-btn" data-action="logout" title="Sair da conta / Trocar de usuário" aria-label="Sair da conta">${icon('out',15)}<span>Sair</span></button></div></header><div class="page-content">${pageContent()}</div><footer class="app-footer">Lagoinha Kids · Cuidado que conecta <span>Ambiente seguro · Igreja Batista da Lagoinha</span></footer></main><nav class="mobile-bottom-nav" aria-label="Navegação móvel">${mobileNavItems().map(([page,label,i])=>`<button class="mobile-bottom-btn ${S.page===page?'active':''}" data-page="${page}">${icon(i,22)}<span>${label}</span>${page==='notifications'&&unread?`<b class="notification-count">${unread}</b>`:''}</button>`).join('')}</nav></div>`;
 app.querySelectorAll('table').forEach(table=>{const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent);table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>cell.dataset.label=labels[i]||''));});
}
function title(title,subtitle,button=''){return `<div class="page-heading"><div><span class="eyebrow">LAGOINHA KIDS</span><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`;}
function stat(label,value,helper,i,color){return `<article class="stat"><div><span>${label}</span><strong>${value}</strong><small>${helper}</small></div><span class="stat-icon" style="background:${color}">${icon(i,23)}</span></article>`;}
function filtered(){return S.children.filter(ch=>(S.room==='all'||String(ch.room_id)===S.room)&&ch.name.toLowerCase().includes(S.search.toLowerCase()));}
function filters(){return `<div class="filters"><label class="search">${icon('search',18)}<input id="student-search" placeholder="Buscar aluno pelo nome" value="${escape(S.search)}" aria-label="Buscar aluno pelo nome"/></label><select id="room-filter" aria-label="Filtrar turma"><option value="all">Todas as minhas turmas</option>${S.rooms.map(r=>`<option value="${r.id}" ${String(r.id)===S.room?'selected':''}>${escape(r.name)}</option>`).join('')}</select></div>`;}

function pagingAlertBanner(){
 if(!S.activePaging||!S.activePaging.length)return '';
 const hasAck = S.activePaging.some(p=>p.status==='on_my_way');
 return `<div class="paging-banner ${hasAck?'acknowledged':''}">
  <div class="paging-left">
   <span class="paging-dot ${hasAck?'green-dot':''}"></span>
   <div class="paging-details">
    <strong>📢 CHAMADO ATIVO NO TELÃO (${S.activePaging.length})</strong>
    ${S.activePaging.map(p=>`
      <div style="margin-top:4px;">
        <span><strong>${escape(p.child_name)}</strong> (${escape(p.room_name||'Salinha')}) · Motivo: ${escape(p.reason)} · <span class="paging-code">${escape(p.claim_code)}</span></span>
        ${p.status==='on_my_way'?`<span style="display:inline-block;margin-left:6px;background:#22c55e;color:#000000;font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:9999px;">🏃 Pais a caminho (${escape(p.ack_user_name||'Confirmado')})</span>`:`<span style="display:inline-block;margin-left:6px;background:#fef08a;color:#713f12;font-weight:700;font-size:10.5px;padding:2px 7px;border-radius:9999px;">⏳ Aguardando pais</span>`}
      </div>
    `).join('')}
   </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
   ${S.user.role==='parent'?`
     ${S.activePaging.map(p=>`
       ${p.status==='on_my_way'?`
         <span style="font-size:12px;color:#22c55e;font-weight:700;display:flex;align-items:center;gap:4px;background:rgba(34,197,94,0.15);padding:6px 12px;border-radius:8px;">✓ Você avisou que está a caminho!</span>
       `:`
         <button type="button" class="btn on-my-way-btn" data-action="on-my-way" data-id="${p.id}" data-child-id="${p.child_id}" style="background:#ffffff;color:#09090b;font-weight:700;font-size:13px;padding:9px 16px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 3px 12px rgba(0,0,0,0.3);">
           🏃 Estou a caminho!
         </button>
       `}
     `).join('')}
   `:''}
   ${S.user.role!=='parent'?`
     ${S.activePaging.map(p=>`<button class="mini-button" data-action="resolve-paging" data-id="${p.id}" style="background:#ffffff;color:#09090b;font-weight:700;">Concluir #${p.id}</button>`).join('')}
   `:''}
  </div>
 </div>`;
}

function eventsPage(){
 const staff=S.user.role!=='parent';
 const audience=S.eventAudience||'all';
 const filtered=S.events.filter(e=>{
  if(audience==='kids')return e.target_audience==='kids'||e.target_audience==='all';
  if(audience==='teens')return e.target_audience==='teens'||e.target_audience==='all';
  return true;
 });

 return `${title('Mural de Eventos','Acampamentos, EBF, Cultos e atividades para Kids e Teens.',staff?`<button class="btn primary" data-action="new-event">${icon('plus',17)} Novo evento</button>`:'')}
 <div class="filter-chips">
  <button class="filter-chip ${audience==='all'?'active':''}" data-action="filter-events" data-target="all">Todos os eventos</button>
  <button class="filter-chip ${audience==='kids'?'active':''}" data-action="filter-events" data-target="kids">Kids (0 a 11 anos)</button>
  <button class="filter-chip ${audience==='teens'?'active':''}" data-action="filter-events" data-target="teens">Teens (12 a 17 anos)</button>
 </div>
 ${filtered.length?`<div class="events-grid">${filtered.map(ev=>{
  const regCount=ev.registrations_count||0;
  const cap=ev.max_capacity||100;
  const pct=Math.min(100,Math.round((regCount/cap)*100));
  const isRegistered=ev.user_registered_children&&ev.user_registered_children.length>0;
  const audLabel=ev.target_audience==='kids'?'Kids (0 a 11)':ev.target_audience==='teens'?'Teens (12 a 17)':'Família / Todos';
  const start=new Date(ev.starts_at);
  const dateStr=new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(start);

  return `<article class="event-card">
   <div class="event-banner-wrap">
    ${ev.banner_url?`<img src="${escape(ev.banner_url)}" alt="${escape(ev.title)}" class="event-banner-img"/>`:`<div class="event-banner-placeholder">${icon('calendar',36)}<strong style="font-size:12px;letter-spacing:1px;">LAGOINHA KIDS & TEENS</strong></div>`}
    <span class="event-audience-tag">${audLabel}</span>
   </div>
   <div class="event-body">
    <span class="event-category">${escape(ev.category)}</span>
    <h2>${escape(ev.title)}</h2>
    <p class="event-desc">${escape(ev.description)}</p>
    <div class="event-meta-list">
     <div class="event-meta-item">${icon('clock',16)} <span>${dateStr}</span></div>
     <div class="event-meta-item">${icon('home',16)} <span>${escape(ev.location||'Templo Lagoinha')}</span></div>
     <div class="event-meta-item">${icon('kids',16)} <span>Faixa etária: ${ev.min_age} a ${ev.max_age} anos</span></div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#71717a;margin-bottom:6px;">
     <span>${regCount} participante${regCount===1?'':'s'}</span>
     <span>${cap-regCount>0?`${cap-regCount} vagas restantes`:'Vagas esgotadas'}</span>
    </div>
    <div class="event-capacity-bar">
     <div class="event-capacity-fill" style="width:${pct}%"></div>
    </div>
    <div class="event-footer">
     <span class="event-price">${escape(ev.price)}</span>
     ${isRegistered?`<button class="btn secondary" data-action="cancel-event-reg" data-id="${ev.id}">Inscrito ✓ (Cancelar)</button>`:`<button class="btn primary" data-action="register-event" data-id="${ev.id}" ${regCount>=cap?'disabled':''}>${regCount>=cap?'Esgotado':'Inscrever'}</button>`}
    </div>
    ${staff?`<div class="event-staff-actions">
     <button class="mini-button" data-action="edit-event" data-id="${ev.id}">${icon('settings',14)} Editar</button>
     <button class="mini-button danger-button" data-action="delete-event" data-id="${ev.id}">${icon('trash',14)||''} Excluir</button>
    </div>`:''}
   </div>
  </article>`;
 }).join('')}</div>`:empty('Nenhum evento nesta categoria','Acompanhe o mural para ficar por dentro dos próximos encontros!')}`;
}

function roster(children,compact=false){return children.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Situação</th><th>${compact?'Entrada':'Responsável'}</th><th>Ações</th></tr></thead><tbody>${children.map(ch=>{
  const parentPhone=ch.parent_phone||'';
  return `<tr><td><div class="person"><span class="kid-avatar" style="background:${ch.color}">${initials(ch.name)}</span><div><strong>${escape(ch.name)}</strong><small>${age(ch.birthday)} anos ${ch.face_enrolled?'· Facial ativo':''}</small>${ch.allergies?`<span class="allergy-badge" title="Alergia: ${escape(ch.allergies)}">⚠️ ${escape(ch.allergies)}</span>`:''}${ch.special_needs?`<span class="allergy-badge special" title="Necessidade Especial: ${escape(ch.special_needs)}">♿ ${escape(ch.special_needs)}</span>`:''}</div></div></td><td><span class="room-label">${escape(ch.room_name)}</span></td><td><span class="status ${ch.status}"><i></i>${statusName[ch.status]}</span>${ch.claim_code?`<span class="claim-tag-badge">TAG: ${escape(ch.claim_code)}</span>`:''}</td><td>${compact?time(ch.in_at):escape(ch.parent_name||'Aguardando vínculo')}</td><td><div class="row-actions"><button class="mini-button" data-action="attendance" data-id="${ch.id}">${ch.status==='present'?'Registrar saída':'Registrar entrada'}</button><button class="icon-button" title="Carteirinha Digital" aria-label="Carteirinha de ${escape(ch.name)}" data-action="digital-id" data-id="${ch.id}">${icon('qrcode',18)}</button>${S.user.role!=='parent'&&ch.status==='present'?`<button class="mini-button" data-action="paging-call" data-id="${ch.id}" title="Chamar responsável no telão">${icon('speaker',15)} Telão</button>`:''}${parentPhone?`<a href="https://wa.me/55${parentPhone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá! Sou da equipe do Lagoinha Kids sobre ${ch.name}.`)}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn" title="Conversar no WhatsApp">${icon('whatsapp',14)} Whats</a>`:''}<button class="icon-button" title="Conferência facial auxiliar" aria-label="Conferência facial de ${escape(ch.name)}" data-action="face" data-id="${ch.id}">${icon('face',18)}</button><button class="icon-button" title="Notificar responsável" aria-label="Notificar responsável de ${escape(ch.name)}" data-action="notify" data-kind="please_pickup" data-id="${ch.id}">${icon('bell',18)}</button>${!compact&&S.user.role==='admin'?`<button class="icon-button" title="Vincular responsável" aria-label="Vincular responsável a ${escape(ch.name)}" data-action="link-guardian" data-id="${ch.id}">${icon('kids',18)}</button>`:''}</div></td></tr>`;
}).join('')}</tbody></table></div>`:empty('Nenhum aluno por aqui','Ajuste a busca ou cadastre o primeiro aluno da turma.');}
function empty(title,sub){return `<div class="empty">${icon('heart',30)}<h3>${title}</h3><p>${sub}</p></div>`;}
function unreadBanner(){
 const unread=S.notifications.filter(n=>!n.read_at).length;
 if(!unread || S.page==='notifications') return '';
 const latest=S.notifications.find(n=>!n.read_at);
 return `<aside class="unread-banner" data-page="notifications" role="alert" tabindex="0">
  <div class="unread-banner-icon">${icon('bell', 20)}</div>
  <div class="unread-banner-content">
   <strong>${unread === 1 ? '1 novo recado da salinha' : `${unread} novos recados da salinha`}</strong>
   <p>${escape(latest?.title ? `${latest.title}: ${latest.message}` : 'Toque para conferir os recados da equipe.')}</p>
  </div>
  <div class="unread-banner-action">
   <span>Ver avisos</span> ${icon('arrow', 14)}
  </div>
 </aside>`;
}
function pageContent(){
 const body=renderInnerPage();
 return `<div class="page-enter">${unreadBanner()}${pagingAlertBanner()}${body}</div>`;
}
function renderInnerPage(){
 const simplePage=school.page();if(simplePage!==null)return simplePage;
 const p=S.user.role==='parent';
 if(S.page==='overview'){
  const present=S.children.filter(ch=>ch.status==='present').length,departed=S.children.filter(ch=>ch.status==='departed').length;
   return `${title(`Olá, ${escape(S.user.name.split(' ')[0])} <span class="wave">✦</span>`,'Um novo encontro. Muitas histórias para acolher.')}<section class="welcome"><div><span class="pill">${icon('heart',13)} CADA CRIANÇA IMPORTA</span><h2>Mais presença.<br>Mais cuidado. <em>Mais conexão.</em></h2><p>Organize a salinha e mantenha as famílias por perto.<br>Vamos fazer de hoje um dia especial?</p><button class="btn dark" data-page="attendance">Abrir chamada ${icon('arrow',17)}</button></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section><div class="stats">${stat('Alunos cadastrados',S.children.length,'Nas suas turmas','kids','#f4f4f5')}${stat('Na salinha agora',present,'Presença confirmada pela equipe','check','#f4f4f5')}${stat('Saídas registradas',departed,'Com responsável conferido','out','#f4f4f5')}${stat('Minhas turmas',S.rooms.length,'Espaços para crescer','rooms','#f4f4f5')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Presenças de hoje</h2><p>Acompanhe quem já chegou.</p></div><button class="text-link" data-page="attendance">Ver chamada ${icon('arrow',16)}</button></div>${roster(S.children.slice(0,5),true)}</section><section class="panel room-summary"><div class="panel-heading"><div><h2>Um lugar para cada um</h2><p>O movimento das suas turmas.</p></div><button class="text-link" data-page="rooms">Gerenciar turmas ${icon('arrow',16)}</button></div>${S.rooms.map(r=>`<button class="room-summary-item" data-action="filter-room" data-id="${r.id}"><span class="room-symbol" style="background:${r.color}">${icon('rooms',18)}</span><div><strong>${escape(r.name)}</strong><small>${r.min_age} a ${r.max_age} anos</small><div class="progress"><i style="width:${Math.min(100,r.present/r.capacity*100)}%;background:${r.color}"></i></div></div><span>${r.present}<small>/${r.capacity}</small></span></button>`).join('')}<div class="note-soft">${icon('shield',17)} Entradas e saídas sempre confirmadas por uma pessoa da equipe.</div></section></div>`;
 }
 if(S.page==='events')return eventsPage();
 if(S.page==='notifications'){
  const unread=S.notifications.filter(n=>!n.read_at).length;
  const markAllBtn = unread ? `<button class="btn secondary" data-action="mark-all-read">${icon('check',16)} Marcar todas como lidas</button>` : '';
  const pushActive = hasPushPermission();
  const pushBanner = pushActive ? `
    <div class="push-status-card enabled">
      <div class="push-card-content">
        <div class="push-icon-bubble active">${icon('check', 20)}</div>
        <div>
          <strong>Notificações no celular ativadas ✓</strong>
          <p>Você receberá alertas na tela de bloqueio mesmo com o aplicativo fechado.</p>
        </div>
      </div>
      <div class="push-card-actions">
        <button class="mini-button secondary" data-action="test-push-notification" title="Testar envio de notificação">${icon('bell', 14)} Testar alerta</button>
      </div>
    </div>
  ` : `
    <div class="push-status-card">
      <div class="push-card-content">
        <div class="push-icon-bubble">${icon('bell', 22)}</div>
        <div>
          <strong>Ativar notificações no celular</strong>
          <p>Receba avisos instantâneos de check-in, saída e chamadas das professoras fora do app.</p>
        </div>
      </div>
      <div class="push-card-actions">
        <button class="btn primary push-action-btn" data-action="open-push-modal">${icon('bell', 16)} Ativar agora</button>
      </div>
    </div>
  `;
  return `${title('Avisos','Recados da equipe e da família.', markAllBtn)}${pushBanner}<section class="panel notifications">${S.notifications.length?S.notifications.map(n=>`<article class="notification ${n.read_at?'read':'unread'}"><span class="notification-icon">${icon(n.kind==='attendance'?'check':'bell',22)}</span><div><div class="notification-meta"><span class="notification-tag">${escape(n.child_name||'Lagoinha Kids')}</span> · ${new Date(n.created_at).toLocaleDateString('pt-BR')} às ${time(n.created_at)}</div><h3>${escape(n.title)}</h3><p>${escape(n.message)}</p><small>De ${escape(n.sender_name||'Equipe')}</small></div>${!n.read_at?`<button class="mini-button" data-action="read" data-id="${n.id}">Marcar como lida</button>`:'<span class="read-label">Lida ✓</span>'}</article>`).join(''):empty('Tudo tranquilo por aqui','Os avisos para você aparecerão neste espaço.')}</section>`;
 }if(S.page==='users'&&S.user.role==='admin')return `${title('Pessoas que cuidam.','Gerencie os acessos e as turmas da sua equipe.',`<button class="btn primary" data-action="new-user">${icon('plus',17)} Novo usuário</button>`)}<section class="panel"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Turmas</th><th>Acesso</th><th>Ações</th></tr></thead><tbody>${S.users.map(u=>`<tr><td><div class="person"><span class="avatar">${initials(u.name)}</span><span><strong>${escape(u.name)}</strong><small>${escape(u.email)}</small></span></div></td><td>${roles[u.role]}</td><td>${u.role==='teacher'?u.rooms.map(id=>escape(S.rooms.find(r=>r.id===id)?.name)).join(', ')||'Nenhuma atribuída':'—'}</td><td><span class="status ${u.active?'present':'departed'}">${u.active?'Ativo':'Desativado'}</span></td><td><button class="mini-button" data-action="edit-user" data-id="${u.id}">Gerenciar</button></td></tr>`).join('')}</tbody></table></div></section>`;
 if(S.page==='settings')return settingsPage();
 return '';
}
function settingsPage(){return `${title('Seu espaço, seu acesso.','Confira sua conta e escolha como entrar.')}<div class="settings-grid"><section class="panel settings-panel"><h2>Minha conta</h2><div class="profile"><span class="avatar big">${initials(S.user.name)}</span><div><h3>${escape(S.user.name)}</h3><p>${escape(S.user.email)}</p><span class="tag">${roles[S.user.role]}</span></div></div><button type="button" class="btn secondary full logout-panel-btn" data-action="logout" style="margin-top:14px;border:1.5px solid #18181b;display:flex;align-items:center;justify-content:center;gap:8px;">${icon('out',17)} <strong>Sair desta conta / Trocar de usuário</strong></button><button class="btn secondary full" data-action="revoke-sessions" style="margin-top:12px">Encerrar outros acessos</button><div style="margin-top:14px;padding:12px 14px;border:1.5px solid #e4e4e7;border-radius:10px;background:#fafafa;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"><strong style="font-size:13px;display:flex;align-items:center;gap:6px;color:#09090b;">${icon('bell', 16)} Notificações no celular</strong><span class="push-status-pill">${hasPushPermission() ? 'Ativadas ✓' : 'Desativadas'}</span></div><p style="font-size:11.5px;color:#71717a;margin:0 0 10px 0;line-height:1.4;">Alertas de check-in, saída e chamadas das tias fora do app.</p><button type="button" class="btn secondary full" data-action="${hasPushPermission() ? 'test-push-notification' : 'open-push-modal'}">${hasPushPermission() ? '🔔 Enviar notificação de teste' : '🔔 Configurar e Ativar Notificações'}</button></div>${S.user.role==='admin'?'<button class="btn secondary full" data-action="mfa" style="margin-top:12px">Autenticação em dois fatores</button>':''}${!S.user.email_verified?'<button class="btn secondary full" data-action="verify-email" style="margin-top:12px">Confirmar meu e-mail</button>':'<p class="muted-note">E-mail confirmado</p>'}<hr/><h3>Vínculo Google</h3><p>${S.user.google_linked?'Sua conta Google está vinculada.':'Vincule a conta Google do mesmo e-mail após entrar com sua senha.'}</p><button class="btn secondary" data-action="google-link"><span class="google-g">G</span> ${S.user.google_linked?'Conta Google vinculada':'Vincular conta Google'}</button><button type="button" class="btn secondary full" data-action="privacy-terms" style="margin-top:10px;border:1px solid #27272a;">${icon('shield',16)} Política de Privacidade & LGPD</button>${!S.google?'<p class="muted-note">A integração aguarda configuração pela equipe de desenvolvimento.</p>':''}</section><section class="panel settings-panel"><h2>Trocar minha senha</h2><p>Use uma senha exclusiva com pelo menos 12 caracteres.</p><form data-form="password"><label>Senha atual<input type="password" name="current" autocomplete="current-password" required maxlength="128"/></label><label>Nova senha<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="128"/></label><label>Confirmar nova senha<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="128"/></label><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Salvar nova senha</button></form></section></div>${S.user.role==='admin'?`<section class="panel audit-panel"><div class="panel-heading"><div><h2>Histórico administrativo</h2><p>Últimas ações registradas no aplicativo.</p></div><span class="tag">Auditoria</span></div><div class="table-wrap"><table><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Aluno</th></tr></thead><tbody>${S.audit.slice(0,30).map(a=>`<tr><td>${new Date(a.created_at).toLocaleDateString('pt-BR')} · ${time(a.created_at)}</td><td>${escape(a.actor_name)}</td><td>${escape(a.action)}</td><td>${a.child_id?escape(S.children.find(ch=>ch.id===a.child_id)?.name||a.child_id):'—'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;}

function showModal(title,subtitle,html){modal.querySelector('#modal-content').innerHTML=`<div class="modal-heading"><div><span class="eyebrow">LAGOINHA KIDS</span><h2>${title}</h2><p>${subtitle}</p></div><button class="icon-button" data-action="close" aria-label="Fechar">${icon('close')}</button></div>${html}`;modal.showModal();}
async function privacyModal(){
 try{
  const d=await api('/terms/privacy');
  showModal(d.title,d.controller,`<div class="privacy-modal-body"><p class="soft-info" style="margin-bottom:12px;"><strong>${escape(d.summary)}</strong> (Versão ${escape(d.version)})</p><div class="privacy-sections">${d.sections.map(s=>`<div class="privacy-sec" style="margin-bottom:12px;"><strong style="display:block;margin-bottom:4px;font-size:14px;">${escape(s.title)}</strong><p style="font-size:13px;color:#71717a;line-height:1.5;">${escape(s.text)}</p></div>`).join('')}</div><button type="button" class="btn primary full" data-action="close" style="margin-top:14px;">Entendido e ciente</button></div>`);
 }catch{
  showModal('Política de Privacidade','Lagoinha Kids',`<p>O Lagoinha Kids trata dados com base no Art. 14 da LGPD para salvaguarda e cuidado dos menores durante os cultos. Nenhuma foto é armazenada no servidor.</p><button type="button" class="btn primary full" data-action="close">Fechar</button>`);
 }
}
function installModal(){
 showModal('Instalar no celular','Acesse em tela cheia no iPhone ou instale o APK nativo no Android.',`<div class="install-guide">
  <div class="install-option-card">
   <div class="install-option-head"><span class="install-badge">ANDROID (APK NATIVO)</span><h3>Instalador Direto (.apk)</h3></div>
   <p>Instale o aplicativo Android compilado para testes no dispositivo com câmera nativa e alta performance.</p>
   <a href="/download/lagoinha-kids.apk" download="lagoinha-kids.apk" class="btn primary full install-link">${icon('arrow',18)} Baixar APK Android</a>
   <small class="helper-text">Ao abrir o arquivo, confirme "Instalar mesmo assim" ou habilite fontes desconhecidas no navegador.</small>
  </div>
  <div class="install-option-card">
   <div class="install-option-head"><span class="install-badge">IPHONE / IOS</span><h3>Adicionar à Tela de Início</h3></div>
   <p>No iPhone (iOS), adicione instantaneamente à tela de início sem precisar de conta de desenvolvedor da Apple:</p>
   <ol class="install-steps">
    <li>Abra este endereço no <strong>Safari</strong> do seu iPhone.</li>
    <li>Toque no botão de <strong>Compartilhar</strong> (quadrado com seta).</li>
    <li>Role e escolha <strong>"Adicionar à Tela de Início"</strong>.</li>
    <li>O ícone abrirá em tela cheia, como aplicativo nativo!</li>
   </ol>
  </div>
  <div class="install-option-card">
   <div class="install-option-head"><span class="install-badge">CHROME / WEB</span><h3>Instalar Web App (PWA)</h3></div>
   <p>No Google Chrome do celular ou computador, instale como aplicativo web:</p>
   <button type="button" class="btn secondary full" data-action="pwa-prompt">${icon('plus',18)} Instalar via Google Chrome</button>
  </div>
 </div>`);
}
const optionsParents=()=>'<option value="">Vincular depois</option>'+S.users.filter(u=>u.role==='parent'&&u.active).map(u=>`<option value="${u.id}">${escape(u.name)} · ${escape(u.email)}</option>`).join('');
async function attendanceModal(ch){
 if(!ch.parent_id)return toast('Peça à administração para vincular um responsável antes da entrada ou saída.',true);
 const out=ch.status==='present';
 showModal(out?'Um até logo com cuidado.':'Que bom que você chegou.',`${out?'Registrar saída':'Registrar entrada'} de ${escape(ch.name)}`,
  `<div class="guardian-box">${icon('shield',25)}<div><span>RESPONSÁVEL VINCULADO</span><strong>${escape(ch.parent_name)}</strong></div></div>
  ${ch.allergies?`<div class="allergy-alert-box" style="margin:10px 0;padding:10px;background:#18181b;border:1px solid #3f3f46;border-radius:8px;font-size:13px;"><strong style="color:#ffffff;">⚠️ Alergia / Cuidado Médico:</strong> <span style="color:#e4e4e7;">${escape(ch.allergies)}</span>${ch.emergency_medication?`<div style="color:#a1a1aa;margin-top:4px;"><small>Medicação de emergência: ${escape(ch.emergency_medication)}</small></div>`:''}</div>`:''}
  ${ch.authorized_pickups?`<div style="margin:8px 0;font-size:12px;color:#a1a1aa;"><span>Pessoas autorizadas a retirar: </span><strong style="color:#ffffff;">${escape(ch.authorized_pickups)}</strong></div>`:''}
  <form data-form="attendance" data-id="${ch.id}" data-direction="${out?'out':'in'}"><label>Responsável presente<select name="guardian_id">${family.map(u=>`<option value="${u.id}">${escape(u.name)}</option>`).join('')}</select></label>
   ${!out?`<div class="claim-info-note" style="margin:8px 0 12px;padding:8px 12px;background:#09090b;border:1px solid #27272a;border-radius:6px;font-size:12px;color:#a1a1aa;">Ao confirmar a entrada, o sistema gerará uma <strong>Etiqueta de Segurança (Claim Tag de 4 dígitos)</strong> pareada para a criança e para o responsável.</div>`:`<div class="claim-checkout-note" style="margin:8px 0 12px;padding:10px;background:#09090b;border:1px solid #27272a;border-radius:6px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#a1a1aa;margin-bottom:6px;">PROTOCOLO DE RETIRADA (NO TAG, NO CHILD)</div><label style="font-size:13px;display:block;margin-bottom:8px;">Código da Etiqueta do Responsável (4 caracteres):<input name="claim_code" type="text" maxlength="4" style="text-transform:uppercase;font-size:18px;font-weight:700;letter-spacing:4px;text-align:center;margin-top:4px;" placeholder="Código" ${S.user.role==='admin'?'':'required'}/></label>${S.user.role==='admin'?'<details class="child-extra"><summary>Exceção administrativa</summary><p class="soft-info">Use somente após conferir presencialmente o responsável. O motivo ficará registrado na auditoria.</p><label>Motivo da exceção<textarea name="exception_reason" minlength="15" maxlength="300"></textarea></label></details>':''}</div>`}
   <label class="checkbox-label"><input name="confirmed" type="checkbox" required/>Conferi presencialmente a identidade ${out?'e a Etiqueta de Segurança':'do responsável vinculado'} e autorizo este registro.</label>
   <p class="soft-info">Uma comparação facial ou notificação não substitui essa conferência presencial.</p>
   <p class="form-error" role="alert"></p>
   <button class="btn primary full" type="submit">Confirmar ${out?'saída':'entrada'} ${icon('check',18)}</button>
  </form>`);
}
function notifyModal(ch,kind){if(!ch.parent_id&&S.user.role!=='parent')return toast('Este aluno ainda não tem responsável vinculado.',true);const texts={please_pickup:['Chamar o responsável',`Solicitar a presença do responsável de ${ch.name}.`],arriving:['Estamos a caminho!',`Avisar a equipe que você está levando ${ch.name}.`],pickup_ready:['Cheguei para buscar',`Avisar a equipe que você chegou para buscar ${ch.name}.`],consent_request:['Solicitar autorização facial',`O responsável receberá um aviso para conhecer a conferência facial de ${ch.name}.`]};const [t,sub]=texts[kind];showModal(t,escape(sub),`<form data-form="notify" data-id="${ch.id}" data-kind="${kind}"><label>Recado para ${S.user.role==='parent'?'a equipe':'o responsável'}<textarea name="message" rows="3" maxlength="400" placeholder="Escreva uma orientação breve (opcional)"></textarea></label><p class="soft-info">O aviso aparece dentro do aplicativo. Para uma urgência, também entre em contato diretamente com a equipe ou a família.</p><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Enviar aviso interno ${icon('bell',18)}</button></form>`);}
function consentModal(ch){showModal('Um cuidado que você escolhe.',`Conferência facial auxiliar de ${escape(ch.name)}`,`<div class="soft-info"><strong>Como funciona?</strong><p>A equipe cadastra uma foto autorizada e guarda um descritor facial protegido. Na conferência, seleciona seu filho e compara uma nova foto. O recurso é experimental, não testa prova de vida e nunca libera a saída sozinho.</p><p>Você pode recusar ou revogar. A chamada e o atendimento manual continuam disponíveis. Ao revogar, o descritor é excluído do banco ativo.</p></div><form data-form="consent" data-id="${ch.id}">${ch.face_allowed?'<p>Você já autorizou este recurso.</p>':'<label class="checkbox-label"><input name="allow" type="checkbox" required/>Sou responsável por esta criança e autorizo o cadastro e a comparação facial auxiliar no Lagoinha Kids.</label>'}<p class="form-error" role="alert"></p><button class="btn ${ch.face_allowed?'danger':'primary'} full" type="submit">${ch.face_allowed?'Revogar e excluir cadastro facial':'Registrar minha autorização'}</button></form>`);}
function faceModal(ch,mode){
 S.faceMode=mode||(ch.face_enrolled?'verify':'enroll');S.faceFile=null;if(S.faceUrl)URL.revokeObjectURL(S.faceUrl);S.faceUrl=null;
 showModal('Conferência facial auxiliar',escape(ch.name)+' · '+escape(ch.room_name),`${!ch.face_allowed?`<div class="soft-info">O responsável ainda não autorizou o recurso. A conferência manual continua disponível.</div>${ch.parent_id?`<button class="btn secondary full" data-action="request-consent" data-id="${ch.id}">Solicitar autorização ao responsável</button>`:''}`:`<div class="face-tabs"><button class="${S.faceMode==='enroll'?'selected':''}" data-action="face-mode" data-mode="enroll" data-id="${ch.id}">Cadastrar / atualizar</button><button class="${S.faceMode==='verify'?'selected':''}" data-action="face-mode" data-mode="verify" data-id="${ch.id}" ${!ch.face_enrolled?'disabled':''}>Conferir 1:1</button></div><form data-form="face" data-id="${ch.id}"><label class="face-drop" tabindex="0" role="button" aria-label="Selecionar retrato"><input type="file" id="face-input" accept="image/jpeg,image/png,image/webp" hidden/><div id="face-placeholder">${icon('face',44)}<strong>Selecionar foto autorizada</strong><span>Um rosto · JPG, PNG ou WebP · até 8 MB</span></div><img id="face-preview" alt="Retrato selecionado" hidden/></label><button type="button" class="btn secondary full" data-action="face-camera">${icon('face',18)} Capturar com a câmera</button><div id="camera-region" hidden><video id="face-video" autoplay muted playsinline></video><button type="button" class="btn dark full" data-action="face-snap">Capturar retrato</button></div><p class="soft-info">${S.faceMode==='enroll'?'Somente o descritor criptografado será salvo no servidor, vinculado a este aluno.':'O resultado é uma medida de similaridade, não uma confirmação de identidade.'} Modelo ainda não validado para crianças. Sem prova de vida. Não registra entrada ou saída.</p><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">${S.faceMode==='enroll'?'Salvar cadastro autorizado':'Comparar com cadastro'} ${icon('arrow',18)}</button><div id="face-result" aria-live="polite"></div></form>${ch.face_enrolled?`<button class="text-link danger-link" data-action="delete-face" data-id="${ch.id}">Excluir descritor cadastrado</button>`:''}`}`);
}
function userModal(user){showModal(user?'Gerenciar acesso':'Mais uma pessoa para cuidar.',user?escape(user.name):'Atribua o perfil adequado e as turmas de atuação.',`<form data-form="${user?'edit-user':'user'}" ${user?`data-id="${user.id}"`:''}>${user?`<label class="checkbox-label"><input type="checkbox" name="active" ${user.active?'checked':''}/>Acesso ativo</label>`:`<label>Nome completo<input name="name" required minlength="2" maxlength="100"/></label><label>E-mail<input name="email" type="email" required maxlength="200"/></label><label>Senha inicial<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" placeholder="Pelo menos 12 caracteres"/></label><label>Perfil<select name="role"><option value="teacher">Professor(a)</option><option value="parent">Responsável</option><option value="admin">Administração / desenvolvimento</option></select></label>`}<fieldset><legend>Turmas de atuação (perfil professor)</legend>${S.rooms.map(r=>`<label class="checkbox-label"><input type="checkbox" name="rooms" value="${r.id}" ${user?.rooms.includes(r.id)?'checked':''}/>${escape(r.name)}</label>`).join('')}</fieldset><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">${user?'Salvar acesso':'Criar usuário'}</button></form>`);}
function stopCamera(){S.stream?.getTracks().forEach(t=>t.stop());S.stream=null;}
modal.addEventListener('close',()=>{stopCamera();S.faceFile=null;if(S.faceUrl)URL.revokeObjectURL(S.faceUrl);S.faceUrl=null;});
modal.addEventListener('cancel',(e)=>{if(S.busy||!allowDiscard())e.preventDefault();});
function selectFace(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)return toast('Use JPG, PNG ou WebP de até 8 MB.',true);S.faceFile=file;if(S.faceUrl)URL.revokeObjectURL(S.faceUrl);S.faceUrl=URL.createObjectURL(file);document.getElementById('face-preview').src=S.faceUrl;document.getElementById('face-preview').hidden=false;document.getElementById('face-placeholder').hidden=true;}
document.addEventListener('change',e=>{if(e.target.id==='face-input')selectFace(e.target.files[0]);if(e.target.id==='room-filter'){S.room=e.target.value;updateRoster();}});
document.addEventListener('input',e=>{if(e.target.id==='student-search'){S.search=e.target.value;updateRoster();}});
function updateRoster(){document.getElementById('roster').innerHTML=roster(filtered(),S.page==='attendance');}
document.addEventListener('keydown',e=>{if(e.target.classList.contains('face-drop')&&['Enter',' '].includes(e.key)){e.preventDefault();document.getElementById('face-input').click();}});

function digitalIdModal(ch){
 const room=S.rooms.find(r=>r.id===ch.room_id)?.name||'Salinha';
 const code=ch.claim_code||`LK-${ch.id.toString().padStart(4,'0')}`;
 showModal('Carteirinha Digital',escape(ch.name),`<div class="digital-id-card">
  <div class="id-header">
   <span class="id-brand">LAGOINHA KIDS</span>
   <span class="id-tag">${escape(room)}</span>
  </div>
  <div class="id-person">
   <div class="id-avatar">${initials(ch.name)}</div>
   <div class="id-info">
    <h3>${escape(ch.name)}</h3>
    <p>${age(ch.birthday)} anos · Nasc. ${ch.birthday.slice(0,10)}</p>
    <p style="font-size:11px;color:#a1a1aa;margin-top:2px;">Resp.: ${escape(ch.parent_name||S.user.name)}</p>
   </div>
  </div>
  <div class="id-qr-box">
   ${generateQR(code)}
   <span class="id-claim-code">${code}</span>
   <small style="color:#71717a;font-size:10px;">Apresente no check-in / check-out</small>
  </div>
  ${ch.allergies?`<div class="id-alert-banner" style="margin-bottom:8px;">⚠️ <strong>ALERGIA:</strong> ${escape(ch.allergies)}</div>`:''}
  ${ch.special_needs?`<div class="id-alert-banner">♿ <strong>CUIDADO:</strong> ${escape(ch.special_needs)}</div>`:''}
 </div>
 <button type="button" class="btn secondary full" data-action="close" style="margin-top:14px;">Fechar carteirinha</button>`);
}

function pagingModal(ch){
 showModal('Chamar no Telão',escape(ch.name),`<form data-form="paging-call" data-id="${ch.id}">
  <p class="soft-info">Esta ação exibirá o código da criança e a mensagem nos painéis do auditório e enviará uma notificação urgente no celular do responsável.</p>
  <label>Motivo da chamada
   <select name="reason" required>
    <option value="Acolhimento da família necessário">Acolhimento da família necessário</option>
    <option value="Chorando com saudades dos pais">Chorando com saudades dos pais</option>
    <option value="Troca de fralda / roupa necessária">Troca de fralda / roupa necessária</option>
    <option value="Não está se sentindo bem / febre">Não está se sentindo bem / febre</option>
    <option value="Solicitação da liderança">Solicitação da liderança</option>
   </select>
  </label>
  <p class="form-error" role="alert"></p>
  <button class="btn primary full" type="submit">${icon('speaker',18)} Disparar chamado no telão</button>
 </form>`);
}

function guestCheckinModal(){
 showModal('Check-in Rápido de Visitante','Emita a etiqueta e o código de retirada em menos de 30 segundos.',`<form data-form="guest-checkin">
  <label>Nome da criança<input name="child_name" required minlength="2" maxlength="100" placeholder="Nome completo da criança visitante"/></label>
  <div class="form-grid">
   <label>Idade da criança<input name="child_age" type="number" min="0" max="17" required placeholder="Idade"/></label>
   <label>Turma / Salinha<select name="room_id" required>${S.rooms.map(r=>`<option value="${r.id}">${escape(r.name)} (${r.min_age} a ${r.max_age} anos)</option>`).join('')}</select></label>
  </div>
  <label>Nome do responsável visitante<input name="guardian_name" required minlength="2" maxlength="100" placeholder="Nome do pai/mãe"/></label>
  <label>WhatsApp do responsável<input name="guardian_phone" type="tel" required minlength="8" maxlength="30" placeholder="Ex.: 31988887777"/></label>
  <label>Alergias ou observações importantes<input name="allergies" placeholder="Ex.: Alergia a amendoim (ou deixe em branco)"/></label>
  <p class="form-error" role="alert"></p>
  <button class="btn primary full" type="submit">Emitir Etiqueta & Código de Retirada</button>
 </form>`);
}

function eventFormModal(ev=null){
 const now=new Date();
 const d1=ev?ev.starts_at.slice(0,16):new Date(now.getTime()+86400000*7).toISOString().slice(0,16);
 const d2=ev?ev.ends_at.slice(0,16):new Date(now.getTime()+86400000*7+3600000*3).toISOString().slice(0,16);
 showModal(ev?'Editar Evento':'Novo Evento',ev?'Atualize as informações deste evento.':'Publique acampamentos, EBFs ou encontros para Kids e Teens.',`<form data-form="create-event" ${ev?`data-id="${ev.id}"`:''}>
  <label>Título do evento<input name="title" required minlength="2" maxlength="120" value="${escape(ev?.title||'')}" placeholder="Ex.: EBF Heróis da Fé"/></label>
  <label>Descrição completa<textarea name="description" rows="3" required minlength="5" maxlength="2000" placeholder="Conte os detalhes do evento, o que levar, programação...">${escape(ev?.description||'')}</textarea></label>
  <div class="form-grid">
   <label>Categoria<select name="category" required>
    ${['EBF','Acampamento','Culto Especial','Batismo','Musical','Passeio'].map(cat=>`<option value="${cat}" ${(ev?.category||'EBF')===cat?'selected':''}>${cat}</option>`).join('')}
   </select></label>
   <label>Público-alvo<select name="target_audience" required>
    <option value="all" ${(ev?.target_audience||'all')==='all'?'selected':''}>Todos / Família</option>
    <option value="kids" ${(ev?.target_audience)==='kids'?'selected':''}>Kids (0 a 11 anos)</option>
    <option value="teens" ${(ev?.target_audience)==='teens'?'selected':''}>Teens (12 a 17 anos)</option>
   </select></label>
  </div>
  <div class="form-grid">
   <label>Idade mínima<input name="min_age" type="number" min="0" max="17" value="${ev?.min_age??0}" required/></label>
   <label>Idade máxima<input name="max_age" type="number" min="0" max="17" value="${ev?.max_age??17}" required/></label>
  </div>
  <div class="form-grid">
   <label>Início<input name="starts_at" type="datetime-local" value="${d1}" required/></label>
   <label>Término<input name="ends_at" type="datetime-local" value="${d2}" required/></label>
  </div>
  <div class="form-grid">
   <label>Local<input name="location" value="${escape(ev?.location||'')}" placeholder="Ex.: Templo Principal / Sítio"/></label>
   <label>Valor / Preço<input name="price" value="${escape(ev?.price||'Gratuito')}" required/></label>
  </div>
  <label>Capacidade máxima de vagas<input name="max_capacity" type="number" min="1" max="1000" value="${ev?.max_capacity??100}" required/></label>
  <label>URL do banner (opcional)<input name="banner_url" value="${escape(ev?.banner_url||'')}" placeholder="https://..."/></label>
  <p class="form-error" role="alert"></p>
  <button class="btn primary full" type="submit">${ev?'Salvar Alterações':'Publicar Evento & Notificar Pais'}</button>
 </form>`);
}

function eventRegisterModal(ev){
 const eligible=S.children.filter(ch=>age(ch.birthday)>=ev.min_age&&age(ch.birthday)<=ev.max_age);
 showModal(`Inscrição: ${escape(ev.title)}`,`Faixa etária: ${ev.min_age} a ${ev.max_age} anos`,eligible.length?`<form data-form="register-event-child" data-id="${ev.id}">
  <label>Escolha o filho para inscrever
   <select name="child_id" required>
    ${eligible.map(ch=>`<option value="${ch.id}">${escape(ch.name)} (${age(ch.birthday)} anos)</option>`).join('')}
   </select>
  </label>
  <label>Observações para os líderes (alergias, cuidados...)
   <input name="notes" placeholder="Ex.: Leva bombinha para asma"/>
  </label>
  <p class="form-error" role="alert"></p>
  <button class="btn primary full" type="submit">Confirmar Inscrição 🎉</button>
 </form>`:`<p class="soft-info">Você não tem filhos cadastrados na faixa etária deste evento (${ev.min_age} a ${ev.max_age} anos). Cadastre seu filho em Meus filhos primeiro.</p><button type="button" class="btn primary full" data-action="close">Entendido</button>`);
}

const school=createSchoolUI({S,api,escape,icon,title,showModal,toast,refresh:load,render,age,statusName,time,navigateTo,openScanner:()=>openScannerModal({S,api,load,toast,showModal,modal,escape,icon,age,attendanceModal})});
initUSBScannerListener(S, (child, code) => {
 if (S.user && S.user.role !== 'parent') {
  openScannerModal({ S, api, load, toast, showModal, modal, escape, icon, age, attendanceModal });
  setTimeout(() => {
   const inp = document.getElementById('scanner-usb-input');
   if (inp) {
    inp.value = code;
    document.getElementById('scanner-usb-submit')?.click();
   }
  }, 100);
 }
});
document.addEventListener('change',event=>school.change(event));
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-page],[data-action]');if(!el)return;
 if(el.dataset.page){navigateTo(el.dataset.page);return;}
 if(S.busy)return;
 const action=el.dataset.action,ch=S.children.find(x=>x.id===Number(el.dataset.id));
 try{
 if(await school.action(action,el,ch))return;
 if(action==='guest-checkout'){showModal('Saída do visitante','Confira o responsável e o código entregue na chegada.',`<form data-form="guest-checkout" data-id="${Number(el.dataset.id)}"><label>Código de retirada<input name="claim_code" autocomplete="off" required maxlength="30"/></label><label class="checkbox-label"><input type="checkbox" name="confirmed" required/>Conferi presencialmente o responsável.</label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Confirmar saída</button></form>`);return;}
 if(action==='open-scanner'){openScannerModal({S,api,load,toast,showModal,modal,escape,icon,age,attendanceModal});return;}
 if(action==='filter-events'){S.eventAudience=el.dataset.target;render();return;}
 if(action==='new-event'){eventFormModal();return;}
 if(action==='edit-event'){const ev=S.events.find(x=>x.id===Number(el.dataset.id));if(ev)eventFormModal(ev);return;}
 if(action==='delete-event'){
  const ev=S.events.find(x=>x.id===Number(el.dataset.id));
  if(!ev)return;
  showModal('Excluir evento?','Confirmação de exclusão',`<form data-form="delete-event" data-id="${ev.id}"><p style="margin-bottom:12px;font-size:14px;color:#3f3f46;">Deseja realmente excluir o evento <strong>${escape(ev.title)}</strong>? Ele sairá imediatamente do mural.</p><label class="checkbox-label"><input type="checkbox" required/>Confirmo a exclusão deste evento.</label><p class="form-error" role="alert"></p><button class="btn danger full" type="submit">Excluir Evento</button></form>`);
  return;
 }
 if(action==='register-event'){const ev=S.events.find(x=>x.id===Number(el.dataset.id));if(ev)eventRegisterModal(ev);return;}
 if(action==='cancel-event-reg'){
  const ev=S.events.find(x=>x.id===Number(el.dataset.id));
  if(ev&&ev.user_registered_children&&ev.user_registered_children.length){
   for(const childId of ev.user_registered_children){
    await api(`/events/${ev.id}/register/${childId}`,{method:'DELETE'});
   }
   await load();
   toast('Inscrição cancelada.');
  }
  return;
 }
 if(action==='digital-id'){if(ch)digitalIdModal(ch);return;}
 if(action==='paging-call'){if(ch)pagingModal(ch);return;}
 if(action==='on-my-way'){
  const cid=Number(el.dataset.childId||0)||null;
  const pid=Number(el.dataset.id||0)||null;
  try{
    const res=await api('/paging/on-my-way',{method:'POST',body:{child_id:cid,paging_id:pid}});
    toast(`🏃 Resposta confirmada! A equipe e o administrativo foram avisados que você está a caminho de ${res.child_name||'seu filho'}.`);
    await load();
  }catch(err){
    toast(err.message||'Erro ao avisar a equipe.',true);
  }
  return;
 }
 if(action==='resolve-paging'){await api(`/paging/${el.dataset.id}/resolve`,{method:'POST'});await load();toast('Chamado no telão resolvido.');return;}
 if(action==='guest-checkin'){guestCheckinModal();return;}
 if(action==='go-back'){handleBackButton();return;}
 if(action==='set-server'){const url=new URL(document.getElementById('mobile-api').value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Informe apenas a origem HTTPS do servidor.');S.apiOrigin=url.origin;localStorage.setItem('kids_server',S.apiOrigin);const h=await api('/health');S.google=h.google_enabled;renderLogin();toast('Servidor configurado.');}
 if(action==='toggle-password'){const input=el.previousElementSibling;input.type=input.type==='password'?'text':'password';el.textContent=input.type==='password'?'Ver':'Ocultar';}
 if(action==='verify-email'){await api('/auth/email/send',{method:'POST'});toast('Confira seu e-mail para confirmar o endereço.');}
 if(action==='mfa')mfaModal();
 if(action==='enable-push')await enablePush();
 if(action==='revoke-sessions'){await api('/auth/sessions/revoke-others',{method:'POST'});toast('Outros acessos encerrados.');}
 if(action==='password-help')recoveryModal();
 if(action==='server-options')showModal('Conexão','Endereço informado pela equipe.',`<div class="native-server"><label>Servidor<input id="mobile-api" type="url" value="${escape(S.apiOrigin)}"/></label><button class="btn primary full" data-action="set-server">Aplicar servidor</button></div>`);
 if(action==='family')await familyModal(ch);
 if(action==='child-history')await historyModal(ch);
 if(action==='revoke-family'){await api(`/children/${el.dataset.child}/family/${el.dataset.user}`,{method:'DELETE'});modal.close();await load();toast('Vínculo removido.');}
 if(action==='apply-update'){if(modal.open||S.busy||document.querySelector('.page-content form')){toast('Conclua o formulário antes de atualizar.');return;}location.reload();}
 if(action==='retry-connection'){await load();toast('Conexão restabelecida.');}
 if(action==='register-screen')renderLogin(true);
 if(action==='login-screen')renderLogin();
 if(action==='google'||action==='google-link'){
  if(!S.google)return toast('A equipe precisa configurar o login Google. O acesso com e-mail e senha já está disponível.',true);
  if(Capacitor.isNativePlatform())return toast('O login Google nativo ainda precisa do adaptador do sistema. Use o acesso por senha ou a versão web.',true);
  location.href='/api/auth/google/start?mode='+(action==='google-link'?'link':'login');
 }
 if(action==='select-saved'){
  const email=el.dataset.email;
  const inp=document.getElementById('login-email'),pwd=document.getElementById('login-password');
  if(inp){
   inp.value=email;
   if(el.dataset.pass&&pwd)pwd.value=el.dataset.pass;
   pwd?.focus();
   toast(`Conta selecionada: ${email}`);
  }
  return;
 }
 if(action==='remove-saved'){
  removeSavedAccount(el.dataset.email);
  renderLogin(false);
  toast('Conta removida da lista deste aparelho.');
 }
 if(action==='logout'){await api('/auth/logout',{method:'POST'}).catch(()=>{});S.user=null;S.csrf='';S.token='';navHistory.length=0;renderLogin();toast('Sessão encerrada com sucesso.');}
 if(action==='open-push-modal')promptPushPermissionModal();
 if(action==='activate-notifications')await requestNotificationPermission(true);
 if(action==='dismiss-push-modal'){localStorage.setItem('lagoinha_push_dismissed_until',String(Date.now()+86400000*3));sessionStorage.setItem('lagoinha_push_session_dismissed','true');modal.close();}
 if(action==='test-push-notification')testSystemNotification();
 if(action==='enable-push')await requestNotificationPermission(true);
 if(action==='install-modal')installModal();
 if(action==='privacy-terms')privacyModal();
 if(action==='pwa-prompt'){if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(()=>{deferredPrompt=null;});}else{toast('No Chrome, toque no menu (⋮) e selecione "Instalar aplicativo".');}}
 if(action==='close'&&allowDiscard())modal.close();
 if(action==='attendance')await attendanceModal(ch);
 if(action==='notify')notifyModal(ch,el.dataset.kind);
 if(action==='consent')consentModal(ch);
 if(action==='face')faceModal(ch);
 if(action==='face-mode'){stopCamera();faceModal(ch,el.dataset.mode);}
 if(action==='request-consent'){modal.close();notifyModal(ch,'consent_request');}
 if(action==='filter-room'){S.room=String(el.dataset.id);navigateTo('attendance');return;}
 if(action==='new-user')userModal();
 if(action==='edit-user')userModal(S.users.find(u=>u.id===Number(el.dataset.id)));
 if(action==='read'){await api(`/notifications/${el.dataset.id}/read`,{method:'POST'});await load();toast('Notificação marcada como lida.');}
 if(action==='mark-all-read'){await api('/notifications/read-all',{method:'POST'});await load();toast('Todas as notificações foram marcadas como lidas.');}
 if(action==='delete-face'){showModal('Excluir cadastro facial?',`Somente o descritor de ${escape(ch.name)} será excluído.`, `<form data-form="delete-face" data-id="${ch.id}"><p>A chamada manual permanece disponível. A autorização do responsável não é alterada.</p><p class="form-error" role="alert"></p><button class="btn danger full" type="submit">Confirmar exclusão do descritor</button></form>`);}
 if(action==='link-guardian')showModal('Vincular a família',escape(ch.name),`<form data-form="guardian" data-id="${ch.id}"><label>Responsável<select name="parent_id" required>${optionsParents()}</select></label><p class="soft-info">Confira presencialmente o vínculo. A troca do responsável revoga a autorização facial anterior e exclui o descritor.</p><label class="checkbox-label"><input type="checkbox" required/>Conferi o vínculo familiar.</label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Salvar vínculo</button></form>`);
 if(action==='face-camera'){
  if(Capacitor.isNativePlatform()){const photo=await Camera.getPhoto({quality:90,resultType:CameraResultType.Uri,source:CameraSource.Camera,direction:CameraDirection.Front,saveToGallery:false});const blob=await (await fetch(photo.webPath)).blob();selectFace(new File([blob],'captura.jpg',{type:'image/jpeg'}));}
  else{if(!navigator.mediaDevices?.getUserMedia)throw new Error('Câmera precisa de HTTPS ou localhost.');stopCamera();S.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280}},audio:false});document.getElementById('face-video').srcObject=S.stream;document.getElementById('camera-region').hidden=false;}
 }
 if(action==='face-snap'){const v=document.getElementById('face-video');if(!v.videoWidth)return;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',.92));selectFace(new File([blob],'captura.jpg',{type:'image/jpeg'}));stopCamera();document.getElementById('camera-region').hidden=true;}
 }catch(error){toast(error.name==='NotAllowedError'?'Permissão de câmera negada. Você pode selecionar uma foto.':error.message,true);}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!form.dataset.form)return;e.preventDefault();if(S.busy)return;
 const kind=form.dataset.form,values=Object.fromEntries(new FormData(form)),cid=Number(form.dataset.id),child=S.children.find(ch=>ch.id===cid),button=form.querySelector('button[type="submit"]');
 const error=form.querySelector('.form-error');if(error)error.textContent='';
 S.busy=true;formDirty=false;if(button){button.disabled=true;button.dataset.origHtml=button.innerHTML;button.innerHTML='<span class="spin">●</span> Aguarde...';}
 try{
  if(kind==='verify-email'){await api('/auth/email/verify',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);toast('E-mail confirmado.');return;}
  if(kind==='mfa-setup'){const data=await api('/auth/mfa/setup',{method:'POST',body:values});showModal('Conectar autenticador','Adicione esta chave ao seu aplicativo autenticador.',`<p class="soft-info">${escape(data.secret)}</p><form data-form="mfa-confirm"><input name="secret" type="hidden" value="${escape(data.enrollment)}"/><label>Senha atual<input name="password" type="password" autocomplete="current-password" required/></label><label>Código do autenticador<input name="code" autocomplete="one-time-code" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Confirmar ativação</button></form>`);return;}
  if(kind==='mfa-confirm'){const data=await api('/auth/mfa/confirm',{method:'POST',body:values});S.user.mfa_enabled=true;showModal('Guarde seus códigos de recuperação','Cada código funciona uma vez. Guarde em um local seguro.',`<div class="recovery-codes">${data.recovery_codes.map(code=>`<code>${escape(code)}</code>`).join('')}</div>`);return;}
  if(kind==='mfa-disable'){await api('/auth/mfa/disable',{method:'POST',body:values});S.user.mfa_enabled=false;modal.close();toast('Dois fatores desativados.');return;}
  if(kind==='accept-invite'){await api('/family/accept',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);await load();toast('Vínculo confirmado.');return;}
  if(kind==='recovery'){
   const r=await api('/auth/recovery',{method:'POST',body:values});
   modal.close();
   if(r.reset_token){
    resetModal(r.reset_token);
    toast(r.message||'Defina sua nova senha.');
   }else{
    toast(r.message||'Se a conta existir, enviaremos as instruções.');
   }
   return;
  }
  if(kind==='reset'){if(values.password!==values.confirm)throw new Error('As senhas não conferem.');await api('/auth/reset',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);renderLogin();toast('Senha atualizada. Entre com sua nova senha.');return;}
  if(kind==='family-invite'){const r=await api(`/children/${cid}/family/invites`,{method:'POST',body:values});showModal('Convite criado','Envie este link à pessoa autorizada. Válido por 48 horas.',`<label>Link do convite<input readonly value="${escape(r.url)}"/></label>`);return;}
  const schoolResult=await school.submit(form,values);if(schoolResult){modal.close();await load();toast(schoolResult.message||schoolResult);if(schoolResult.roomId)school.lessonForm(schoolResult.roomId);return;}
  if(kind==='create-event'||kind==='event-form'){
   const evId=form.dataset.id;
   const payload={
    title:values.title,
    description:values.description,
    category:values.category,
    target_audience:values.target_audience,
    min_age:Number(values.min_age),
    max_age:Number(values.max_age),
    starts_at:values.starts_at.length===16?values.starts_at+':00-03:00':values.starts_at,
    ends_at:values.ends_at.length===16?values.ends_at+':00-03:00':values.ends_at,
    location:values.location||'',
    price:values.price||'Gratuito',
    max_capacity:Number(values.max_capacity)||100,
    banner_url:values.banner_url||''
   };
   if(evId){
    await api(`/events/${evId}`,{method:'PATCH',body:payload});
    modal.close();await load();toast('Evento atualizado com sucesso!');return;
   }else{
    await api('/events',{method:'POST',body:payload});
    modal.close();await load();toast('Evento publicado! Pais notificados no aplicativo.');return;
   }
  }
  if(kind==='delete-event'){
   await api(`/events/${form.dataset.id}`,{method:'DELETE'});
   modal.close();await load();toast('Evento excluído com sucesso.');return;
  }
  if(kind==='register-event-child'){
   await api(`/events/${form.dataset.id}/register`,{method:'POST',body:{child_id:Number(values.child_id),notes:values.notes||''}});
   modal.close();await load();toast('Inscrição confirmada com sucesso! 🎉');return;
  }
  if(kind==='paging-call'){
   await api('/paging',{method:'POST',body:{child_id:cid,reason:values.reason}});
   modal.close();await load();toast('Chamado no telão disparado! Responsável notificado. 📢');return;
  }
  if(kind==='guest-checkout'){await api(`/guests/${Number(form.dataset.id)}/checkout`,{method:'POST',body:{claim_code:values.claim_code,guardian_confirmed:values.confirmed==='on'}});modal.close();await load();toast('Saída registrada.');return;}
  if(kind==='guest-checkin'){
   const g=await api('/guests/checkin',{method:'POST',body:{child_name:values.child_name,child_age:Number(values.child_age),guardian_name:values.guardian_name,guardian_phone:values.guardian_phone,allergies:values.allergies||'',room_id:Number(values.room_id)}});
   modal.close();await load();
   showModal('Check-in de Visitante Concluído! 🎉','Etiqueta de Segurança emitida',`<div class="pickup-receipt"><span>Código de Retirada do Visitante</span><strong>${escape(g.claim_code)}</strong><small>Entregue este código ao responsável ${escape(g.guardian_name)}.</small></div><button type="button" class="btn primary full" data-action="close" style="margin-top:14px;">Concluir</button>`);
   return;
  }
  if(kind==='login'||kind==='register'){if(NATIVE&&!S.apiOrigin)throw new Error('Configure o servidor HTTPS do aplicativo.');const result=await api('/auth/'+kind,{method:'POST',body:{...values,terms_accepted:values.terms_accepted==='on',terms_version:'2026.1'}});S.user=result.user;S.csrf=result.csrf;S.token='';saveAccount(result.user);navHistory.length=0;S.page=navItems().some(([p])=>p===location.hash.slice(1))?location.hash.slice(1):(S.user.role==='teacher'?'rooms':'overview');await load();const invite=new URL(location.href).searchParams.get('invite');if(invite)showModal('Convite de responsável','Aceite apenas se você conhece a família.',`<form data-form="accept-invite"><input type="hidden" name="token" value="${escape(invite)}"/><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Aceitar convite</button></form>`);return;}
  if(kind==='password'){if(values.password!==values.confirm)throw new Error('As novas senhas não conferem.');await api('/auth/password',{method:'POST',body:{current:values.current,password:values.password}});form.reset();toast('Sua senha foi atualizada.');return;}
  if(kind==='guardian')await api(`/children/${cid}/guardian`,{method:'POST',body:{parent_id:Number(values.parent_id)}});
  if(kind==='attendance'){
    const attRes=await api(`/children/${cid}/attendance`,{method:'POST',body:{action:form.dataset.direction,guardian_confirmed:values.confirmed==='on',guardian_id:Number(values.guardian_id)||child.parent_id,exception_reason:values.exception_reason||'',lesson_id:S.page==='attendance'?(S.selectedLesson||null):null,claim_code:values.claim_code?values.claim_code.toUpperCase().trim():undefined}});
    modal.close();await load();
    if(form.dataset.direction==='in'&&attRes.claim_code)toast(`Entrada confirmada! Etiqueta de Segurança (TAG): ${attRes.claim_code}`);
    else toast('Saída conferida e registrada com sucesso.');
    return;
   }
  if(kind==='notify')await api(`/children/${cid}/notify`,{method:'POST',body:{kind:form.dataset.kind,message:values.message}});
  if(kind==='consent')await api(`/children/${cid}/consent`,{method:'POST',body:{allowed:!child.face_allowed}});
  if(kind==='delete-face')await api(`/children/${cid}/face`,{method:'DELETE'});
  if(kind==='user'||kind==='edit-user'){const rooms=new FormData(form).getAll('rooms').map(Number);if(kind==='user')await api('/users',{method:'POST',body:{...values,rooms}});else await api(`/users/${form.dataset.id}`,{method:'PATCH',body:{active:values.active==='on',rooms}});}
  if(kind==='face'){
   if(!S.faceFile)throw new Error('Selecione ou capture uma foto autorizada.');
   const data=new FormData();data.append('image',S.faceFile);const result=await api(`/children/${cid}/face/${S.faceMode}`,{method:'POST',body:data});
   document.getElementById('face-result').innerHTML=S.faceMode==='enroll'?`<div class="face-feedback"><strong>Cadastro facial salvo.</strong><p>Descritor protegido e vinculado ao aluno. A foto não é guardada pelo servidor.</p></div>`:`<div class="face-feedback"><strong>${result.above_threshold?'Acima':'Abaixo'} do limiar experimental</strong><div class="cosine">${result.similarity.toFixed(4)}</div><p>Cosseno bruto · limiar ${result.threshold}. Não é probabilidade nem prova de vida. Confirme o aluno e o responsável pessoalmente.</p></div>`;
   S.children=await api('/children');return;
  }
  modal.close();await load();toast(kind==='notify'?'Aviso enviado dentro do aplicativo.':'Tudo certo. Registro salvo.');
 }catch(err){
  formDirty=true;
  if(err.code==='mfa'){const otp=document.getElementById('login-otp-label');if(otp){otp.hidden=false;otp.querySelector('input').focus();}}
  if(error)error.textContent=err.message;else toast(err.message,true);
  form.classList.remove('shake');
  void form.offsetWidth;
  form.classList.add('shake');
 }
 finally{S.busy=false;if(button&&button.isConnected){button.disabled=false;if(button.dataset.origHtml)button.innerHTML=button.dataset.origHtml;}}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
if(Capacitor.isNativePlatform()){
 App.addListener('appStateChange',({isActive})=>{
  if(isActive){
   void checkLiveUpdate();
   void syncLive();
  }
 });
}
async function start(){
 void checkLiveUpdate();
 void initNativeNotifications();
 if(NATIVE&&!S.apiOrigin){renderLogin();return;}
 try{const health=await api('/health');S.google=health.google_enabled;}catch{renderLogin();toast('Não foi possível conectar. Verifique sua internet e tente entrar novamente.',true);return;}
 try{const data=await api('/me');S.user=data.user;S.csrf=data.csrf;saveAccount(data.user);S.page=navItems().some(([p])=>p===location.hash.slice(1))?location.hash.slice(1):(S.user.role==='teacher'?'rooms':'overview');await load();checkAutoPromptPush();}catch{renderLogin();}
 const params=new URL(location.href).searchParams;if(params.get('reset'))resetModal(params.get('reset'));
 if(params.get('verify'))showModal('Confirmar e-mail','Confirme o endereço associado à sua conta.',`<form data-form="verify-email"><input type="hidden" name="token" value="${escape(params.get('verify'))}"/><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Confirmar e-mail</button></form>`);
 const err=params.get('auth_error');if(err){toast({link_required:'Entre com sua senha e vincule sua conta Google em Minha conta.',google_email:'Use a conta Google com o mesmo e-mail do cadastro.',google_cancelled:'A entrada com Google foi cancelada.'}[err]||'Não foi possível validar a entrada Google.',true);history.replaceState({},'',location.pathname);}
}

let currentBuild=null,checkingVersion=false;
async function checkLiveUpdate(){
 if(checkingVersion||document.hidden||S.busy||modal.open)return;
 checkingVersion=true;
 try{const v=await api('/version');if(currentBuild===null){currentBuild=v.build;return;}if(v.build!==currentBuild&&!document.getElementById('update-banner')){const banner=document.createElement('div');banner.id='update-banner';banner.className='update-banner';banner.innerHTML='<span>Nova versão disponível</span><button class="btn secondary" data-action="apply-update">Atualizar</button>';document.body.append(banner);}}catch{}finally{checkingVersion=false;}
}
let syncing=false,liveRevision=null;
async function syncLive(){
 if(!S.user||S.busy||syncing)return;
 syncing=true;const uid=S.user.id;
 try{
  const revision=(await api('/sync')).revision;if(revision===liveRevision)return;
  const {notifications,lessons,rooms,children,events,activePaging,activeGuests}=await api('/snapshot');
  if(S.user?.id!==uid)return;
  const previous=new Set(S.notifications.map(n=>n.id));
  const newNotices=notifications.filter(n=>!n.read_at&&!previous.has(n.id));
  const changed=JSON.stringify([notifications,lessons,rooms,children,events,activePaging,activeGuests])!==JSON.stringify([S.notifications,S.lessons,S.rooms,S.children,S.events,S.activePaging,S.activeGuests]);
  Object.assign(S,{notifications,lessons,rooms,children,events,activePaging,activeGuests});
  const editing=modal.open||app.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select');
  if(!editing){liveRevision=revision;if(changed)render();}
  if(newNotices.length > 0){
    const arrivingNotice = newNotices.find(n=>n.kind==='arriving');
    if(arrivingNotice){
      toast(arrivingNotice.message||'🏃 Responsável confirmou que está a caminho!');
    }else{
      toast('Você recebeu um novo aviso. Abra Avisos para conferir.');
    }
    for(const n of newNotices){
      sendSystemNotification({
        title: n.title || 'Lagoinha Kids',
        message: n.message || (n.child_name ? `Aviso sobre ${n.child_name}` : 'Você recebeu um novo comunicado.'),
        tag: n.kind === 'urgent_call' ? `urgent-call-${n.child_id||n.id}` : `notice-${n.id}`,
        id: n.id,
        child_id: n.child_id,
        paging_id: n.paging_id || null,
        kind: n.kind,
        isPaging: n.kind === 'urgent_call'
      });
    }
  }
  if(S.user.role==='parent' && activePaging && activePaging.length > 0){
    for(const p of activePaging){
      if(p.status==='active'){
        const key='seen_p_'+p.id;
        if(!sessionStorage.getItem(key)){
          sessionStorage.setItem(key,'true');
          sendSystemNotification({
            title:'⚠️ Chamado da Salinha - '+p.child_name,
            message:`Atenção: Por favor, compareça à salinha (${p.reason}). Código no telão: ${p.claim_code}`,
            tag:'urgent-call-'+p.id,
            id:p.id,
            child_id:p.child_id,
            paging_id:p.id,
            kind:'urgent_call',
            isPaging:true,
            url:'/?page=overview'
          });
        }
      }
    }
  }
 }catch{}finally{syncing=false;}
}
setInterval(()=>void syncLive(),5000);
setInterval(()=>void checkLiveUpdate(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void syncLive();void checkLiveUpdate();}});
window.addEventListener('focus',()=>{void syncLive();void checkLiveUpdate();});
window.addEventListener('online',()=>{void syncLive();void checkLiveUpdate();});

welcome().then(start);

let pushListening=false;
async function enablePush(){
 const cap=await api('/capabilities');
 if(!cap.push_platforms?.includes(Capacitor.getPlatform())){toast('As notificações externas aguardam configuração pela equipe.',true);return;}
 if(!NATIVE){toast('Use o aplicativo instalado para ativar notificações neste celular.');return;}
 if(!pushListening){
  await PushNotifications.addListener('registration',async ({value})=>{try{await api('/devices/token',{method:'POST',body:{token:value,platform:Capacitor.getPlatform()}});toast('Notificações ativadas.');}catch(err){toast(err.message,true);}});
  await PushNotifications.addListener('registrationError',()=>toast('Não foi possível ativar notificações. Tente novamente.',true));
  await PushNotifications.addListener('pushNotificationReceived',()=>void syncLive());
  await PushNotifications.addListener('pushNotificationActionPerformed',()=>{S.page='notifications';void load();});
  pushListening=true;
 }
 let permission=await PushNotifications.checkPermissions();
 if(permission.receive==='prompt')permission=await PushNotifications.requestPermissions();
 if(permission.receive!=='granted'){toast('Permita notificações nas configurações do celular.',true);return;}
 await PushNotifications.register();
}

function mfaModal(){showModal('Dois fatores',S.user.mfa_enabled?'A proteção está ativada.':'Proteja o acesso administrativo com um autenticador.',`<form data-form="${S.user.mfa_enabled?'mfa-disable':'mfa-setup'}"><label>Senha atual<input name="password" type="password" autocomplete="current-password" required/></label>${S.user.mfa_enabled?'<label>Código do autenticador<input name="code" autocomplete="one-time-code" required/></label>':''}<p class="form-error" role="alert"></p><button class="btn primary full" type="submit">${S.user.mfa_enabled?'Desativar proteção':'Configurar autenticador'}</button></form>`);}

function setConnection(online){
 let banner=document.getElementById('network-banner');
 if(online){banner?.remove();return;}
 if(!banner){banner=document.createElement('div');banner.id='network-banner';banner.className='network-banner';banner.setAttribute('role','status');banner.innerHTML='<span>Sem conexão. Os dados podem estar desatualizados.</span><button class="text-link" data-action="retry-connection">Tentar novamente</button>';document.body.append(banner);}
}
window.addEventListener('offline',()=>setConnection(false));

// Keep unfinished work in memory; warn before document navigation.
let formDirty=false;
function allowDiscard(){if(S.busy)return false;if(formDirty&&!confirm("Descartar as alterações ainda não salvas?"))return false;formDirty=false;return true;}
document.addEventListener('input',event=>{if(event.target.closest('form'))formDirty=true;});
modal.addEventListener('close',()=>{formDirty=false;});
window.addEventListener('beforeunload',event=>{if(formDirty){event.preventDefault();event.returnValue='';}});


function hasPushPermission(){
  if(typeof Notification!=='undefined'&&Notification.permission==='granted')return true;
  if(localStorage.getItem('lagoinha_push_enabled')==='true')return true;
  return false;
}

let nativeNotifReady=false;
async function initNativeNotifications(){
  if(!NATIVE||nativeNotifReady)return;
  nativeNotifReady=true;
  try{
    await LocalNotifications.createChannel({
      id:'lagoinha_urgent',
      name:'Chamados Urgentes & Telão',
      description:'Alertas prioritários para os pais durante o culto',
      importance:5,
      visibility:1,
      vibration:true,
      lights:true,
      lightColor:'#ffffff'
    });
    await LocalNotifications.createChannel({
      id:'lagoinha_general',
      name:'Avisos Gerais',
      description:'Avisos da salinha, check-in e eventos',
      importance:4,
      visibility:1,
      vibration:true
    });
    await LocalNotifications.registerActionTypes({
      types:[
        {
          id:'PAGING_ACTIONS',
          actions:[
            { id:'on_my_way', title:'🏃 Estou a caminho' },
            { id:'view_details', title:'Ver detalhes' }
          ]
        }
      ]
    });
    LocalNotifications.addListener('localNotificationActionPerformed',async (action)=>{
      if(action.actionId==='on_my_way'){
        const extra=action.notification.extra||{};
        try{
          if(!S.user){
            try{const me=await api('/me');S.user=me.user;S.csrf=me.csrf;saveAccount(me.user);}catch{}
          }
          const res=await api('/paging/on-my-way',{method:'POST',body:{child_id:extra.child_id||null,paging_id:extra.paging_id||null}});
          toast(`🏃 Resposta confirmada! A salinha e o administrativo foram avisados que você está a caminho de ${res.child_name||'seu filho'}.`);
          await load();
        }catch(err){
          toast(err.message||'Erro ao avisar a salinha.',true);
        }
      }else{
        S.page='overview';
        render();
      }
    });
    await PushNotifications.addListener('registration',async ({value})=>{
      try{await api('/devices/token',{method:'POST',body:{token:value,platform:Capacitor.getPlatform()}});}catch{}
    });
    await PushNotifications.addListener('pushNotificationReceived',(notification)=>{
      void sendSystemNotification({
        title:notification.title||'Lagoinha Kids',
        message:notification.body||'Você recebeu um novo aviso.',
        isPaging:notification.data?.kind==='urgent_call'
      });
      void syncLive();
    });
    await PushNotifications.addListener('pushNotificationActionPerformed',()=>{
      S.page='notifications';
      void load();
    });
  }catch(err){
    console.warn('Falha ao inicializar notificações nativas:',err);
  }
}

async function sendSystemNotification({ title, message, tag, url, id, child_id, paging_id, kind, isPaging }){
  const notifTitle=title||'Lagoinha Kids';
  const urgent=kind==='urgent_call'||isPaging;
  const notifBody=message||'Você recebeu um novo comunicado.';

  // 1. Se estiver no app nativo (APK Android / iOS)
  if(NATIVE){
    try{
      const perm=await LocalNotifications.checkPermissions();
      if(perm.display!=='granted'){
        await LocalNotifications.requestPermissions();
      }
      const notifId=Math.abs(Number(id||Date.now()) % 100000);
      await LocalNotifications.schedule({
        notifications:[
          {
            title:notifTitle,
            body:notifBody,
            id:notifId,
            channelId:urgent?'lagoinha_urgent':'lagoinha_general',
            actionTypeId:urgent?'PAGING_ACTIONS':undefined,
            extra:{
              child_id,
              paging_id,
              url:urgent?'/?page=overview':(url||'/?page=notifications')
            },
            iconColor:'#000000'
          }
        ]
      });
      return;
    }catch(err){
      console.warn('Erro ao disparar LocalNotification:',err);
    }
  }

  // 2. Se estiver na Web / PWA no navegador
  if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
  const options={
    body:notifBody,
    icon:'/logo.png',
    badge:'/logo.png',
    tag:tag||(urgent?'urgent-call-'+(child_id||Date.now()):'lagoinha-notice-'+Date.now()),
    renotify:true,
    requireInteraction:urgent,
    data:{
      url:url||(urgent?'/?page=overview':'/?page=notifications'),
      id:id||null,
      child_id:child_id||null,
      paging_id:paging_id||null,
      kind:kind||'general',
      isPaging:urgent
    },
    vibrate:urgent?[300,150,300,150,300,150,400]:[200,100,200]
  };

  if(urgent){
    options.actions=[
      { action:'on_my_way', title:'🏃 Estou a caminho' },
      { action:'open_app', title:'Ver detalhes' }
    ];
  }

  try{
    if('serviceWorker' in navigator&&navigator.serviceWorker.controller){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(notifTitle,options).catch(()=>{
          try{new Notification(notifTitle,options);}catch{}
        });
      }).catch(()=>{
        try{new Notification(notifTitle,options);}catch{}
      });
    }else{
      new Notification(notifTitle,options);
    }
  }catch(err){
    console.warn('Erro ao emitir notificação de sistema:',err);
  }
}

function promptPushPermissionModal(){
  sessionStorage.setItem('lagoinha_push_session_dismissed','true');
  const html=`<div class="push-permission-card">
    <div class="push-modal-badge">
      <img src="/logo.png" alt="Lagoinha Kids" class="push-modal-logo"/>
      <span class="push-badge-indicator">${icon('bell',15)}</span>
    </div>
    <h3 class="push-modal-title">Ativar Notificações no Celular</h3>
    <p class="push-modal-subtitle">Receba os avisos do seu filho na tela de bloqueio e central de notificações, mesmo com o aplicativo fechado.</p>
    <div class="push-features-list">
      <div class="push-feature-item">
        <div class="push-feature-icon">${icon('check',18)}</div>
        <div class="push-feature-text">
          <strong>Check-in & Saída Segura</strong>
          <p>Receba confirmação imediata quando seu filho entrar na salinha ou for retirado com o QR Code.</p>
        </div>
      </div>
      <div class="push-feature-item">
        <div class="push-feature-icon">${icon('speaker',18)}</div>
        <div class="push-feature-text">
          <strong>Chamada Rápida durante o Culto</strong>
          <p>Se seu filho precisar de você (troca de fralda, choro ou febre), as tias avisam direto no seu aparelho.</p>
        </div>
      </div>
      <div class="push-feature-item">
        <div class="push-feature-icon">${icon('calendar',18)}</div>
        <div class="push-feature-text">
          <strong>Avisos e Aulinhas</strong>
          <p>Lembretes de programações especiais, eventos infantis e temas do discipulado familiar.</p>
        </div>
      </div>
    </div>
    <div class="push-modal-alert">
      <span style="font-size:18px;">📱</span>
      <div>
        <strong>Aparecem fora do aplicativo:</strong>
        <p>As notificações saltam na tela de bloqueio do celular (Android, iPhone e Computador).</p>
      </div>
    </div>
    <div class="push-modal-actions">
      <button type="button" class="btn primary full push-confirm-btn" data-action="activate-notifications">${icon('bell',18)}<span>Ativar Notificações no Celular</span></button>
      <button type="button" class="btn secondary full push-dismiss-btn" data-action="dismiss-push-modal">Agora não, lembrar depois</button>
    </div>
    <p class="push-privacy-footer">${icon('shield',13)} Ambiente seguro · Você pode desativar a qualquer momento nas configurações.</p>
  </div>`;
  showModal('Notificações no Celular','Avisos importantes em tempo real.',html);
}

async function requestNotificationPermission(explicit=true){
  if(Capacitor.isNativePlatform()){
    try{
      let perm=await PushNotifications.checkPermissions();
      if(perm.receive==='prompt')perm=await PushNotifications.requestPermissions();
      const localPerm=await LocalNotifications.requestPermissions();
      if(perm.receive==='granted'||localPerm.display==='granted'){
        await PushNotifications.register();
        localStorage.setItem('lagoinha_push_enabled','true');
        modal.close();
        toast('🔔 Notificações ativadas no seu celular com sucesso!');
        await sendSystemNotification({
          title:'Lagoinha Kids · Notificações Ativadas',
          message:'Tudo pronto! Você receberá os avisos do seu filho no topo da tela do celular.',
          tag:'welcome-notification'
        });
        render();
        return true;
      }else{
        if(explicit)toast('Permissão não concedida. Você pode ativar nas configurações do celular.',true);
        return false;
      }
    }catch(err){
      if(explicit)toast('Erro ao ativar notificações: '+(err.message||err),true);
      return false;
    }
  }

  const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
  const isStandalone=window.navigator.standalone===true||window.matchMedia('(display-mode: standalone)').matches;

  if(isIOS&&!isStandalone&&!('Notification' in window)){
    showModal('Notificações no iPhone','Como ativar os avisos fora do app no iOS:',`<div class="soft-info" style="font-size:13px;line-height:1.6;margin-bottom:16px;"><p>No iPhone (iOS), a Apple exige adicionar à Tela de Início para habilitar notificações:</p><ol style="padding-left:18px;margin:10px 0;"><li style="margin-bottom:6px;">No Safari, toque no botão <strong>Compartilhar</strong> (ícone com quadrado e seta para cima).</li><li style="margin-bottom:6px;">Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong>.</li><li>Abra o aplicativo pelo novo ícone na tela do iPhone e ative as notificações!</li></ol></div><button class="btn primary full" data-action="close">Entendi</button>`);
    return false;
  }

  if(!('Notification' in window)){
    toast('Este navegador não oferece suporte para notificações de sistema.',true);
    return false;
  }

  try{
    const permission=await Notification.requestPermission();
    if(permission==='granted'){
      localStorage.setItem('lagoinha_push_enabled','true');
      modal.close();
      toast('🔔 Notificações ativadas com sucesso!');
      sendSystemNotification({
        title:'Lagoinha Kids · Notificações Ativas',
        message:'Tudo pronto! Você receberá os avisos do seu filho na tela de bloqueio.',
        tag:'welcome-notification'
      });
      render();
      return true;
    }else if(permission==='denied'){
      if(explicit)toast('Notificações bloqueadas nas permissões do navegador. Toque no ícone de ajustes ao lado da URL para liberar.',true);
      return false;
    }else{
      return false;
    }
  }catch(err){
    if(explicit)toast('Erro ao solicitar permissão: '+(err.message||err),true);
    return false;
  }
}

function testSystemNotification(){
  if(!hasPushPermission()){
    promptPushPermissionModal();
    return;
  }
  const defaultChild = (S.children && S.children.length) ? S.children[0] : null;
  const childId = defaultChild ? defaultChild.id : 1;
  const childName = defaultChild ? defaultChild.name : 'Lucas Oliveira';
  sendSystemNotification({
    title:`⚠️ Chamado da Salinha - ${childName}`,
    message:`${childName} precisa da sua presença na salinha. Toque em Estou a caminho!`,
    tag:'test-notification-'+Date.now(),
    isPaging:true,
    kind:'urgent_call',
    child_id:childId,
    paging_id:null
  });
  toast('🔔 Alerta prioritário enviado para o topo do celular!');
}

function checkAutoPromptPush(){
  if(!S.user)return;
  if(hasPushPermission())return;
  const dismissedUntil=Number(localStorage.getItem('lagoinha_push_dismissed_until')||0);
  if(Date.now()<dismissedUntil)return;
  if(sessionStorage.getItem('lagoinha_push_session_dismissed'))return;

  setTimeout(()=>{
    if(S.user&&!modal.open&&!hasPushPermission()){
      promptPushPermissionModal();
    }
  },1800);
}

if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',(event)=>{
    if(event.data?.type==='PAGING_ACKNOWLEDGED'){
      toast('🏃 Resposta registrada! Os professores e o administrativo já foram avisados que você está a caminho.');
      void load();
    }
    if(event.data?.type==='NAVIGATE_PAGE'){
      S.page=event.data.page||'notifications';
      render();
    }
  });
}
