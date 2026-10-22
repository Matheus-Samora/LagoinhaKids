import {uiIcon} from '../ui/icons.js';
import {accountProfileUI} from '../account-profile.js';
import {guardForm} from '../form-lifecycle.js';
import './hall.css';

const categories={general:'Comunidade',testimony:'Gratidão',prayer:'Oração',welcome:'Boas-vindas'};
const paths={heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',chat:'M21 11.5a8.4 8.4 0 0 1-9 8.5 10 10 0 0 1-4-.8L3 21l1.8-5a9 9 0 1 1 16.2-4.5Z',spark:'m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z',arrow:'M4 12h16m-6-6 6 6-6 6',flag:'M5 21V3m0 1c6-4 8 4 14 0v10c-6 4-8-4-14 0',pen:'m16 3 5 5-12 12-6 1 1-6Zm-2 2 5 5',search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',check:'m5 12 4 4L19 6'};
const symbol=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.spark}"/></svg>`;
export function communityHallUI({api,e,identity,onProfileSaved}){
 let host,mode='wall',category='all',mine=false,author=null,feed=[],members=[],page=1,memberPage=1,more=false,memberMore=false,feedGeneration=0,peopleGeneration=0,moderator=false;
 const user=()=>identity().user;
 const when=value=>{const d=new Date(value);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);};
 const avatar=(name,url,size='')=>`<span class="ch-avatar ${size}"><span>${e((name||'L').trim().split(/\s+/).slice(0,2).map(x=>x.match(/\p{L}/u)?.[0]||'').join(''))}</span>${url?`<img src="${e(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>`;
 const text=value=>e(value).replace(/\n/g,'<br>');
 const status=(message,error=false)=>{if(!host?.isConnected)return;const el=host.querySelector('[data-hall-status]');if(el){el.textContent=message;el.classList.toggle('is-error',error);}};
 const options=selected=>Object.entries(categories).map(([key,label])=>`<option value="${key}" ${selected===key?'selected':''}>${label}</option>`).join('');

 function postCard(p){return `<article class="ch-post" data-post="${e(p.id)}"><div class="ch-post-head">${avatar(p.author_name,p.author_avatar)}<div><strong>${e(p.author_name)}</strong><time datetime="${e(p.created_at)}">${when(p.created_at)}${p.version>1?' · editado':''}</time></div><span class="ch-category ch-category-${p.kind}">${e(categories[p.kind]||'Comunidade')}</span></div><p class="ch-post-text">${text(p.content)}</p><div class="ch-post-actions"><button type="button" data-react="${p.id}" aria-pressed="${p.reacted}" class="${p.reacted?'is-reacted':''}">${symbol('heart')} <span>${p.reactions}</span> <span class="ch-action-label">Acolher</span></button><button type="button" data-discuss="${p.id}">${symbol('chat')} ${p.comments} <span class="ch-action-label">Conversar</span></button><details class="ch-post-menu"><summary aria-label="Opções da publicação">•••</summary><div>${p.is_mine?`<button type="button" data-edit-post="${p.id}">${symbol('pen')} Editar</button>`:''}${p.can_manage?`<button type="button" data-archive-post="${p.id}">Remover do mural</button>`:''}${!p.is_mine?`<button type="button" data-report-post="${p.id}">${symbol('flag')} Sinalizar</button>`:''}</div></details></div></article>`;}
 function personCard(p){return `<article class="ch-person">${avatar(p.name,p.avatar_url,'ch-avatar-lg')}<h3>${e(p.name)}${p.is_me?'<small>Você</small>':''}</h3><p class="ch-person-role">${e(p.profession||'Membro da comunidade')}</p><p class="ch-person-bio">${e(p.bio||'Cada pessoa faz parte da nossa história.')}</p><div class="ch-person-tags">${p.cell_name?`<span>${uiIcon('groups',14)}${e(p.cell_name)}</span>`:''}${(p.ministries||[]).slice(0,2).map(m=>`<span>${uiIcon('ministries',14)}${e(m.ministry)}</span>`).join('')}</div><button type="button" class="ch-outline" data-person="${e(p.id)}">Conhecer perfil ${symbol('arrow',16)}</button></article>`;}
 function empty(title,description){return `<div class="ch-empty">${symbol('spark',32)}<h3>${title}</h3><p>${description}</p></div>`;}
 function paintFeed(){const list=host.querySelector('[data-feed]');list.innerHTML=feed.length?feed.map(postCard).join(''):empty('A conversa começa aqui','Compartilhe uma novidade, uma palavra de gratidão ou um pedido de oração.');host.querySelector('[data-more-posts]').hidden=!more;}
 async function loadFeed(append=false){
  const n=++feedGeneration,next=append?page+1:1;
  const result=await api(`/platform/hall/posts?page=${next}&kind=${category}&mine=${mine}${author?'&author='+author:''}`);
  if(n!==feedGeneration||!host.isConnected)return;
  feed=append?[...feed,...result.items.filter(p=>!feed.some(old=>old.id===p.id))]:result.items;page=next;more=result.has_more;moderator=result.can_moderate;
  host.querySelector('[data-mod-tab]').hidden=!moderator;
  host.querySelector('[data-people-count]').textContent=result.stats.members;
  host.querySelector('[data-post-count]').textContent=result.stats.posts;
  paintFeed();const refresh=host.querySelector('[data-hall-refresh]');refresh.classList.remove('has-news');refresh.setAttribute('aria-label','Atualizar Hall');
 }
 async function loadPeople(append=false){
  const form=host.querySelector('[data-people-search]'),n=++peopleGeneration,next=append?memberPage+1:1;
  const query=new URLSearchParams(new FormData(form));query.set('page',String(next));
  const result=await api('/platform/hall/members?'+query);
  if(n!==peopleGeneration||!host.isConnected)return;
  members=append?[...members,...result.members.filter(p=>!members.some(old=>old.id===p.id))]:result.members;memberPage=next;memberMore=result.has_more;
  const select=form.elements.ministry,selected=select.value;
  select.innerHTML='<option value="">Todos os ministérios</option>'+result.catalog.map(x=>`<option ${x===selected?'selected':''}>${e(x)}</option>`).join('');
  host.querySelector('[data-member-results]').textContent=`${result.total} ${result.total===1?'pessoa encontrada':'pessoas encontradas'}`;
  host.querySelector('[data-people-grid]').innerHTML=members.length?members.map(personCard).join(''):empty('Nenhum perfil encontrado','Experimente outro nome ou limpe o filtro de ministério.');
  host.querySelector('[data-more-people]').hidden=!memberMore;
 }
 function dialog(title,body){
  const d=document.createElement('dialog');d.className='ch-dialog';d.setAttribute('aria-label',title);d.innerHTML=`<div class="ch-dialog-heading"><h2>${e(title)}</h2><button type="button" data-ch-close aria-label="Fechar">×</button></div>${body}`;document.body.append(d);d.querySelector('[data-ch-close]').onclick=()=>d.close();d.addEventListener('close',()=>d.remove(),{once:true});d.addEventListener('error',ev=>{if(ev.target.matches?.('.ch-avatar img'))ev.target.remove();},true);d.showModal();return d;
 }
 async function discussion(rid){
  const d=dialog('Conversa no Hall','<p role="status">Carregando conversa…</p>');
  try{
   const p=await api('/platform/hall/posts/'+rid);if(!d.isConnected)return;
   d.innerHTML=`<div class="ch-dialog-heading"><h2>Conversa no Hall</h2><button type="button" data-ch-close aria-label="Fechar">×</button></div><div class="ch-discussion-post">${postCard(p)}</div><h3 class="ch-comments-title">Comentários</h3><p role="alert" data-comment-error></p><div class="ch-comments" data-comments></div><button type="button" class="ch-outline" data-more-comments hidden>Comentários anteriores</button><form class="ch-comment-form"><label for="hall-comment">Sua mensagem</label><textarea id="hall-comment" name="content" required maxlength="600" rows="3" placeholder="Participe desta conversa com carinho."></textarea><button type="submit" class="ch-primary">Enviar comentário ${symbol('arrow')}</button><p role="status" data-comment-status></p></form>`;
   d.querySelector('[data-ch-close]').onclick=()=>d.close();
   // The discussion header is context; its actions live on the main wall.
   d.querySelector('.ch-post-actions').remove();
   const form=d.querySelector('form'),guard=guardForm(form,d);let requestId=crypto.randomUUID(),commentPage=1;
   const load=async(append=false)=>{
    const result=await api(`/platform/hall/posts/${rid}/comments?page=${append?commentPage+1:1}`);if(!d.isConnected)return;
    commentPage=append?commentPage+1:1;
    const html=result.items.map(c=>`<article class="ch-comment">${avatar(c.author_name,c.author_avatar,'ch-avatar-sm')}<div><strong>${e(c.author_name)}</strong><time>${when(c.created_at)}</time><p>${text(c.content)}</p>${c.can_manage?`<button type="button" data-remove-comment="${c.id}">Remover</button>`:''}</div></article>`).join('');
    if(append)d.querySelector('[data-comments]').insertAdjacentHTML('beforeend',html);else d.querySelector('[data-comments]').innerHTML=html||'<p class="ch-muted">Seja o primeiro a conversar.</p>';
    d.querySelector('[data-more-comments]').hidden=!result.has_more;
   };
   const error=err=>{if(d.isConnected)d.querySelector('[data-comment-error]').textContent=err.message;};
   d.querySelector('[data-more-comments]').onclick=async ev=>{ev.currentTarget.disabled=true;try{await load(true);}catch(err){error(err);}finally{if(d.isConnected)d.querySelector('[data-more-comments]').disabled=false;}};
   d.addEventListener('click',async ev=>{const b=ev.target.closest('[data-remove-comment]');if(!b)return;if(!confirm('Remover este comentário da conversa?'))return;b.disabled=true;try{await api('/platform/hall/comments/'+b.dataset.removeComment,{method:'DELETE'});await load();}catch(err){error(err);b.disabled=false;}});
   form.onsubmit=async ev=>{
    ev.preventDefault();if(guard.busy)return;guard.setBusy(true);d.querySelector('[data-comment-error]').textContent='';
    try{await api('/platform/hall/posts/'+rid+'/comments',{method:'POST',body:{request_id:requestId,content:form.elements.content.value}});}catch(err){guard.setBusy(false);error(err);return;}
    form.reset();requestId=crypto.randomUUID();guard.complete();d.querySelector('[data-comment-status]').textContent='Comentário enviado.';
    try{await load();await updatePost(rid);}catch(err){error(new Error('Comentário enviado. Não foi possível atualizar a conversa. Reabra para conferir.'));}
   };
   await load();
   const onRtComment = ev => {
     if (d.isConnected && ev.detail?.post_id === rid) void load();
   };
   window.addEventListener('lagoinha:realtime:hall:comment', onRtComment);
   window.addEventListener('lagoinha:realtime:hall:comment_removed', onRtComment);
   d.addEventListener('close', () => {
     window.removeEventListener('lagoinha:realtime:hall:comment', onRtComment);
     window.removeEventListener('lagoinha:realtime:hall:comment_removed', onRtComment);
   }, { once: true });
  }catch(err){if(d.isConnected)d.querySelector('[role=status]').textContent=err.message;}
 }
 async function updatePost(rid){const fresh=await api('/platform/hall/posts/'+rid);feed=feed.map(p=>p.id===rid?fresh:p);const old=host.querySelector(`[data-post="${rid}"]`);if(old)old.outerHTML=postCard(fresh);}
 function profile(p){
  const d=dialog('Conheça quem caminha com você',`<div class="ch-profile">${avatar(p.name,p.avatar_url,'ch-avatar-xl')}<h2>${e(p.name)}</h2><span class="ch-muted">${e(p.profession||'Comunidade Lagoinha')}</span>${p.bio?`<p>${text(p.bio)}</p>`:''}<div class="ch-person-tags">${p.cell_name?`<span>${uiIcon('groups',16)} ${e(p.cell_name)}</span>`:''}${(p.ministries||[]).map(m=>`<span>${e(m.ministry)}${m.is_leader?' · Liderança':''}</span>`).join('')}</div>${p.is_me?'<button type="button" class="ch-primary" data-own-profile>Editar meu perfil</button>':p.account_user_id?'<button type="button" class="ch-primary" data-author-posts>Ver publicações</button>':'<p class="ch-muted">Este perfil ainda não tem publicações vinculadas.</p>'}</div>`);
  d.querySelector('[data-own-profile]')?.addEventListener('click',()=>{d.close();editProfile();});
  d.querySelector('[data-author-posts]')?.addEventListener('click',async()=>{d.close();author=p.account_user_id;mine=false;switchMode('wall');host.querySelector('[data-clear-author]').hidden=false;try{await loadFeed();}catch(err){status(err.message,true);}});
 }
 function editProfile(){void accountProfileUI({api,e,onSaved:u=>{identity().user=u;onProfileSaved?.(u);status('Perfil atualizado.');void loadPeople().catch(err=>status(err.message,true));}}).open();}
 function editPost(p){
  const d=dialog('Editar publicação',`<form class="ch-edit-form"><label>Categoria<select name="kind">${options(p.kind)}</select></label><label>Mensagem<textarea name="content" required minlength="2" maxlength="2000" rows="7">${e(p.content)}</textarea></label><p role="alert"></p><button type="submit" class="ch-primary">Salvar alterações</button></form>`),form=d.querySelector('form'),guard=guardForm(form,d);
  form.onsubmit=async ev=>{ev.preventDefault();if(guard.busy)return;guard.setBusy(true);try{await api('/platform/hall/posts/'+p.id,{method:'PATCH',body:{version:p.version,kind:form.elements.kind.value,content:form.elements.content.value}});}catch(err){guard.setBusy(false);form.querySelector('[role=alert]').textContent=err.message;return;}guard.complete();d.close();status('Publicação atualizada.');try{await updatePost(p.id);}catch(err){status('Publicação salva. Atualize o mural para conferir.',true);}};
 }
 function reportPost(p){
  const d=dialog('Sinalizar publicação',`<form class="ch-edit-form"><p>A coordenação de Members vai analisar. O autor não recebe a identificação de quem sinalizou.</p><label>Motivo<select name="reason"><option value="inappropriate">Conteúdo inadequado</option><option value="privacy">Exposição de dados pessoais</option><option value="spam">Spam ou divulgação repetida</option><option value="other">Outro motivo</option></select></label><p role="alert"></p><button type="submit" class="ch-primary">Enviar para análise</button></form>`),form=d.querySelector('form'),guard=guardForm(form,d);
  form.onsubmit=async ev=>{ev.preventDefault();if(guard.busy)return;guard.setBusy(true);try{await api('/platform/hall/posts/'+p.id+'/report',{method:'POST',body:{reason:form.elements.reason.value}});guard.complete();d.close();status('Sinalização enviada à coordenação.');}catch(err){guard.setBusy(false);form.querySelector('[role=alert]').textContent=err.message;}};
 }
 async function moderation(){
  const result=await api('/platform/hall/reports');if(!host.isConnected)return;
  const reasons={inappropriate:'Conteúdo inadequado',privacy:'Privacidade',spam:'Spam',other:'Outro motivo'};
  host.querySelector('[data-reports]').innerHTML=result.items.length?result.items.map(r=>`<article class="ch-post"><span class="ch-category">${reasons[r.reason]}</span><h3>${e(r.author_name)}</h3><p class="ch-post-text">${text(r.content)}</p><div class="ch-tools"><button type="button" class="ch-outline" data-hide-report="${r.post_id}" data-version="${r.version}">Retirar do mural</button><button type="button" class="ch-outline" data-resolve-report="${r.post_id}">Concluir análise</button></div></article>`).join(''):empty('Tudo em ordem','Nenhuma sinalização aguardando análise.');
 }
 function switchMode(next){mode=next;status('');history.replaceState({},'',location.pathname+location.search+'#hall'+(next==='people'?'/people':next==='reports'?'/moderation':''));host.querySelectorAll('[data-hall-mode]').forEach(b=>{b.classList.toggle('is-active',b.dataset.hallMode===next);b.setAttribute('aria-pressed',String(b.dataset.hallMode===next));});host.querySelectorAll('[data-hall-view]').forEach(el=>el.hidden=el.dataset.hallView!==next);}

 async function mount(target){
  host=target;mode='wall';category='all';mine=false;author=null;feed=[];members=[];page=1;memberPage=1;host.classList.add('community-hall');
  host.innerHTML=`<section class="ch-hero"><div class="ch-hero-copy"><span class="ch-eyebrow">LAGOINHA · NOSSA COMUNIDADE</span><h1>Juntos, fazemos<br>parte de algo maior.</h1><p>Um lugar para se conhecer, compartilhar e caminhar junto.</p><div class="ch-hero-stats"><span><b data-people-count>—</b> pessoas</span><i></i><span><b data-post-count>—</b> publicações</span></div></div><div class="ch-orbit" aria-hidden="true"><span></span><span></span><span></span><div>${uiIcon('community',54)}</div><b>PERTENCER<br>É CAMINHAR JUNTO</b></div></section><nav class="ch-tabs" aria-label="Hall de Membros"><button type="button" class="is-active" data-hall-mode="wall" aria-pressed="true">${symbol('chat')} Mural</button><button type="button" data-hall-mode="people" aria-pressed="false">${uiIcon('community',18)} Pessoas</button><button type="button" data-hall-mode="reports" data-mod-tab hidden aria-pressed="false">${symbol('flag')} Moderação</button><button type="button" class="ch-refresh" data-hall-refresh aria-label="Atualizar Hall">${uiIcon('transactions',18)}</button></nav><p role="status" data-hall-status aria-live="polite"></p><div data-hall-view="wall" class="ch-layout"><div class="ch-main"><form class="ch-composer"><div class="ch-composer-start">${avatar(user().name,user().avatar_url)}<label for="hall-content">O que vamos compartilhar hoje?</label></div><textarea id="hall-content" name="content" rows="3" required minlength="2" maxlength="2000" placeholder="Uma novidade, uma gratidão, uma palavra que acolhe…"></textarea><div class="ch-compose-footer"><select name="kind" aria-label="Tipo de publicação">${options('general')}</select><small data-character-count>0 / 2000</small><button type="submit" class="ch-primary">Publicar ${symbol('arrow',16)}</button></div><p role="alert"></p></form><div class="ch-feed-tools"><h2>Conversas da comunidade</h2><div><select data-category aria-label="Filtrar publicações"><option value="all">Todos os assuntos</option>${options('')}</select><button type="button" class="ch-filter" data-mine aria-pressed="false">Minhas publicações</button><button type="button" class="ch-filter" data-clear-author hidden>Limpar pessoa</button></div></div><div class="ch-feed" data-feed>${empty('Preparando seu mural','Só um instante…')}</div><button type="button" class="ch-load-more" data-more-posts hidden>Ver mais conversas</button></div><aside class="ch-aside"><section class="ch-side-card ch-profile-nudge"><span class="ch-side-icon">${uiIcon('identity',26)}</span><h2>Que bom ter você aqui.</h2><p>Seu rosto e sua história aproximam a nossa comunidade.</p><button type="button" class="ch-outline" data-edit-profile>Meu perfil ${symbol('arrow',16)}</button></section><section class="ch-side-card ch-gc-nudge">${uiIcon('groups',28)}<span class="ch-eyebrow">CONEXÕES QUE CONTINUAM</span><h2>Tem lugar para você<br>em um GC.</h2><a href="/membro#gcs">Conhecer os grupos ${symbol('arrow',16)}</a></section><details class="ch-guidelines"><summary>Um espaço de cuidado</summary><p>Respeite cada pessoa. Compartilhe apenas o que deseja tornar visível aos membros. Use “Sinalizar” para pedir ajuda à coordenação.</p></details></aside></div><section data-hall-view="people" hidden><div class="ch-people-heading"><div><h2>Pessoas, histórias e conexões.</h2><p>Conheça quem faz parte da nossa comunidade.</p></div><button type="button" class="ch-outline" data-edit-profile>Meu perfil ${symbol('pen',16)}</button></div><form class="ch-people-search" data-people-search><label>${symbol('search')}<input name="q" maxlength="100" aria-label="Buscar pessoas" placeholder="Buscar por nome ou profissão"></label><select name="ministry" aria-label="Filtrar por ministério"><option value="">Todos os ministérios</option></select><button type="submit" class="ch-primary">Buscar</button><button type="button" class="ch-outline" data-clear-people>Limpar</button></form><p class="ch-muted" data-member-results></p><div class="ch-people-grid" data-people-grid></div><button type="button" class="ch-load-more" data-more-people hidden>Conhecer mais pessoas</button></section><section data-hall-view="reports" hidden><h2>Cuidar da comunidade</h2><p class="ch-muted">Analise as sinalizações e preserve um ambiente acolhedor.</p><div data-reports></div></section>`;
  host.addEventListener('error',ev=>{if(ev.target.matches?.('.ch-avatar img'))ev.target.remove();},true);
  const composer=host.querySelector('.ch-composer'),guard=guardForm(composer);let requestId=crypto.randomUUID();
  composer.elements.content.oninput=()=>{host.querySelector('[data-character-count]').textContent=`${composer.elements.content.value.length} / 2000`;};
  composer.onsubmit=async ev=>{
   ev.preventDefault();if(guard.busy)return;guard.setBusy(true);composer.querySelector('[role=alert]').textContent='';
   try{await api('/platform/hall/posts',{method:'POST',body:{request_id:requestId,content:composer.elements.content.value,kind:composer.elements.kind.value}});}catch(err){guard.setBusy(false);composer.querySelector('[role=alert]').textContent=err.message;return;}
   composer.reset();requestId=crypto.randomUUID();guard.complete();host.querySelector('[data-character-count]').textContent='0 / 2000';status('Sua publicação já faz parte do mural.');
   try{await loadFeed();}catch(err){status('Publicação salva. Toque em atualizar para conferir o mural.',true);}
  };
  host.querySelector('[data-people-search]').onsubmit=ev=>{ev.preventDefault();void loadPeople().catch(err=>status(err.message,true));};
  host.querySelector('[data-category]').onchange=async ev=>{category=ev.target.value;try{await loadFeed();}catch(err){status(err.message,true);}};
  host.onclick=async ev=>{
   const b=ev.target.closest('button');if(!b||b.type==='submit')return;
   try{
    if(b.dataset.hallMode){switchMode(b.dataset.hallMode);if(mode==='reports')await moderation();return;}
    if(b.hasAttribute('data-edit-profile')){editProfile();return;}
    if(b.hasAttribute('data-hall-refresh')){b.disabled=true;await Promise.all([loadFeed(),loadPeople()]);if(mode==='reports')await moderation();status('Hall atualizado.');return;}
    if(b.hasAttribute('data-mine')){mine=!mine;author=null;b.setAttribute('aria-pressed',String(mine));b.classList.toggle('is-active',mine);host.querySelector('[data-clear-author]').hidden=true;await loadFeed();return;}
    if(b.hasAttribute('data-clear-author')){author=null;b.hidden=true;await loadFeed();return;}
    if(b.hasAttribute('data-more-posts')){b.disabled=true;await loadFeed(true);return;}
    if(b.hasAttribute('data-more-people')){b.disabled=true;await loadPeople(true);return;}
    if(b.hasAttribute('data-clear-people')){host.querySelector('[data-people-search]').reset();await loadPeople();return;}
    if(b.dataset.person){const p=members.find(x=>x.id===b.dataset.person);if(p)profile(p);return;}
    if(b.dataset.discuss){await discussion(b.dataset.discuss);return;}
    if(b.dataset.react){b.disabled=true;const p=feed.find(x=>x.id===b.dataset.react);const result=await api('/platform/hall/posts/'+p.id+'/reaction',{method:'PUT',body:{active:!p.reacted}});Object.assign(p,result);b.setAttribute('aria-pressed',String(p.reacted));b.classList.toggle('is-reacted',p.reacted);b.querySelector('span').textContent=p.reactions;return;}
    if(b.dataset.editPost){editPost(feed.find(x=>x.id===b.dataset.editPost));return;}
    if(b.dataset.reportPost){reportPost(feed.find(x=>x.id===b.dataset.reportPost));return;}
    if(b.dataset.archivePost||b.dataset.hideReport){if(!confirm('Retirar esta publicação do mural?'))return;b.disabled=true;const rid=b.dataset.archivePost||b.dataset.hideReport,p=feed.find(x=>x.id===rid);await api(`/platform/hall/posts/${rid}?version=${p?.version||b.dataset.version}`,{method:'DELETE'});await loadFeed();if(mode==='reports')await moderation();status('Publicação retirada do mural.');return;}
    if(b.dataset.resolveReport){b.disabled=true;await api('/platform/hall/posts/'+b.dataset.resolveReport+'/resolve-reports',{method:'POST'});await moderation();status('Análise concluída.');}
   }catch(err){status(err.message,true);}finally{if(b.isConnected)b.disabled=false;}
  };
  const initialView=location.hash.split('/')[1];if(initialView==='people')switchMode('people');
  try{await Promise.all([loadFeed(),loadPeople()]);if(initialView==='moderation'&&moderator){switchMode('reports');await moderation();}const rid=location.hash.split('/')[1];if(rid&&/^[\da-f-]{36}$/i.test(rid))await discussion(rid);}catch(err){status(err.message+' Toque em atualizar para tentar novamente.',true);}
 }
 document.addEventListener('lagoinha:profile-saved',ev=>{if(!host?.isConnected)return;const old=host.querySelector('.ch-composer-start .ch-avatar');if(old)old.outerHTML=avatar(ev.detail.name,ev.detail.avatar_url);});
 window.addEventListener('lagoinha:realtime:hall:reaction', ev => {
   if (!host?.isConnected) return;
   const { post_id, reactions, actor_id, active } = ev.detail || {};
   const btn = host.querySelector(`[data-post="${post_id}"] [data-react]`);
   if (btn) {
     const sp = btn.querySelector('span');
     if (sp) sp.textContent = reactions;
     if (actor_id === user().id && typeof active === 'boolean') {
       btn.setAttribute('aria-pressed', String(active));
       btn.classList.toggle('is-reacted', active);
     }
   }
   const p = feed.find(x => x.id === post_id);
   if (p) { p.reactions = reactions; if (actor_id === user().id && typeof active === 'boolean') p.reacted = active; }
 });
 window.addEventListener('lagoinha:realtime:hall:post', async () => {
   if (!host?.isConnected) return;
   // Reload through the API: counts, filters and management permissions belong
   // to the current viewer, never to the user who published the event.
   if (mode === 'wall' && page === 1) {
     try { await loadFeed(); } catch (err) { status(err.message, true); }
   } else {
     const refresh = host.querySelector('[data-hall-refresh]');
     if (refresh) {
       refresh.classList.add('has-news');
       refresh.setAttribute('aria-label', 'Conversas atualizadas. Atualizar Hall.');
     }
   }
 });
 window.addEventListener('lagoinha:realtime:hall:comment', ev => {
   if (!host?.isConnected) return;
   const { post_id, comments_count } = ev.detail || {};
   const btn = host.querySelector(`[data-post="${post_id}"] [data-discuss]`);
   if (btn) {
     btn.innerHTML = `${symbol('chat')} ${comments_count} <span class="ch-action-label">Conversar</span>`;
   }
   const p = feed.find(x => x.id === post_id);
   if (p) p.comments = comments_count;
 });
 return {mount};
}
