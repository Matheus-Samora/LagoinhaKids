import {createSchoolUI} from './school.js';
import './style.css';
import './mobile.css';
import './auth.css';
import {Capacitor} from '@capacitor/core';
import {Camera,CameraResultType,CameraSource,CameraDirection} from '@capacitor/camera';
import {App} from '@capacitor/app';
import {PushNotifications} from '@capacitor/push-notifications';

const app=document.getElementById('app'), modal=document.getElementById('modal');
const NATIVE=Capacitor.isNativePlatform();
const DEFAULT_TUNNEL='https://mountain-interactive-doors-suit.trycloudflare.com';
let storedServer='';
try{storedServer=NATIVE?(localStorage.getItem('kids_server')||DEFAULT_TUNNEL):'';}catch{}
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;});
const S={apiOrigin:storedServer,token:'',user:null,csrf:'',rooms:[],lessons:[],selectedChild:null,selectedLesson:null,children:[],notifications:[],users:[],audit:[],page:'overview',search:'',room:'all',google:false,busy:false,stream:null,faceFile:null,faceUrl:null,faceMode:'enroll'};
const roles={admin:'Administração',teacher:'Professora / Professor',parent:'Responsável'};
const statusName={absent:'Não chegou',present:'Na salinha',departed:'Saída registrada'};
const paths={overview:'Visão geral',children:'Alunos',rooms:'Turmas',attendance:'Chamada',notifications:'Notificações',users:'Usuários e acessos',settings:'Minha conta'};
const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=(name)=>escape(name.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join(''));
const icon=(name,size=20)=>{const shapes={home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',kids:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-17a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5v2"/>',rooms:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',check:'<path d="m5 12 4 4L19 6"/>',bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12a2 2 0 0 0 4 0"/>',settings:'<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2M16 8l2-2"/><circle cx="12" cy="12" r="5"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',back:'<path d="M19 12H5m7 7-7-7 7-7"/>',face:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="9" cy="10" r=".5"/><circle cx="15" cy="10" r=".5"/><path d="M8 15q4 4 8 0"/>',out:'<path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10"/>',shield:'<path d="m12 3 8 3v6q0 6-8 9-8-3-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/>',heart:'<path d="M12 21 3 12C-3 4 7-1 12 6 17-1 27 4 21 12Z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]||shapes.home}</svg>`;};
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
function brand(){return `<div class="brand"><img src="/logo.png" alt="Logo Lagoinha"/><div>lagoinha <strong>kids<span>●</span></strong><small>CUIDADO QUE CONECTA</small></div></div>`;}
function renderLogin(register=false,prefillEmail=''){
 app.innerHTML=`<main class="auth-screen"><section class="auth-card">${brand()}<h1>${register?'Criar conta':'Bem-vindo'}</h1><p class="auth-subtitle">${register?'Seu acesso ao Lagoinha Kids.':'Entre para continuar.'}</p><form data-form="${register?'register':'login'}">${register?'<label>Nome<input name="name" autocomplete="name" required minlength="2" maxlength="100"/></label><label>Celular<input name="phone" type="tel" autocomplete="tel" maxlength="30"/></label>':''}<label>E-mail<input name="email" id="login-email" type="email" autocomplete="username" required maxlength="200" value="${escape(prefillEmail)}"/></label><label>Senha<div class="password-field"><input name="password" id="login-password" type="password" autocomplete="${register?'new-password':'current-password'}" required ${register?'minlength="12"':''} maxlength="128"/><button type="button" data-action="toggle-password" aria-label="Mostrar senha">Ver</button></div></label>${!register?'<label id="login-otp-label" hidden>Código do autenticador<input name="otp" autocomplete="one-time-code" maxlength="40"/></label>':''}${register?'<label class="checkbox-label terms-choice"><input name="terms_accepted" type="checkbox" required/>Li e aceito os <button type="button" class="text-link" data-action="privacy-terms">termos e a política de privacidade</button>.</label>':'<button type="button" class="auth-forgot text-link" data-action="password-help">Esqueci minha senha</button>'}<p class="form-error" role="alert"></p><button class="btn primary full" type="submit">${register?'Criar conta':'Entrar'}</button></form>${S.google?'<div class="divider"><span>ou</span></div><button class="btn google full" data-action="google"><span class="google-g">G</span> Continuar com Google</button>':''}<p class="signup">${register?'Já tem conta?':'Primeiro acesso?'} <button data-action="${register?'login-screen':'register-screen'}">${register?'Entrar':'Criar conta'}</button></p><footer class="auth-footer"><button class="text-link" data-action="privacy-terms">Privacidade</button><button class="text-link" data-action="install-modal">Instalar app</button>${NATIVE?'<button class="text-link" data-action="server-options">Conexão</button>':''}</footer><p id="connection-status" class="connection-status" role="status" ${navigator.onLine?'hidden':''}>Sem conexão. Verifique sua internet.</p></section></main>`;
}
function welcome(){
 app.innerHTML=`<div class="welcome-screen" aria-label="Lagoinha Kids"><img src="/logo.png" alt="Lagoinha Kids"/><strong>lagoinha kids<span>.</span></strong></div>`;
 return new Promise(resolve=>setTimeout(resolve,matchMedia('(prefers-reduced-motion: reduce)').matches?0:1100));
}
function recoveryModal(){showModal('Recuperar acesso','Enviaremos um link para seu e-mail.',`<form data-form="recovery"><label>E-mail<input type="email" name="email" autocomplete="email" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Enviar link</button></form>`);}
function resetModal(token){showModal('Nova senha','Use pelo menos 12 caracteres.',`<form data-form="reset"><input type="hidden" name="token" value="${escape(token)}"/><label>Nova senha<input type="password" name="password" autocomplete="new-password" minlength="12" maxlength="128" required/></label><label>Confirmar senha<input type="password" name="confirm" autocomplete="new-password" minlength="12" maxlength="128" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Salvar senha</button></form>`);}
async function familyModal(ch){
 const family=await api(`/children/${ch.id}/family`);
 showModal('Responsáveis',escape(ch.name),`<div class="family-list">${family.map(u=>`<p><strong>${escape(u.name)}</strong> · ${u.primary_guardian?'Principal':'Autorizado para retirada'} ${!u.primary_guardian?`<button class="text-link" data-action="revoke-family" data-child="${ch.id}" data-user="${u.id}">Remover</button>`:''}</p>`).join('')}</div>${S.user.role==='admin'||ch.parent_id===S.user.id?`<form data-form="family-invite" data-id="${ch.id}"><label>E-mail de quem será autorizado<input name="email" type="email" required/></label><p class="soft-info">A pessoa deve aceitar o convite com uma conta deste e-mail. Compartilhe o link apenas com ela.</p><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Criar convite</button></form>`:''}`);
}
async function historyModal(ch){const rows=await api(`/children/${ch.id}/history`);showModal('Histórico',escape(ch.name),rows.length?rows.map(r=>`<article class="history-entry"><strong>${r.action==='in'?'Entrada':'Saída'} · ${new Date(r.created_at).toLocaleString('pt-BR')}</strong><p>${escape(r.guardian_name)}</p></article>`).join(''):'<p>Ainda não há registros de chegada e saída.</p>');}
async function load(){
 const jobs=[api('/children'),api('/rooms'),api('/notifications'),api('/lessons')];
 if(S.user.role==='admin')jobs.push(api('/users'),api('/audit'));
 const [children,rooms,notifications,lessons,users=[],audit=[]]=await Promise.all(jobs);
 Object.assign(S,{children,rooms,notifications,lessons,users,audit});render();
}
function navItems(){if(S.user.role==='parent')return [['overview','Meus filhos','kids'],['lessons','Aulinhas','clock'],['notifications','Avisos','bell']];if(S.user.role==='teacher')return [['rooms','Minhas turmas','rooms'],['attendance','Chamada','check'],['notifications','Avisos','bell']];return [['overview','Visão geral','home'],['rooms','Turmas','rooms'],['children','Alunos','kids'],['attendance','Chamada','check'],['notifications','Avisos','bell'],['users','Usuários e acessos','shield'],['settings','Minha conta','settings']];}
function mobileNavItems(){
 if(S.user.role==='parent')return [['overview','Meus filhos','kids'],['lessons','Aulinhas','clock'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 if(S.user.role==='teacher')return [['rooms','Turmas','rooms'],['attendance','Chamada','check'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 return [['overview','Visão','home'],['attendance','Chamada','check'],['children','Alunos','kids'],['notifications','Avisos','bell'],['settings','Conta','settings']];
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
 app.innerHTML=`<div class="shell"><aside class="sidebar" data-role="${S.user.role}">${brand()}<div class="sidebar-caption">NOSSO ESPAÇO</div><nav aria-label="Navegação principal">${navItems().map(([page,label,i])=>`<button class="nav-link ${S.page===page?'active':''}" data-page="${page}">${icon(i)}<span>${label}</span>${page==='notifications'&&unread?`<b class="notification-count">${unread}</b>`:''}</button>`).join('')}</nav><div class="sidebar-bottom"><button class="nav-link" data-action="install-modal" style="margin-bottom:8px;">${icon('arrow',16)}<span>Baixar App (APK / iOS)</span></button><div class="care-note"><span>✳</span><p>Pequenos passos.<br><strong>Grandes descobertas.</strong></p></div><button class="account" data-page="settings"><span class="avatar">${initials(S.user.name)}</span><span><strong>${escape(S.user.name.split(' ')[0])}</strong><small>${roles[S.user.role]}</small></span></button><button class="logout" data-action="logout">${icon('out',17)} Sair do aplicativo</button></div></aside><main><header class="topbar"><div class="breadcrumbs">${canGoBack()?`<button type="button" class="back-nav-btn" data-action="go-back" title="Voltar para a tela anterior" aria-label="Voltar para a tela anterior">${icon('back',16)}<span>Voltar</span></button>`:''}<div class="crumb-trail">Nosso espaço <span>/</span> <strong>${S.user.role==='parent'&&S.page==='overview'?'Meus filhos':(paths[S.page]||'Aulinhas')}</strong></div></div><div class="top-actions"><button class="mini-button" data-action="install-modal" title="Instalar aplicativo móvel" style="margin-right:8px;font-weight:600;">📱 Baixar App</button><span class="date">${new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'America/Sao_Paulo'}).format(new Date())}</span><button class="bell-button" data-page="notifications" aria-label="Abrir notificações">${icon('bell')}${unread?'<i></i>':''}</button><button class="avatar small" data-page="settings" title="Minha conta" aria-label="Minha conta">${initials(S.user.name)}</button><button class="logout-top-btn" data-action="logout" title="Sair da conta / Trocar de usuário" aria-label="Sair da conta">${icon('out',15)}<span>Sair</span></button></div></header><div class="page-content">${pageContent()}</div><footer class="app-footer">Lagoinha Kids · Cuidado que conecta <span>Ambiente seguro · Igreja Batista da Lagoinha</span></footer></main><nav class="mobile-bottom-nav" aria-label="Navegação móvel">${mobileNavItems().map(([page,label,i])=>`<button class="mobile-bottom-btn ${S.page===page?'active':''}" data-page="${page}">${icon(i,22)}<span>${label}</span>${page==='notifications'&&unread?`<b class="notification-count">${unread}</b>`:''}</button>`).join('')}</nav></div>`;
 app.querySelectorAll('table').forEach(table=>{const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent);table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,i)=>cell.dataset.label=labels[i]||''));});
}
function title(title,subtitle,button=''){return `<div class="page-heading"><div><span class="eyebrow">LAGOINHA KIDS</span><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`;}
function stat(label,value,helper,i,color){return `<article class="stat"><div><span>${label}</span><strong>${value}</strong><small>${helper}</small></div><span class="stat-icon" style="background:${color}">${icon(i,23)}</span></article>`;}
function filtered(){return S.children.filter(ch=>(S.room==='all'||String(ch.room_id)===S.room)&&ch.name.toLowerCase().includes(S.search.toLowerCase()));}
function filters(){return `<div class="filters"><label class="search">${icon('search',18)}<input id="student-search" placeholder="Buscar aluno pelo nome" value="${escape(S.search)}" aria-label="Buscar aluno pelo nome"/></label><select id="room-filter" aria-label="Filtrar turma"><option value="all">Todas as minhas turmas</option>${S.rooms.map(r=>`<option value="${r.id}" ${String(r.id)===S.room?'selected':''}>${escape(r.name)}</option>`).join('')}</select></div>`;}
function roster(children,compact=false){return children.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Turma</th><th>Situação</th><th>${compact?'Entrada':'Responsável'}</th><th>Ações</th></tr></thead><tbody>${children.map(ch=>`<tr><td><div class="person"><span class="kid-avatar" style="background:${ch.color}">${initials(ch.name)}</span><div><strong>${escape(ch.name)}</strong><small>${age(ch.birthday)} anos ${ch.face_enrolled?'· Facial ativo':''}</small>${ch.allergies?`<span class="allergy-badge" title="Alergia: ${escape(ch.allergies)}">⚠️ ${escape(ch.allergies)}</span>`:''}${ch.special_needs?`<span class="allergy-badge special" title="Necessidade Especial: ${escape(ch.special_needs)}">♿ ${escape(ch.special_needs)}</span>`:''}</div></div></td><td><span class="room-label">${escape(ch.room_name)}</span></td><td><span class="status ${ch.status}"><i></i>${statusName[ch.status]}</span>${ch.claim_code?`<span class="claim-tag-badge">TAG: ${escape(ch.claim_code)}</span>`:''}</td><td>${compact?time(ch.in_at):escape(ch.parent_name||'Aguardando vínculo')}</td><td><div class="row-actions"><button class="mini-button" data-action="attendance" data-id="${ch.id}">${ch.status==='present'?'Registrar saída':'Registrar entrada'}</button><button class="icon-button" title="Conferência facial auxiliar" aria-label="Conferência facial de ${escape(ch.name)}" data-action="face" data-id="${ch.id}">${icon('face',18)}</button><button class="icon-button" title="Notificar responsável" aria-label="Notificar responsável de ${escape(ch.name)}" data-action="notify" data-kind="please_pickup" data-id="${ch.id}">${icon('bell',18)}</button>${!compact&&S.user.role==='admin'?`<button class="icon-button" title="Vincular responsável" aria-label="Vincular responsável a ${escape(ch.name)}" data-action="link-guardian" data-id="${ch.id}">${icon('kids',18)}</button>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum aluno por aqui','Ajuste a busca ou cadastre o primeiro aluno da turma.');}
function empty(title,sub){return `<div class="empty">${icon('heart',30)}<h3>${title}</h3><p>${sub}</p></div>`;}
function pageContent(){
 const simplePage=school.page();if(simplePage!==null)return simplePage;
 const p=S.user.role==='parent';
 if(S.page==='overview'){
  const present=S.children.filter(ch=>ch.status==='present').length,departed=S.children.filter(ch=>ch.status==='departed').length;
   return `${title(`Olá, ${escape(S.user.name.split(' ')[0])} <span class="wave">✦</span>`,'Um novo encontro. Muitas histórias para acolher.')}<section class="welcome"><div><span class="pill">${icon('heart',13)} CADA CRIANÇA IMPORTA</span><h2>Mais presença.<br>Mais cuidado. <em>Mais conexão.</em></h2><p>Organize a salinha e mantenha as famílias por perto.<br>Vamos fazer de hoje um dia especial?</p><button class="btn dark" data-page="attendance">Abrir chamada ${icon('arrow',17)}</button></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section><div class="stats">${stat('Alunos cadastrados',S.children.length,'Nas suas turmas','kids','#f4f4f5')}${stat('Na salinha agora',present,'Presença confirmada pela equipe','check','#f4f4f5')}${stat('Saídas registradas',departed,'Com responsável conferido','out','#f4f4f5')}${stat('Minhas turmas',S.rooms.length,'Espaços para crescer','rooms','#f4f4f5')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Presenças de hoje</h2><p>Acompanhe quem já chegou.</p></div><button class="text-link" data-page="attendance">Ver chamada ${icon('arrow',16)}</button></div>${roster(S.children.slice(0,5),true)}</section><section class="panel room-summary"><div class="panel-heading"><div><h2>Um lugar para cada um</h2><p>O movimento das suas turmas.</p></div></div>${S.rooms.map(r=>`<button class="room-summary-item" data-action="filter-room" data-id="${r.id}"><span class="room-symbol" style="background:${r.color}">${icon('rooms',18)}</span><div><strong>${escape(r.name)}</strong><small>${r.min_age} a ${r.max_age} anos</small><div class="progress"><i style="width:${Math.min(100,r.present/r.capacity*100)}%;background:${r.color}"></i></div></div><span>${r.present}<small>/${r.capacity}</small></span></button>`).join('')}<div class="note-soft">${icon('shield',17)} Entradas e saídas sempre confirmadas por uma pessoa da equipe.</div></section></div>`;
 }
 if(S.page==='notifications')return `${title('Avisos','Recados da equipe e da família.')}<section class="panel notifications">${S.notifications.length?S.notifications.map(n=>`<article class="notification ${n.read_at?'read':'unread'}"><span class="notification-icon">${icon(n.kind==='attendance'?'check':'bell',22)}</span><div><div class="notification-meta">${escape(n.child_name||'Lagoinha Kids')} · ${new Date(n.created_at).toLocaleDateString('pt-BR')} às ${time(n.created_at)}</div><h3>${escape(n.title)}</h3><p>${escape(n.message)}</p><small>De ${escape(n.sender_name||'Equipe')}</small></div>${!n.read_at?`<button class="mini-button" data-action="read" data-id="${n.id}">Marcar como lida</button>`:'<span class="read-label">Lida ✓</span>'}</article>`).join(''):empty('Tudo tranquilo por aqui','Os avisos para você aparecerão neste espaço.')}</section><p class="muted-note">Com o aplicativo aberto, os avisos são atualizados automaticamente. Notificações com o app fechado ainda não estão ativadas.</p>`;
 if(S.page==='users'&&S.user.role==='admin')return `${title('Pessoas que cuidam.','Gerencie os acessos e as turmas da sua equipe.',`<button class="btn primary" data-action="new-user">${icon('plus',17)} Novo usuário</button>`)}<section class="panel"><div class="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Turmas</th><th>Acesso</th><th>Ações</th></tr></thead><tbody>${S.users.map(u=>`<tr><td><div class="person"><span class="avatar">${initials(u.name)}</span><span><strong>${escape(u.name)}</strong><small>${escape(u.email)}</small></span></div></td><td>${roles[u.role]}</td><td>${u.role==='teacher'?u.rooms.map(id=>escape(S.rooms.find(r=>r.id===id)?.name)).join(', ')||'Nenhuma atribuída':'—'}</td><td><span class="status ${u.active?'present':'departed'}">${u.active?'Ativo':'Desativado'}</span></td><td><button class="mini-button" data-action="edit-user" data-id="${u.id}">Gerenciar</button></td></tr>`).join('')}</tbody></table></div></section>`;
 if(S.page==='settings')return settingsPage();
 return '';
}
function settingsPage(){return `${title('Seu espaço, seu acesso.','Confira sua conta e escolha como entrar.')}<div class="settings-grid"><section class="panel settings-panel"><h2>Minha conta</h2><div class="profile"><span class="avatar big">${initials(S.user.name)}</span><div><h3>${escape(S.user.name)}</h3><p>${escape(S.user.email)}</p><span class="tag">${roles[S.user.role]}</span></div></div><button type="button" class="btn secondary full logout-panel-btn" data-action="logout" style="margin-top:14px;border:1.5px solid #18181b;display:flex;align-items:center;justify-content:center;gap:8px;">${icon('out',17)} <strong>Sair desta conta / Trocar de usuário</strong></button><button class="btn secondary full" data-action="revoke-sessions" style="margin-top:12px">Encerrar outros acessos</button>${NATIVE?'<button class="btn secondary full" data-action="enable-push" style="margin-top:12px">Ativar notificações neste celular</button>':''}${S.user.role==='admin'?'<button class="btn secondary full" data-action="mfa" style="margin-top:12px">Autenticação em dois fatores</button>':''}${!S.user.email_verified?'<button class="btn secondary full" data-action="verify-email" style="margin-top:12px">Confirmar meu e-mail</button>':'<p class="muted-note">E-mail confirmado</p>'}<hr/><h3>Vínculo Google</h3><p>${S.user.google_linked?'Sua conta Google está vinculada.':'Vincule a conta Google do mesmo e-mail após entrar com sua senha.'}</p><button class="btn secondary" data-action="google-link"><span class="google-g">G</span> ${S.user.google_linked?'Conta Google vinculada':'Vincular conta Google'}</button><button type="button" class="btn secondary full" data-action="privacy-terms" style="margin-top:10px;border:1px solid #27272a;">${icon('shield',16)} Política de Privacidade & LGPD</button>${!S.google?'<p class="muted-note">A integração aguarda configuração pela equipe de desenvolvimento.</p>':''}</section><section class="panel settings-panel"><h2>Trocar minha senha</h2><p>Use uma senha exclusiva com pelo menos 12 caracteres.</p><form data-form="password"><label>Senha atual<input type="password" name="current" autocomplete="current-password" required maxlength="128"/></label><label>Nova senha<input type="password" name="password" autocomplete="new-password" required minlength="12" maxlength="128"/></label><label>Confirmar nova senha<input type="password" name="confirm" autocomplete="new-password" required minlength="12" maxlength="128"/></label><p class="form-error" role="alert"></p><button class="btn primary" type="submit">Salvar nova senha</button></form></section></div>${S.user.role==='admin'?`<section class="panel audit-panel"><div class="panel-heading"><div><h2>Histórico administrativo</h2><p>Últimas ações registradas no aplicativo.</p></div><span class="tag">Auditoria</span></div><div class="table-wrap"><table><thead><tr><th>Quando</th><th>Usuário</th><th>Ação</th><th>Aluno</th></tr></thead><tbody>${S.audit.slice(0,30).map(a=>`<tr><td>${new Date(a.created_at).toLocaleDateString('pt-BR')} · ${time(a.created_at)}</td><td>${escape(a.actor_name)}</td><td>${escape(a.action)}</td><td>${a.child_id?escape(S.children.find(ch=>ch.id===a.child_id)?.name||a.child_id):'—'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;}

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
   ${!out?`<div class="claim-info-note" style="margin:8px 0 12px;padding:8px 12px;background:#09090b;border:1px solid #27272a;border-radius:6px;font-size:12px;color:#a1a1aa;">Ao confirmar a entrada, o sistema gerará uma <strong>Etiqueta de Segurança (Claim Tag de 4 dígitos)</strong> pareada para a criança e para o responsável.</div>`:`<div class="claim-checkout-note" style="margin:8px 0 12px;padding:10px;background:#09090b;border:1px solid #27272a;border-radius:6px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#a1a1aa;margin-bottom:6px;">PROTOCOLO DE RETIRADA (NO TAG, NO CHILD)</div><label style="font-size:13px;display:block;margin-bottom:8px;">Código da Etiqueta do Responsável (4 caracteres):<input name="claim_code" type="text" maxlength="4" style="text-transform:uppercase;font-size:18px;font-weight:700;letter-spacing:4px;text-align:center;margin-top:4px;" placeholder="Código" required/></label></div>`}
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
modal.addEventListener('cancel',(e)=>{if(S.busy)e.preventDefault();});
function selectFace(file){if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)return toast('Use JPG, PNG ou WebP de até 8 MB.',true);S.faceFile=file;if(S.faceUrl)URL.revokeObjectURL(S.faceUrl);S.faceUrl=URL.createObjectURL(file);document.getElementById('face-preview').src=S.faceUrl;document.getElementById('face-preview').hidden=false;document.getElementById('face-placeholder').hidden=true;}
document.addEventListener('change',e=>{if(e.target.id==='face-input')selectFace(e.target.files[0]);if(e.target.id==='room-filter'){S.room=e.target.value;updateRoster();}});
document.addEventListener('input',e=>{if(e.target.id==='student-search'){S.search=e.target.value;updateRoster();}});
function updateRoster(){document.getElementById('roster').innerHTML=roster(filtered(),S.page==='attendance');}
document.addEventListener('keydown',e=>{if(e.target.classList.contains('face-drop')&&['Enter',' '].includes(e.key)){e.preventDefault();document.getElementById('face-input').click();}});

const school=createSchoolUI({S,api,escape,icon,title,showModal,toast,refresh:load,render,age,statusName,time,navigateTo});
document.addEventListener('change',event=>school.change(event));
document.addEventListener('click',async e=>{
 const el=e.target.closest('[data-page],[data-action]');if(!el)return;
 if(el.dataset.page){navigateTo(el.dataset.page);return;}
 if(S.busy)return;
 const action=el.dataset.action,ch=S.children.find(x=>x.id===Number(el.dataset.id));
 try{
 if(await school.action(action,el,ch))return;
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
  if(inp){inp.value=email;pwd?.focus();toast(`Conta selecionada: ${email}. Digite a senha.`);}
 }
 if(action==='remove-saved'){
  removeSavedAccount(el.dataset.email);
  renderLogin(false);
  toast('Conta removida da lista deste aparelho.');
 }
 if(action==='logout'){await api('/auth/logout',{method:'POST'}).catch(()=>{});S.user=null;S.csrf='';S.token='';navHistory.length=0;renderLogin();toast('Sessão encerrada com sucesso.');}
 if(action==='install-modal')installModal();
 if(action==='privacy-terms')privacyModal();
 if(action==='pwa-prompt'){if(deferredPrompt){deferredPrompt.prompt();deferredPrompt.userChoice.then(()=>{deferredPrompt=null;});}else{toast('No Chrome, toque no menu (⋮) e selecione "Instalar aplicativo".');}}
 if(action==='close')modal.close();
 if(action==='attendance')await attendanceModal(ch);
 if(action==='notify')notifyModal(ch,el.dataset.kind);
 if(action==='consent')consentModal(ch);
 if(action==='face')faceModal(ch);
 if(action==='face-mode'){stopCamera();faceModal(ch,el.dataset.mode);}
 if(action==='request-consent'){modal.close();notifyModal(ch,'consent_request');}
 if(action==='filter-room'){S.room=String(el.dataset.id);navigateTo('attendance');return;}
 if(action==='new-user')userModal();
 if(action==='edit-user')userModal(S.users.find(u=>u.id===Number(el.dataset.id)));
 if(action==='read'){await api(`/notifications/${el.dataset.id}/read`,{method:'POST'});await load();}
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
 S.busy=true;if(button){button.disabled=true;button.dataset.origHtml=button.innerHTML;button.innerHTML='<span class="spin">●</span> Aguarde...';}
 try{
  if(kind==='verify-email'){await api('/auth/email/verify',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);toast('E-mail confirmado.');return;}
  if(kind==='mfa-setup'){const data=await api('/auth/mfa/setup',{method:'POST',body:values});showModal('Conectar autenticador','Adicione esta chave ao seu aplicativo autenticador.',`<p class="soft-info">${escape(data.secret)}</p><form data-form="mfa-confirm"><input name="secret" type="hidden" value="${escape(data.enrollment)}"/><label>Senha atual<input name="password" type="password" autocomplete="current-password" required/></label><label>Código do autenticador<input name="code" autocomplete="one-time-code" required/></label><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Confirmar ativação</button></form>`);return;}
  if(kind==='mfa-confirm'){const data=await api('/auth/mfa/confirm',{method:'POST',body:values});S.user.mfa_enabled=true;showModal('Guarde seus códigos de recuperação','Cada código funciona uma vez. Guarde em um local seguro.',`<div class="recovery-codes">${data.recovery_codes.map(code=>`<code>${escape(code)}</code>`).join('')}</div>`);return;}
  if(kind==='mfa-disable'){await api('/auth/mfa/disable',{method:'POST',body:values});S.user.mfa_enabled=false;modal.close();toast('Dois fatores desativados.');return;}
  if(kind==='accept-invite'){await api('/family/accept',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);await load();toast('Vínculo confirmado.');return;}
  if(kind==='recovery'){const r=await api('/auth/recovery',{method:'POST',body:values});modal.close();toast(r.message);return;}
  if(kind==='reset'){if(values.password!==values.confirm)throw new Error('As senhas não conferem.');await api('/auth/reset',{method:'POST',body:values});modal.close();history.replaceState({},'',location.pathname);renderLogin();toast('Senha atualizada. Entre com sua nova senha.');return;}
  if(kind==='family-invite'){const r=await api(`/children/${cid}/family/invites`,{method:'POST',body:values});showModal('Convite criado','Envie este link à pessoa autorizada. Válido por 48 horas.',`<label>Link do convite<input readonly value="${escape(r.url)}"/></label>`);return;}
  const schoolResult=await school.submit(form,values);if(schoolResult){modal.close();await load();toast(schoolResult.message||schoolResult);if(schoolResult.roomId)school.lessonForm(schoolResult.roomId);return;}
  if(kind==='login'||kind==='register'){if(NATIVE&&!S.apiOrigin)throw new Error('Configure o servidor HTTPS do aplicativo.');const result=await api('/auth/'+kind,{method:'POST',body:{...values,terms_accepted:values.terms_accepted==='on',terms_version:'2026.1'}});S.user=result.user;S.csrf=result.csrf;S.token='';saveAccount(result.user);navHistory.length=0;S.page=S.user.role==='teacher'?'rooms':'overview';await load();const invite=new URL(location.href).searchParams.get('invite');if(invite)showModal('Convite de responsável','Aceite apenas se você conhece a família.',`<form data-form="accept-invite"><input type="hidden" name="token" value="${escape(invite)}"/><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Aceitar convite</button></form>`);return;}
  if(kind==='password'){if(values.password!==values.confirm)throw new Error('As novas senhas não conferem.');await api('/auth/password',{method:'POST',body:{current:values.current,password:values.password}});form.reset();toast('Sua senha foi atualizada.');return;}
  if(kind==='guardian')await api(`/children/${cid}/guardian`,{method:'POST',body:{parent_id:Number(values.parent_id)}});
  if(kind==='attendance'){
    const attRes=await api(`/children/${cid}/attendance`,{method:'POST',body:{action:form.dataset.direction,guardian_confirmed:values.confirmed==='on',guardian_id:Number(values.guardian_id)||child.parent_id,lesson_id:S.page==='attendance'?(S.selectedLesson||null):null,claim_code:values.claim_code?values.claim_code.toUpperCase().trim():undefined}});
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
 }catch(err){if(err.code==='mfa'){const otp=document.getElementById('login-otp-label');if(otp){otp.hidden=false;otp.querySelector('input').focus();}}if(error)error.textContent=err.message;else toast(err.message,true);}
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
 if(NATIVE&&!S.apiOrigin){renderLogin();return;}
 try{const health=await api('/health');S.google=health.google_enabled;}catch{renderLogin();toast('Não foi possível conectar. Verifique sua internet e tente entrar novamente.',true);return;}
 try{const data=await api('/me');S.user=data.user;S.csrf=data.csrf;saveAccount(data.user);S.page=S.user.role==='teacher'?'rooms':'overview';await load();}catch{renderLogin();}
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
 if(!S.user||document.hidden||S.busy||syncing)return;
 syncing=true;const uid=S.user.id;
 try{
  const revision=(await api('/sync')).revision;if(revision===liveRevision)return;
  const [notifications,lessons,rooms,children]=await Promise.all([api('/notifications'),api('/lessons'),api('/rooms'),api('/children')]);
  if(S.user?.id!==uid)return;
  const previous=new Set(S.notifications.map(n=>n.id));
  const newNotice=notifications.some(n=>!n.read_at&&!previous.has(n.id));
  const changed=JSON.stringify([notifications,lessons,rooms,children])!==JSON.stringify([S.notifications,S.lessons,S.rooms,S.children]);
  Object.assign(S,{notifications,lessons,rooms,children});
  const editing=modal.open||app.contains(document.activeElement)&&document.activeElement.matches('input,textarea,select');
  if(!editing){liveRevision=revision;if(changed)render();}
  if(newNotice)toast('Você recebeu um novo aviso. Abra Avisos para conferir.');
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
