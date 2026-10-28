import {communityHallUI} from './hall.js';
import {accountProfileUI} from '../account-profile.js';
import {guardForm} from '../form-lifecycle.js';
import {uiIcon} from '../ui/icons.js';
import {ministryEmblem,MINISTRY_META} from './emblems.js';
import {t, translateDOM} from './i18n.js';

export function createSectors({api,e,identity,openQrModal,onTabChange,onProfileSaved}){
 const hall=communityHallUI({api,e,identity,onProfileSaved});
 let key='',data={},directory=[],query='',ministryFilter='',cellFilter='',activeTab='all',generation=0,host,peoplePage=1;
 const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
 const date=v=>v?v.slice(0,10).split('-').reverse().join('/'):'—';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const id=()=>crypto.randomUUID();
 const role=()=>{
  if(identity().platform_admin)return 'admin';
  if(identity().pastor)return 'pastor';
  return identity().modules.find(m=>m.id===key)?.role;
 };
 const edit=()=>['admin','pastor','editor','leader'].includes(role());
 const canArchive=()=>['admin','pastor','leader'].includes(role());

 const labels={
  cells:'GCs',
  families:'Famílias',
  people:'Membros',
  schedules:'Escalas',
  assignments:'Equipe',
  resources:'Materiais',
  closings:'Fechamento do culto',
  'cost-centers':'Centros de custo',
  accounts:'Contas',
  entries:'Lançamentos',
  invoices:'Notas Fiscais'
 };
 const stageLabels={
  visitor:'Visitante',
  welcoming:'Acolhimento',
  gc:'Participação em GC',
  serving:'Serviço',
  new_convert:'Novo Convertido',
  baptized:'Batizado',
  in_training:'Trilha DNA',
  active_member:'Membro Ativo',
  leader:'⭐ Líder'
 };
 const trainingLabels={
  certified:'Certificado',
  in_training:'Em Treinamento',
  pending:'Pendente'
 };
 const scheduleStatusLabels={
  confirmed:'Confirmado',
  pending:'Aguardando',
  declined:'Indisponível'
 };
 const resourceCatLabels={
  repertorio:'Repertório / Cifras',
  roteiro:'Roteiro de Culto',
  checklist:'Checklist',
  documento:'Documento'
 };
 const paymentMethodLabels={
  pix:'PIX',
  cash:'Espécie',
  card:'Cartão',
  transfer:'TED / Boleto',
  multi:'Múltiplos'
 };
 const WORSHIP_ROLES=[
  'Ministro de Louvor',
  'Vocal / Backing Vocal',
  'Tecladista',
  'Baterista',
  'Guitarrista',
  'Violonista',
  'Baixista',
  'Cordas / Sopros',
  'Diretor Musical',
  'VS / Tracks'
 ];

 const button=(action,text,extra='')=>`<button type="button" data-sector-action="${action}" ${extra}>${text}</button>`;
 const options=(rows,field='name')=>rows.map(r=>[r.id,r[field]+(rows.filter(x=>x[field]===r[field]).length>1?' · '+String(r.id).slice(-6):'')]);

 function cleanPhone(p){
  const digits=String(p||'').replace(/\D/g,'');
  if(!digits)return '';
  return digits.startsWith('55')?digits:'55'+digits;
 }


 function statCard(label,value,helper='',symbol=''){
  return `<article class="stat"><div><span>${label}</span><strong>${value}</strong>${helper?`<small>${helper}</small>`:''}</div>${symbol?`<span class="stat-icon" aria-hidden="true">${symbol}</span>`:''}</article>`;
 }

 function heroBanner(){
  const actions=key==='members'
   ?`${button('new','+ Membro','data-kind="people"')}${button('new','+ Família','class="ghost" data-kind="families"')}${button('self-reg-modal','Ficha de cadastro','class="ghost"')}`
   :key==='ministries'
   ?`${button('new','+ Vincular','data-kind="assignments"')}${button('worship-scale-modal','+ Escala de louvor','class="ghost"')}${button('new','+ Material','class="ghost" data-kind="resources"')}`
   :`${button('new','+ Lançamento','data-kind="entries"')}${button('new','+ Fechamento do culto','class="ghost" data-kind="closings"')}${button('new','+ Conta','class="ghost" data-kind="accounts"')}`;
  return `<section class="sector-actions" aria-label="Ações do setor">${edit()?actions:''}${key==='finance'?button('finance-report-modal','Relatórios','class="secondary"'):''}</section>`;
 }

 function selfRegistrationsPanel(){
  if(key!=='members')return '';
  const regs=data.self_registrations||[];
  const gcApps=data.gc_applications||[];
  if(!regs.length&&!gcApps.length)return '';
  return `
   ${gcApps.length?`<section class="panel sector-section" style="border-color:#0f766e;background:#f0fdfa;">
    <div class="section-title">
     <h2 style="color:#115e59;">Inscrições nos GCs (${gcApps.length})</h2>
    </div>
    <div class="sector-table">
     <table>
      <thead><tr><th>Candidato</th><th>GC</th><th>Notas</th><th>Ações</th></tr></thead>
      <tbody>
       ${gcApps.map(a=>{
                return `<tr>
         <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem telefone')}</small></td>
         <td><span class="badge" style="background:#0f766e;color:#fff;">${e(a.target_name)}</span><small>${e(a.role_desired||'Participante')}</small></td>
         <td><small>${e(a.notes||'—')}</small></td>
         <td class="row-buttons">${edit()?`${button('approve-gc-app','Aprovar',`data-id="${e(a.id)}"`)}${button('reject-gc-app','Recusar',`class="secondary" data-id="${e(a.id)}"`)}`:'<span>Aguardando</span>'}</td>
        </tr>`;
       }).join('')}
      </tbody>
     </table>
    </div>
   </section>`:''}
   ${regs.length?`<section class="panel sector-section pending-registrations"><div class="section-title"><h2>Cadastros pendentes (${regs.length})</h2></div><div class="sector-table"><table><thead><tr><th>Nome</th><th>Família</th><th>Jornada</th><th>Ações</th></tr></thead><tbody>${regs.map(r=>`<tr><td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'Sem contato')}</small></td><td>${e(r.family_name||'—')}<small>${e(r.address||'')}</small></td><td><span class="badge">${e(stageLabels[r.integration_stage]||r.integration_stage)}</span></td><td class="row-buttons">${edit()?`${button('approve-self-reg','Aprovar',`data-id="${e(r.id)}"`)}${button('reject-self-reg','Recusar',`class="secondary" data-id="${e(r.id)}"`)}`:'<span>Aguardando</span>'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;
 }

 function ministryApplicationsPanel(){
  if(key!=='ministries')return '';
  const apps=(data.applications||[]).filter(a=>!ministryFilter||a.target_name===ministryFilter);
  if(!apps.length)return '';
  return `<section class="panel sector-section" style="border-color:#4338ca;background:#eef2ff;">
   <div class="section-title">
    <h2 style="color:#312e81;">Candidaturas (${apps.length})</h2>
   </div>
   <div class="sector-table">
    <table>
     <thead><tr><th>Candidato</th><th>Ministério / Função</th><th>Notas</th><th>Ações</th></tr></thead>
     <tbody>
      ${apps.map(a=>{
              return `<tr>
        <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem contato')}</small></td>
        <td><span class="badge" style="background:#4338ca;color:#fff;">${e(a.target_name)}</span><small>${e(a.role_desired||'Voluntário')}</small></td>
        <td><small>${e(a.notes||'—')}</small></td>
        <td class="row-buttons">${edit()?`${button('approve-min-app','Aprovar',`data-id="${e(a.id)}"`)}${button('reject-min-app','Recusar',`class="secondary" data-id="${e(a.id)}"`)}`:'<span>Aguardando</span>'}</td>
       </tr>`;
      }).join('')}
     </tbody>
    </table>
   </div>
  </section>`;
 }

 function worshipScalePanel(){
  if(key!=='ministries')return '';
  if(ministryFilter&&ministryFilter!=='Music')return '';
  const musicMembers=(data.assignments||[]).filter(a=>a.ministry==='Music');
  const musicSchedules=(data.schedules||[]).filter(s=>s.ministry==='Music' && new Date(s.service_date+'T'+s.service_time+':00-03:00')>=new Date());
  const groupedByService={};
  for(const s of musicSchedules){
   const k=`${s.service_date}|${s.service_time}|${s.title}`;
   if(!groupedByService[k])groupedByService[k]={title:s.title,date:s.service_date,time:s.service_time,members:[]};
   groupedByService[k].members.push(s);
  }
  const services=Object.values(groupedByService).slice(0,6);

  return `<section class="panel sector-section worship-panel">
   <div class="section-title">
    <div>
     <span class="eyebrow" style="color:#4338ca;">LAGOINHA MUSIC</span>
     <h2>Escala do Louvor</h2>
    </div>
    ${edit()?`<div style="display:flex;gap:8px;flex-wrap:wrap;">
     ${button('worship-member-modal','+ Integrante','class="secondary"')}
     ${button('worship-scale-modal','+ Nova escala')}
    </div>`:''}
   </div>

   <div class="worship-roles-grid">
    ${WORSHIP_ROLES.map(roleName=>{
     const inRole=musicMembers.filter(m=>(m.position||'').toLowerCase().includes(roleName.split(' ')[0].toLowerCase()));
     return `<div class="worship-role-chip">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
       <strong>${e(roleName)}</strong>
       <span class="badge">${inRole.length}</span>
      </div>
      ${inRole.length?`<small>${inRole.map(m=>e(m.person_name)).join(', ')}</small>`:''}
     </div>`;
    }).join('')}
   </div>

   ${services.length?`
    <h3 style="margin:16px 0 10px;font-size:14.5px;">Próximas Escalas (${services.length})</h3>
    <div class="worship-services-grid">
     ${services.map(srv=>{
      const srvRepertoire=(data.resources||[]).find(r=>r.ministry==='Music'&&r.category==='repertorio'&&(r.title.includes(srv.date)||r.title.includes(srv.title)));
      let repHtml='';
      if(srvRepertoire&&srvRepertoire.notes){
        try{
          const rep=JSON.parse(srvRepertoire.notes);
          if(Array.isArray(rep.songs)&&rep.songs.length){
            repHtml=`<div class="worship-repertoire-box">
              <div class="worship-repertoire-head">
                <span style="font-size:12px;font-weight:700;color:#4338ca;">🎵 Repertório (${rep.songs.length} músicas)</span>
                ${rep.notes?`<small class="subtle">${e(rep.notes)}</small>`:''}
              </div>
              <div class="worship-songs-list">
                ${rep.songs.map((s,i)=>`
                  <div class="worship-song-row">
                    <div class="worship-song-info">
                      <span class="worship-song-num">${i+1}.</span>
                      <strong>${e(s.title)}</strong>
                      ${s.key?`<span class="badge worship-key-badge">Tom: ${e(s.key)}</span>`: ''}
                    </div>
                    <div class="worship-song-links">
                      ${s.youtube_url?`<a href="${e(s.youtube_url)}" target="_blank" rel="noopener" class="worship-link-btn yt-link" title="Ouvir versão no YouTube">▶ YouTube</a>`: ''}
                      ${s.cifraclub_url?`<a href="${e(s.cifraclub_url)}" target="_blank" rel="noopener" class="worship-link-btn cifra-link" title="Ver cifra no Cifra Club">🎸 Cifra Club</a>`: ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>`;
          }
        }catch(_){
          repHtml=`<div class="worship-repertoire-box"><span style="font-size:12px;font-weight:700;color:#4338ca;">🎵 Repertório:</span><p style="font-size:12px;margin:4px 0;">${e(srvRepertoire.notes)}</p></div>`;
        }
      }
      return `<article class="worship-service-card">
       <div class="worship-service-head">
        <div>
         <strong>${e(srv.title)}</strong>
         <small>${date(srv.date)} às ${e(srv.time)}</small>
        </div>
        <span class="badge" style="background:#4338ca;color:#fff;">${srv.members.length}</span>
       </div>
       <div class="worship-lineup-list">
        ${srv.members.map(m=>`<div class="worship-lineup-item">
         <span class="worship-inst-tag">${e(m.role_notes||'Integrante')}</span>
         <strong>${e(m.person_name)}</strong>
        </div>`).join('')}
       </div>
       ${repHtml}
      </article>`;
     }).join('')}
    </div>
   `:`<p class="subtle" style="margin-top:12px;">Nenhuma escala agendada.</p>`}
  </section>`;
 }

 function ministrySchedulesByServicePanel(){
  if(key!=='ministries')return '';
  const occurrences=(data.service_occurrences||[]).filter(o=>!o.is_hidden);
  const filter=ministryFilter;
  const title=filter?`Escalas por Culto · ${filter}`:'Cultos Oficiais & Escalas da Igreja';
  const subtitle=filter
   ?`Escala da equipe de <strong>${e(filter)}</strong> nos cultos semanais oficiais da igreja.`
   :'Acompanhe e escale os voluntários de cada ministério nos dias e horários de culto padrão.';

  return `<section class="panel sector-section">
   <div class="section-title">
    <div>
     <span class="eyebrow" style="color:#c48a29;">CALENDÁRIO DE CULTOS</span>
     <h2>${uiIcon('schedules',22)} ${title}</h2>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
     ${filter?button('filter-ministry','Mostrar todos os ministérios','data-ministry="" class="secondary"'):''}
     ${edit()?button('new','+ Nova escala geral',`data-kind="schedules" data-preset-ministry="${e(filter)}"`):''}
    </div>
   </div>
   <p class="subtle" style="margin:-4px 0 14px;font-size:13px;">${subtitle}</p>

   ${occurrences.length?`
    <div class="service-occurrences-grid">
     ${occurrences.slice(0,6).map(srv=>{
      const srvSchedules=(data.schedules||[]).filter(s=>s.service_date===srv.date && (!filter || s.ministry===filter));
      return `<article class="service-occurrence-card">
       <div class="service-occurrence-head">
        <div class="service-occurrence-meta">
         <span class="service-date-chip">📅 ${e(srv.weekday_name)}, ${date(srv.date)}</span>
         <strong class="service-occurrence-title">${e(srv.title)}</strong>
         <span class="service-occurrence-time">🕒 ${e(srv.time)} · ${srv.duration_minutes} min</span>
        </div>
        <span class="badge ${srvSchedules.length?'badge-active':''}" style="${srvSchedules.length?'background:#c48a29;color:#fff;':''}">${srvSchedules.length} escalado(s)</span>
       </div>

       <div class="service-lineup-list">
        ${srvSchedules.length?srvSchedules.map(s=>`
         <div class="service-lineup-item">
          <div>
           ${!filter?`<span class="badge" style="font-size:10px;margin-right:4px;">${e(s.ministry)}</span>`: ''}
           <strong>${e(s.person_name)}</strong>
           ${s.role_notes?`<small style="display:block;color:var(--muted,#71717a);font-size:11px;">${e(s.role_notes)}</small>`:''}
          </div>
          <span class="badge badge-status-${e(s.status)}" style="font-size:10px;">${e(scheduleStatusLabels[s.status]||s.status)}</span>
         </div>
        `).join(''):'<p class="subtle" style="font-size:12px;margin:8px 0;">Nenhum voluntário escalado ainda.</p>'}
       </div>

       ${edit()?`
        <div class="service-card-action">
         <button type="button" class="secondary" data-sector-action="scale-service-occurrence" data-service-title="${e(srv.title)}" data-service-date="${e(srv.date)}" data-service-time="${e(srv.time)}" data-service-duration="${srv.duration_minutes}" data-ministry="${e(filter||'')}">
          + Escalar voluntário neste culto
         </button>
        </div>
       `: ''}
      </article>`;
     }).join('')}
    </div>
   `:'<div class="sector-empty" style="padding:28px 16px;text-align:center;"><p class="subtle">Nenhum culto padrão cadastrado. Acesse a Gestão da equipe para configurar os horários semanais.</p></div>'}
  </section>`;
 }

 function gcCardsShowcase(){
  if(key!=='members')return '';
  const cells=data.cells||[];
  if(!cells.length)return '';
  return `<section class="panel sector-section">
   <div class="section-title">
    <h2>GCs Ativos (${cells.length})</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
     ${cellFilter?button('filter-cell','Mostrar todos os GCs','data-cell="" class="secondary"'):''}
     ${edit()?button('new','+ Adicionar GC','data-kind="cells"'):''}
    </div>
   </div>
   <div class="gc-showcase-grid">
    ${cells.map(gc=>{
     const gcMembers=gc.members||(data.people||[]).filter(p=>p.cell_id===gc.id);
     const count=gc.member_count??gcMembers.length;
     const isFiltered=cellFilter===gc.id;
     return `<article class="gc-banner-card" style="${isFiltered?'outline:2px solid #0f766e;':''}">
     <div class="gc-banner-media">
      <img src="${e(gc.banner_url||'/gc/gc-ide.webp')}" alt="${e(gc.name)}" loading="lazy"/>
      <span class="gc-day-pill">${e(gc.meeting_day||'Terça-feira | 19h30')}</span>
     </div>
     <div class="gc-banner-body">
      <div class="gc-banner-head">
       <h3>${e(gc.name)}</h3>
       <span class="badge">${e(gc.neighborhood||'Lagoinha')}</span>
      </div>
      <p class="gc-banner-address">${e(gc.address||gc.neighborhood||'Endereço a definir')}</p>
      <div class="gc-banner-meta">
       <span>${e(gc.leader_name||'Liderança GC')}</span>
       <span>${count} membro(s)</span>
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#e4e4e7);font-size:12px;">
       <strong style="display:block;margin-bottom:4px;color:var(--muted,#52525b);">Membros vinculados (${gcMembers.length}):</strong>
       ${gcMembers.length
        ?`<div style="display:flex;flex-wrap:wrap;gap:4px;">${gcMembers.slice(0,10).map(m=>`<span class="badge" style="font-size:11px;${m.gc_role==='leader'?'background:#09090b;color:#fff;font-weight:700;':''}">${m.gc_role==='leader'?'⭐ ':''}${e(m.name)}${m.gc_role==='leader'?' (Líder)':''}</span>`).join('')}${gcMembers.length>10?`<span class="badge" style="font-size:11px;">+${gcMembers.length-10}</span>`:''}</div>`
        :`<span class="subtle" style="font-size:11.5px;">Nenhum membro vinculado ainda.</span>`}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
       ${button('filter-cell',isFiltered?'Ocultar filtro':'Ver membros',`class="secondary" data-cell="${e(gc.id)}" style="flex:1;min-height:34px;font-size:12px;"`)}
       ${edit()?button('assign-gc-member','+ Vincular',`class="secondary" data-cell="${e(gc.id)}" style="flex:1;min-height:34px;font-size:12px;"`):''}
       ${edit()?button('edit','Editar',`class="secondary" data-kind="cells" data-id="${e(gc.id)}" style="min-height:34px;font-size:12px;"`):''}
      </div>
     </div>
    </article>`;
    }).join('')}
   </div>
  </section>`;
 }

 function financialEnginePanel(){
  if(key!=='finance'||!data.engine)return '';
  const eng=data.engine;
  return `<section class="panel sector-section" style="border-color:#15803d;background:linear-gradient(180deg,#f0fdf4 0%,#ffffff 100%);">
   <div class="section-title">
    <h2>Previsão de caixa</h2>
    ${button('finance-report-modal','Exportar relatório')}
   </div>

   <div class="stats metrics" style="margin:12px 0;">
    ${statCard('Saldo consolidado',cash(eng.current_balance_cents))}
    ${statCard('Previsão 30 dias',cash(eng.projected_30d_cents))}
    ${statCard('Previsão 60 dias',cash(eng.projected_60d_cents))}
    ${statCard('Previsão 90 dias',cash(eng.projected_90d_cents))}
   </div>

   ${eng.overdue_count>0?`<p class="notice" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;margin-bottom:14px;"><strong>${eng.overdue_count} conta(s) vencida(s)</strong> (${cash(eng.overdue_cents)}).</p>`:''}

   <div class="sector-insights-grid" style="margin-bottom:0;">
    <div class="insight-card">
     <div class="insight-head"><h3>Por instituição</h3><span class="badge">${(eng.by_bank||[]).length} banco(s)</span></div>
     <div class="insight-list">
      ${(eng.by_bank||[]).map(b=>`<div class="insight-item">
       <div><strong>${e(b.bank)}</strong><small>Entradas: ${cash(b.income_cents)} · Saídas: ${cash(b.expense_cents)}</small></div>
       <strong class="money ${b.balance_cents>=0?'income':'expense'}">${cash(b.balance_cents)}</strong>
      </div>`).join('')||'<p class="subtle">Nenhuma conta cadastrada.</p>'}
     </div>
    </div>
    <div class="insight-card">
     <div class="insight-head"><h3>Por categoria</h3><span class="badge">Resumo</span></div>
     <div class="insight-list">
      ${(eng.by_category||[]).slice(0,4).map(c=>`<div class="insight-item">
       <div><strong>${e(c.category)}</strong><small>Entradas: ${cash(c.income_cents)} · Saídas: ${cash(c.expense_cents)}</small></div>
       <strong class="money">${cash(c.income_cents-c.expense_cents)}</strong>
      </div>`).join('')||'<p class="subtle">Sem lançamentos.</p>'}
     </div>
    </div>
   </div>
  </section>`;
 }

 function summary(){
  if(key==='members'){
   const people=data.people||[],cells=data.cells||[];
   const currentMonth=today().slice(5,7);
   const birthdaysMonth=people.filter(p=>p.birthday&&p.birthday.slice(5,7)===currentMonth);
   const visitors=people.filter(p=>['visitor','new_convert'].includes(p.integration_stage));
   const stageCounts=Object.keys(stageLabels).map(k=>({key:k,label:stageLabels[k],count:data.statistics?.stages?.[k]??people.filter(p=>(p.integration_stage||'active_member')===k).length}));

   return `<div class="stats metrics">
    ${statCard('Membros',data.total_people||0)}
    ${statCard('Famílias',data.total_families||0)}
    ${statCard('GCs ativos',data.total_cells||cells.length)}
    ${statCard('Aniversariantes do mês',data.statistics?.birthdays_month??birthdaysMonth.length)}
   </div>

   <details class="panel"><summary>Integração e aniversários</summary><div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>Aniversariantes</h3><span class="badge">Mês atual</span></div>
     <div class="insight-list">
      ${birthdaysMonth.slice(0,3).map(p=>{
              return `<div class="insight-item"><div><strong>${e(p.name)}</strong><small>${date(p.birthday)}</small></div><div><span class="badge">Parabéns</span></div></div>`;
      }).join('')}
      ${visitors.slice(0,2).map(p=>{
              return `<div class="insight-item"><div><strong>${e(p.name)}</strong><small>${e(stageLabels[p.integration_stage]||'Visitante')}</small></div><div><span class="badge">Acolher</span></div></div>`;
      }).join('')}
      ${!birthdaysMonth.length&&!visitors.length?'<p class="subtle" style="margin:0;">Nenhum registro neste mês.</p>':''}
     </div>
    </section>
    <section class="insight-card">
     <div class="insight-head"><h3>Jornada</h3><span class="badge">${people.length}</span></div>
     <div class="insight-list">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">
       ${stageCounts.map(s=>`<div class="insight-item" style="flex-direction:column;align-items:flex-start;gap:2px;"><small>${e(s.label)}</small><strong style="font-size:18px;">${s.count}</strong></div>`).join('')}
      </div>
     </div>
    </section>
   </div></details>`;
  }

  function ministryMembersShowcase(){
   const filter=ministryFilter;
   const allAssignments=data.assignments||[];
   const filtered=filter?allAssignments.filter(a=>a.ministry===filter):allAssignments;
   const title=filter?`Membros do Ministério · ${filter} (${filtered.length})`:`Membros Vinculados aos Ministérios (${allAssignments.length})`;

   return `<section class="panel sector-section ministry-members-panel" id="ministry-members-showcase" style="margin-top:20px;">
    <div class="section-title">
     <h2>${uiIcon('assignments',22)} ${e(title)}</h2>
     <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${filter?button('filter-ministry','Mostrar todos os ministérios','data-ministry="" class="secondary"'):''}
      ${edit()?button('new','+ Vincular membro',`data-kind="assignments" data-preset-ministry="${e(filter)}"`):''}
     </div>
    </div>
    ${filter?`<p class="subtle" style="margin:-4px 0 14px;font-size:13px;">Exibindo voluntários e líderes atuantes no ministério <strong>${e(filter)}</strong>.</p>`:`<p class="subtle" style="margin:-4px 0 14px;font-size:13px;">Selecione um ministério nos filtros acima para visualizar os membros de cada área.</p>`}
    ${filtered.length?`<div class="sector-table"><table><thead><tr><th>Membro</th><th>Ministério / Função</th><th>Papel</th><th>Ações</th></tr></thead><tbody>${filtered.map(r=>`<tr><td><strong>${e(r.person_name)}</strong>${r.person_phone?`<small style="display:block;color:var(--muted,#71717a);font-size:11.5px;">${e(r.person_phone)}</small>`:''}</td><td><span class="badge">${e(r.ministry)}</span>${r.position?`<small style="display:block;margin-top:2px;">${e(r.position)}</small>`:''}</td><td><span class="badge" style="${r.is_leader?'background:#09090b;color:#fff;':'background:#f4f4f5;color:#27272a;'}">${r.is_leader?'⭐ Líder':'Voluntário'}</span></td><td class="row-buttons">${edit()?button('edit','Editar',`data-kind="assignments" data-id="${e(r.id)}"`):''}${canArchive()?button('archive','Desvincular',`data-kind="assignments" data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty" style="padding:28px 16px;text-align:center;"><p style="margin:0 0 12px;color:var(--muted,#71717a);font-size:13.5px;">${filter?`Nenhum membro vinculado ao ministério <strong>${e(filter)}</strong> no momento.`:'Nenhum membro vinculado cadastrado.'}</p>${edit()?`<button type="button" class="primary" data-sector-action="new" data-kind="assignments" data-preset-ministry="${e(filter)}">+ Vincular primeiro membro</button>`:''}</div>`}
   </section>`;
  }

  if(key==='ministries'){
   const assignments=data.assignments||[];
   const schedules=data.schedules||[];
   const uniquePeople=new Set(assignments.map(a=>a.person_id)).size;
   const leadersCount=assignments.filter(a=>a.is_leader||/l[ií]der|coord|pastor|diret|superv|respons/i.test(a.position||'')).length;

   return `${data.user_scope?`<p class="notice">Escopo ativo: <strong>${e(data.user_scope)}</strong>.</p>`:''}
   <div class="stats metrics">
    ${statCard('Vínculos',assignments.length)}
    ${statCard('Voluntários',uniquePeople)}
    ${statCard('Escalas',schedules.length)}
    ${statCard('Candidaturas / Líderes',`${(data.applications||[]).length} / ${leadersCount}`)}
   </div>
   ${ministryApplicationsPanel()}
   <div class="section-title" style="margin-top:8px;">
    <h2>Ministérios</h2>
    ${ministryFilter?button('filter-ministry','Mostrar todos','data-ministry="" class="secondary"'):''}
   </div>
   <div class="ministry-grid-cards ministry-counts">
    ${(data.catalog||[]).map(m=>{
     const minMembers=(data.assignments||[]).filter(a=>a.ministry===m);
     const total=data.counts.find(c=>c.ministry===m)?.total||minMembers.length||0;
     const activeClass=ministryFilter===m?'active':'';
     return `<button type="button" class="ministry-card-btn ${activeClass}" data-sector-action="filter-ministry" data-ministry="${e(m)}" title="Filtrar por ${e(m)}">
      <div class="ministry-card-top">
       ${ministryEmblem(m)}
       <span class="ministry-count-pill badge">${total}</span>
      </div>
      <strong class="ministry-card-name">${e(m)}</strong>
     </button>`;
    }).join('')}
   </div>
   ${ministryMembersShowcase()}
   ${ministrySchedulesByServicePanel()}
   ${worshipScalePanel()}`;
  }

  const incomeCents=Number(data.totals?.income_cents||0);
  const expenseCents=Number(data.totals?.expense_cents||0);
  const pendingIncome=Number(data.totals?.pending_income_cents||0);
  const pendingExpense=Number(data.totals?.pending_expense_cents||0);
  const totalBalance=(data.accounts||[]).reduce((n,a)=>n+Number(a.balance_cents||0),0);
  const flowTotal=incomeCents+expenseCents;
  const incomePct=flowTotal>0?Math.round((incomeCents/flowTotal)*100):0;
  const netFlow=incomeCents-expenseCents;

  return `${financialEnginePanel()}
   <div class="stats metrics">
    ${statCard('Entradas',cash(incomeCents),pendingIncome?`+ ${cash(pendingIncome)} pendente`:'')}
    ${statCard('Saídas',cash(expenseCents),pendingExpense?`+ ${cash(pendingExpense)} pendente`:'')}
    ${statCard('Saldo em contas',cash(totalBalance))}
    ${statCard('Notas / Borderôs',`${(data.invoices||[]).length} / ${(data.closings||[]).length}`)}
   </div>
   <div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>Balanço</h3><span class="badge">${!flowTotal?'Sem movimentação':netFlow>0?'Superávit':netFlow<0?'Déficit':'Equilibrado'}</span></div>
     <div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:4px;">
       <span class="income">Entradas: ${cash(incomeCents)} (${flowTotal?incomePct:0}%)</span>
       <span class="expense">Saídas: ${cash(expenseCents)} (${flowTotal?100-incomePct:0}%)</span>
      </div>
      <div class="cashflow-meter"><div class="cashflow-meter-in" style="width:${incomePct}%"></div></div>
      <small class="subtle">Resultado líquido: <strong>${netFlow>=0?'+':'−'} ${cash(Math.abs(netFlow))}</strong></small>
     </div>
    </section>
    <section class="insight-card">
     <div class="insight-head"><h3>Contas &amp; Centros</h3><span class="badge">${(data.accounts||[]).length} conta(s)</span></div>
     <div class="insight-list">
      ${(data.cost_centers||[]).slice(0,2).map(cc=>{
       const pct=cc.budget_cents>0?Math.min(100,Math.round((Number(cc.spent_cents||0)/Number(cc.budget_cents))*100)):0;
       return `<div class="insight-item" style="flex-direction:column;align-items:stretch;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
         <strong>${e(cc.name)}</strong>
         <small style="margin:0;font-weight:700;">${cash(cc.spent_cents)} / ${cash(cc.budget_cents)}</small>
        </div>
        <div class="account-progress-track"><div class="account-progress-fill" style="width:${pct}%"></div></div>
       </div>`;
      }).join('')}
      ${(data.accounts||[]).slice(0,2).map(a=>`<div class="insight-item"><strong>${e(a.name)}</strong><strong class="money">${cash(a.balance_cents)}</strong></div>`).join('')||'<p class="subtle" style="margin:0;">Nenhum registro.</p>'}
     </div>
    </section>
   </div>`;
 }

 function row(kind,r){
  if(kind==='cells'){const gcMembers=r.members||(data.people||[]).filter(p=>p.cell_id===r.id);const memberNames=gcMembers.length?gcMembers.map(m=>e(m.name)).join(', '):'Nenhum membro vinculado';return `<td><strong>${e(r.name)}</strong><small>${e(r.address||r.neighborhood||'—')}</small></td><td>${e(r.leader_name||'Liderança GC')}<small>${e(r.meeting_day||'')}</small></td><td><span class="badge">${r.member_count??gcMembers.length} membro(s)</span><small style="display:block;margin-top:4px;">${memberNames}</small></td>`;}
  if(kind==='families')return `<td><strong>${e(r.name)}</strong><small>${e(r.neighborhood||'')}</small></td><td><span class="badge">${r.member_count} integrante(s)</span>${r.cell_name?`<small>GC: ${e(r.cell_name)}</small>`:''}</td><td>${date(r.joined_on)}</td>`;
  if(kind==='people'){
      if(r.profile_restricted)return `<td><strong>${e(r.name)}</strong></td><td>—</td><td>—</td>`;
      return `<td><strong>${e(r.name)}</strong>${r.gc_role==='leader'?' <span class="badge" style="background:#09090b;color:#fff;font-size:10px;">⭐ Líder de GC</span>':''}<small>${e(r.phone||r.email||'')}</small></td><td>${e(r.family_name||'—')}<small>${e(r.relationship||'Membro')}${r.cell_name?` · GC: ${e(r.cell_name)}`:''}</small><span class="badge" style="margin-top:4px;">${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</span></td><td>${date(r.joined_on)}<small>Nasc.: ${date(r.birthday)}</small></td>`;
  }
  if(kind==='schedules')return `<td><strong>${e(r.title)}</strong><small>${date(r.service_date)} às ${e(r.service_time||'18:00')}</small></td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.person_name)} ${r.role_notes?`· <strong>${e(r.role_notes)}</strong>`:''}</small></td><td><span class="badge badge-status-${e(r.status)}">${e(scheduleStatusLabels[r.status]||r.status)}</span></td>`;
  if(kind==='assignments')return `<td><strong>${e(r.person_name)}</strong>${r.is_leader?' <span class="badge">⭐ Líder</span>':''}</td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.position)}</small></td><td><span class="badge" style="background:#09090b;color:#fff;">${r.is_leader?'Líder':'Equipe'}</span></td>`;
  if(kind==='resources')return `<td><strong>${e(r.title)}</strong><small>${e(resourceCatLabels[r.category]||r.category)}</small></td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.notes||'')}</small></td><td>${r.resource_url?`<a class="badge" href="${e(r.resource_url)}" target="_blank" rel="noopener">Abrir</a>`:'<span class="subtle">Interno</span>'}</td>`;
  if(kind==='closings')return `<td><strong>${e(r.service_name)}</strong><small>${date(r.service_date)} · ${e(r.account_name)}</small></td><td><small>Dízimos: ${cash(r.tithes_cents)} · Espécie: ${cash(r.offerings_cash_cents)} · PIX: ${cash(r.offerings_pix_cents)}</small></td><td><strong class="money income">${cash(r.total_cents)}</strong><small>${e(r.counted_by)}${r.verified_by&&r.verified_by!==r.counted_by?` &amp; ${e(r.verified_by)}`:''}</small></td>`;
  if(kind==='cost-centers')return `<td><strong>${e(r.name)}</strong><small>${e(r.ministry||'Geral')}</small></td><td>${cash(r.budget_cents)}</td><td><span class="money expense">${cash(r.spent_cents)}</span></td>`;
  if(kind==='accounts')return `<td><strong>${e(r.name)}</strong><small>${e(r.bank||'Caixa Interno')}</small></td><td>${cash(r.opening_cents)}</td><td><strong>${cash(r.balance_cents)}</strong></td>`;
  if(kind==='entries'){
   const isPending=(r.payment_status||'paid')==='pending';
   return `<td><strong>${e(r.description)}</strong><small>${e(r.account_name)}${r.category?` · ${e(r.category)}`:''} · ${e(paymentMethodLabels[r.payment_method]||r.payment_method||'PIX')}</small></td><td>${date(r.occurred_on)}${r.due_date?`<small>Venc.: ${date(r.due_date)}</small>`:''}<span class="badge" style="margin-top:4px;">${isPending?'⏳ Pendente':'Liquidado'}</span></td><td><span class="money ${r.direction}">${r.direction==='income'?'+':'−'} ${cash(r.amount_cents)}</span></td>`;
  }
  return `<td><strong>${e(r.number)}</strong><small>${e(r.supplier)}</small></td><td>${date(r.issued_on)}</td><td><strong>${cash(r.amount_cents)}</strong> ${r.file_id?`<a class="badge" href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">Anexo</a>`:''}</td>`;
 }

 function getRowsForKind(kind){
  if(kind==='cost-centers')return data.cost_centers||[];
  let rows=data[kind]||[];
  if(['assignments','schedules','resources'].includes(kind)&&ministryFilter){
   rows=rows.filter(r=>r.ministry===ministryFilter);
  }
  if(kind==='people'&&cellFilter){
   rows=rows.filter(r=>r.cell_id===cellFilter);
  }
  return rows;
 }

 function section(kind){
  const rows=getRowsForKind(kind);
  const headers={
   cells:['GC / Endereço','Líder','Membros'],
   families:['Família','Integrantes','Entrada'],
   people:['Membro','Família / GC','Datas'],
   schedules:['Culto / Evento','Ministério / Função','Status'],
   assignments:['Pessoa','Ministério / Função','Papel'],
   resources:['Material','Ministério','Acesso'],
   closings:['Culto / Conta','Resumo','Total'],
   'cost-centers':['Centro de Custo','Orçamento','Gasto'],
   accounts:['Conta / Banco','Saldo inicial','Saldo atual'],
   entries:['Lançamento','Data / Status','Valor'],
   invoices:['Nota / Fornecedor','Emissão','Valor']
  }[kind];
  const cellObj=cellFilter?(data.cells||[]).find(c=>c.id===cellFilter):null;
  const filterSuffix=(['assignments','schedules','resources'].includes(kind)&&ministryFilter?` · ${e(ministryFilter)}`:'')+(kind==='people'&&cellObj?` · ${e(cellObj.name)}`:'');
  const pager=kind==='people'&&!cellFilter?`<div class="work-actions">${data.page>1?button('people-prev','Anterior'):''}<span>Página ${data.page||1}</span>${data.has_more?button('people-next','Próxima'):''}</div>`:'';
  return `<section class="panel sector-section" id="section-${kind}">${pager}<div class="section-title"><h2>${uiIcon(kind,20)}${labels[kind]}${filterSuffix}</h2><div style="display:flex;gap:8px;">${kind==='people'&&cellFilter?button('filter-cell','Mostrar todos','data-cell="" class="secondary"'):''}${edit()?button('new','+ Adicionar',`data-kind="${kind}"`):''}</div></div>${rows.length?`<div class="sector-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${row(kind,r)}<td class="row-buttons">${kind==='people'&&!r.profile_restricted?button('member-doc','Credencial',`class="secondary" data-id="${e(r.id)}"`):''}${kind==='entries'&&r.payment_status==='pending'&&edit()?button('settle','Baixar',`data-id="${e(r.id)}"`):''}${kind==='schedules'&&r.person_id===data.my_person_id?`<span class="schedule-quick-actions" style="display:inline-flex;gap:4px;margin-right:4px;">${r.status!=='confirmed'?`<button type="button" class="mini-button success-button" data-sector-action="respond-schedule" data-respond-schedule="${e(r.id)}" data-status="confirmed" title="Confirmar presença">✓ Confirmar</button>`:''}${r.status!=='declined'?`<button type="button" class="mini-button danger-button" data-sector-action="respond-schedule" data-respond-schedule="${e(r.id)}" data-status="declined" title="Informar indisponibilidade">✕ Indisponível</button>`:''}</span>`:''}${edit()||(kind==='people'&&r.id===data.my_person_id)?button('edit',r.id===data.my_person_id?'Meus dados':'Editar',`data-kind="${kind}" data-id="${e(r.id)}"`):(kind==='schedules'&&r.person_id===data.my_person_id?'':'<span>Consulta</span>')}${canArchive()?button('archive','Arquivar',`data-kind="${kind}" data-id="${e(r.id)}"`):''}${key==='finance'&&canArchive()&&['accounts','entries','invoices'].includes(kind)?button('history','Histórico',`data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty"><h3>Nenhum registro</h3></div>`}</section>`;
 }

 function paint(message=''){
  const allKinds=key==='members'?['people','families','cells']:key==='ministries'?['schedules','assignments','resources']:['entries','closings','accounts','cost-centers','invoices'];
  const isHallTab=key==='members'&&activeTab==='hall';
  if(isHallTab){host.innerHTML='<div data-hall-root></div>';void hall.mount(host.querySelector('[data-hall-root]'));return;}
  const visibleKinds=activeTab==='all'
   ?[]
   :activeTab==='worship'
   ?['schedules']
   :key==='members'&&activeTab==='cells'&&cellFilter
   ?['people','cells']
   :allKinds.filter(k=>k===activeTab);
  const showSummary=activeTab==='all';
  const showWorshipOnly=key==='ministries'&&activeTab==='worship';
  const showGcCards=key==='members'&&activeTab==='cells';

  host.innerHTML=`<div class="page-enter"><p role="status" class="status">${e(message)}</p>${heroBanner()}${showSummary?`${selfRegistrationsPanel()}${summary()}<section class="panel"><h2>Continuar</h2><div class="work-actions">${allKinds.map(kind=>`<a class="button secondary" href="/${key}#${kind}">${labels[kind]}</a>`).join('')}</div>${key==='finance'&&!data.accounts?.length?'<p>Comece criando uma conta. Depois cadastre um centro de custo e seu primeiro lançamento para conferir o saldo.</p>':''}</section>`:''}${showWorshipOnly?worshipScalePanel():''}${showGcCards?gcCardsShowcase():''}<form class="sector-search" ${showSummary?'hidden':''}><label>Buscar<input name="q" value="${e(query)}" maxlength="100" placeholder="${isHallTab?'Buscar no Hall de Membros...':'Pesquisar...'}"></label><button>Buscar</button>${button('clear','Limpar','class="secondary"')}</form>${visibleKinds.map(section).join('')}<dialog id="sector-dialog"><div class="sector-modal"></div></dialog></div>`;
  host.querySelector('.sector-search').onsubmit=event=>{event.preventDefault();query=new FormData(event.currentTarget).get('q');peoplePage=1;void refresh();};
  host.querySelectorAll('[data-sector-action], [data-respond-schedule]').forEach(b=>b.onclick=(ev)=>{ev.preventDefault();void action(b);});
  translateDOM(host);
 }

 async function refresh(message=''){
  const n=++generation;
  const loadingTarget=host;if(loadingTarget){loadingTarget.inert=true;loadingTarget.setAttribute('aria-busy','true');}
  if(key==='members'&&activeTab==='hall'){paint(message);if(host){host.inert=false;host.setAttribute('aria-busy','false');}return;}
  try{
   const result=await api('/'+key+'?q='+encodeURIComponent(query)+(key==='members'?'&page='+peoplePage:''));
   if(n!==generation)return;
   data=result;
   paint(message);
  }catch(err){if(n===generation)host.innerHTML=`<div class="panel"><p role="alert">${message?'Registro salvo. Não foi possível atualizar a lista. ':''}${e(err.message)}</p>${button('retry','Tentar novamente')}</div>`;host.querySelector('[data-sector-action="retry"]')?.addEventListener('click',()=>void refresh());}finally{if(n===generation&&host===loadingTarget){host.inert=false;host.setAttribute('aria-busy','false');}}
 }

 async function mount(module,initialTab='all'){key=module.id;activeTab=initialTab||'all';host=document.getElementById('sector-content');query='';ministryFilter='';cellFilter='';peoplePage=1;if(host)await refresh();}

 async function openAssignGcMemberModal(targetCellId){
  const cell=(data.cells||[]).find(c=>c.id===targetCellId);
  if(!cell)return;
  directory=await api('/ministries/people');
  const dialog=host.querySelector('dialog');
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title"><h2>Vincular Membro · ${e(cell.name)}</h2>${button('close','Fechar','class="secondary"')}</div>
   <form class="record-form" id="assign-gc-member-form">
    ${field('person_id','Selecione o membro','','text',true,opt(directory))}
    <p class="error" role="alert"></p>
    <button type="submit">Vincular ao GC</button>
   </form>`;
  const lifecycle=guardForm(dialog.querySelector('form'),dialog);
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#assign-gc-member-form').onsubmit=async ev=>{
   ev.preventDefault();if(lifecycle.busy)return;lifecycle.setBusy(true);
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{
    const pid=new FormData(f).get('person_id');
    const existing=(data.people||[]).find(p=>p.id===pid)||{};
    await api('/members/people/'+pid,{method:'PUT',body:{...existing,name:existing.name||directory.find(d=>d.id===pid)?.name||'Membro',cell_id:targetCellId}});
    lifecycle.complete();dialog.close();
    await refresh('Membro vinculado ao GC com sucesso!');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{lifecycle.setBusy(false);b.disabled=false;}
  };
  dialog.showModal();
 }

 function setTab(tab){
  activeTab=tab||'all';
  if(activeTab==='worship')ministryFilter='Music';
  else if(ministryFilter==='Music'&&tab!=='worship')ministryFilter='';
  if(host)void refresh();
  if(onTabChange)onTabChange(activeTab);
 }

 function getTab(){return activeTab;}

 function field(name,label,value='',type='text',required=false,opts=null,allowFutureDate=false){
  const attrs=`name="${name}" ${required?'required':''}`;
  const maxDate=(type==='date'&&!allowFutureDate)?`max="${today()}"`:'';
  return `<label>${label}${opts?`<select ${attrs}>${opts.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value??'')?'selected':''}>${e(t)}</option>`).join('')}</select>`:`<input ${attrs} type="${type}" value="${e(value)}" ${maxDate} maxlength="${name==='pastoral_notes'?600:name==='description'||name==='address'||name==='notes'||name==='resource_url'||name==='banner_url'?250:name==='email'?200:160}" ${['amount','opening_value','budget_value','tithes','offerings_cash','offerings_pix','offerings_card'].includes(name)?'inputmode="decimal"':''}>`}</label>`;
 }

 const opt=(rows,currentId,currentLabel)=>{const list=options(rows||[]);if(currentId&&!list.some(([v])=>v===currentId))list.push([currentId,currentLabel||'Vínculo atual']);return list;};

 async function openWorshipScaleModal(preset=null){
  directory=await api('/ministries/people');
  const musicAssignments=(data.assignments||[]).filter(a=>a.ministry==='Music');
  const dialog=host.querySelector('dialog');
   const templates=data.service_templates||[];
   const activeOccurrences=(data.service_occurrences||[]).filter(o=>!o.is_hidden);
   const firstOcc=activeOccurrences[0];
   const initialTitle=preset?.title||(firstOcc?firstOcc.title:(templates[0]?.title||'Culto de Celebração'));
   const initialDate=preset?.service_date||(firstOcc?firstOcc.date:today());
   const initialTime=preset?.service_time||(firstOcc?firstOcc.time:(templates[0]?.service_time||'19:00'));
   const occurrenceOptions=activeOccurrences.map(o=>[
    `${o.date}|${o.time}|${encodeURIComponent(o.title)}`,
    `📅 ${o.title} — ${date(o.date)} (${o.weekday_name}) às ${o.time}`
   ]);
   const matchingOccVal=activeOccurrences.find(o=>o.date===initialDate&&o.title===initialTitle);
   const currentOccKey=matchingOccVal?`${matchingOccVal.date}|${matchingOccVal.time}|${encodeURIComponent(matchingOccVal.title)}`:'';

  const CORE_LINEUP=[
   {role:'Ministrante',capacity:1,label:'Ministrante',hint:'1 vaga',tag:'Voz'},
   {role:'Backing Vocal',capacity:3,label:'Backing Vocal',hint:'até 3',tag:'Vocal'},
   {role:'Tecladista',capacity:2,label:'Tecladista',hint:'até 2',tag:'Teclado'},
   {role:'Guitarrista',capacity:2,label:'Guitarrista',hint:'até 2',tag:'Guitarra'},
   {role:'Baixista',capacity:1,label:'Baixista',hint:'1 vaga',tag:'Baixo'},
   {role:'Baterista',capacity:1,label:'Baterista',hint:'1 vaga',tag:'Bateria'}
  ];

  const buildPersonOptions=(slotRole)=>{
   const matching=musicAssignments.filter(a=>(a.position||'').toLowerCase().includes(slotRole.split(' ')[0].toLowerCase()));
   const others=musicAssignments.filter(a=>!matching.includes(a));
   const allPeople=directory.filter(p=>!musicAssignments.some(a=>a.person_id===p.id));
   return `
    <option value="">— Livre —</option>
    ${matching.length?`<optgroup label="${e(slotRole)}">${matching.map(m=>`<option value="${e(m.person_id)}">${e(m.person_name)} (${e(m.position)})</option>`).join('')}</optgroup>`:''}
    ${others.length?`<optgroup label="Louvor">${others.map(m=>`<option value="${e(m.person_id)}">${e(m.person_name)} (${e(m.position)})</option>`).join('')}</optgroup>`:''}
    ${allPeople.length?`<optgroup label="Membros">${allPeople.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</optgroup>`:''}
   `;
  };

  const slotCard=(item)=>{
   const slots=[];
   for(let i=1;i<=item.capacity;i++){
    const slotKey=`slot_${item.role.replace(/\s+/g,'_')}_${i}`;
    slots.push(`
     <div class="worship-slot-item">
      <label>
       <span style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">
        <strong>${e(item.label)} ${item.capacity>1?'#'+i:''}</strong>
       </span>
       <select name="${e(slotKey)}" class="worship-slot-select">
        ${buildPersonOptions(item.role)}
       </select>
      </label>
     </div>
    `);
   }
   return `
    <article class="worship-band-slot-card">
     <div class="worship-slot-card-head">
      <strong>${e(item.label)}</strong>
      <span class="badge">${e(item.hint)}</span>
     </div>
     <div class="worship-slot-inputs-grid">
      ${slots.join('')}
     </div>
    </article>
   `;
  };

  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title">
    <h2 style="margin:0;">Nova Escala de Louvor</h2>
    ${button('close','Fechar','class="secondary"')}
   </div>
   <form class="record-form" id="worship-scale-form">
     ${occurrenceOptions.length?`
      <div style="margin-bottom:12px;">
       ${field('preset_occurrence','Culto da programação oficial (preenchimento automático)',currentOccKey,'text',false,[['','Selecionar culto da programação oficial...'],...occurrenceOptions])}
      </div>
     `:''}
     <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
      ${field('title','Culto',initialTitle,'text',true,templates.length?templates.map(t=>[t.title,t.title]):[['Culto de Celebração','Culto de Celebração']])}
      ${field('service_date','Data',initialDate,'date',true,null,true)}
      ${field('service_time','Horário',initialTime,'time',true)}
     </div>
    <div style="border-top:1px solid var(--border,#e4e4e7);padding-top:16px;margin-top:16px;">
     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div>
       <strong style="font-size:14px;display:block;">🎵 Músicas do Repertório, Tons & Cifras</strong>
       <small style="color:var(--muted,#71717a);font-size:12px;">Vincule versões do YouTube e cifras do Cifra Club para os instrumentistas.</small>
      </div>
      <button type="button" class="secondary" id="add-song-btn" style="min-height:34px;font-size:12px;font-weight:600;">+ Adicionar Música</button>
     </div>
     <div id="songs-container" style="display:grid;gap:10px;"></div>
     <label style="display:block;margin-top:10px;font-size:12px;color:var(--muted,#71717a);">
      Observações gerais do repertório (opcional)
      <input name="repertoire_general_notes" placeholder="Ex.: Momentos de oração, transições de tom, ordem especial..." maxlength="250" style="margin-top:4px;padding:8px 10px;min-height:38px;font-size:13px;width:100%;box-sizing:border-box;">
     </label>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px;">
     <strong style="font-size:14px;display:block;margin-bottom:10px;">Banda Base</strong>
     <div class="worship-structured-slots-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
      ${CORE_LINEUP.map(slotCard).join('')}
     </div>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:14px;">
     <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <strong style="font-size:14px;">Integrantes Extras</strong>
      <button type="button" class="secondary" id="add-extra-musician-btn" style="min-height:34px;font-size:12px;">+ Adicionar</button>
     </div>
     <div id="extra-musicians-container" style="display:grid;gap:10px;"></div>
    </div>

    <p class="error" role="alert"></p>
    <button type="submit" style="width:100%;margin-top:12px;">Salvar escala</button>
   </form>`;

  const extraContainer=dialog.querySelector('#extra-musicians-container');
  const songsContainer=dialog.querySelector('#songs-container');
  const addSongBtn=dialog.querySelector('#add-song-btn');
  let songIndex=0;
  function addSongRow(songData={title:'',key:'',youtube_url:'',cifraclub_url:''}){
   songIndex++;
   const rowId=`song-row-${songIndex}`;
   const row=document.createElement('div');
   row.id=rowId;
   row.className='worship-song-item';
   row.style.cssText='background:var(--surface,#fff);border:1.5px solid var(--border,#e4e4e7);border-radius:12px;padding:12px 14px;display:grid;gap:10px;';
   const keys=['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B','Cm','C#m','Dm','D#m','Ebm','Em','Fm','F#m','Gm','G#m','Am','Bbm','Bm'];
   const keyOpts=keys.map(k=>`<option value="${k}" ${songData.key===k?'selected':''}>${k}</option>`).join('');
   row.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;">
     <strong style="font-size:12.5px;color:#4338ca;font-weight:700;">Música #<span class="song-num">${songIndex}</span></strong>
     <button type="button" class="secondary danger-btn" style="min-height:26px;padding:2px 8px;font-size:11.5px;color:#dc2626;" title="Remover música">✕ Remover</button>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;">
     <label style="font-size:11.5px;font-weight:600;display:block;">
      Nome da Música / Versão
      <input name="song_title_${songIndex}" placeholder="Ex.: A Casa é Sua (Casa Worship)" value="${e(songData.title)}" maxlength="100" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;min-height:38px;font-size:13px;" required>
     </label>
     <label style="font-size:11.5px;font-weight:600;display:block;">
      Tom da Música
      <select name="song_key_${songIndex}" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;min-height:38px;font-size:13px;">
       <option value="">Tom original / A definir</option>
       ${keyOpts}
      </select>
     </label>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
     <div>
      <label style="font-size:11.5px;font-weight:600;display:block;">
       ▶ Link ou Versão no YouTube
       <input name="song_youtube_${songIndex}" placeholder="Link do vídeo (opcional)" value="${e(songData.youtube_url)}" maxlength="250" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;min-height:36px;font-size:12px;">
      </label>
      <div style="display:flex;gap:6px;margin-top:6px;">
       <a class="button secondary btn-search-yt" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;min-height:28px;display:inline-flex;align-items:center;gap:4px;text-decoration:none;background:#fee2e2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-weight:600;">
        🔍 Buscar no YouTube
       </a>
      </div>
     </div>
     <div>
      <label style="font-size:11.5px;font-weight:600;display:block;">
       🎸 Link ou Cifra no Cifra Club
       <input name="song_cifra_${songIndex}" placeholder="Link da cifra (opcional)" value="${e(songData.cifraclub_url)}" maxlength="250" style="width:100%;box-sizing:border-box;margin-top:4px;padding:8px 10px;min-height:36px;font-size:12px;">
      </label>
      <div style="display:flex;gap:6px;margin-top:6px;">
       <a class="button secondary btn-search-cifra" target="_blank" rel="noopener" style="font-size:11px;padding:4px 8px;min-height:28px;display:inline-flex;align-items:center;gap:4px;text-decoration:none;background:#ffedd5;color:#ea580c;border:1px solid #fed7aa;border-radius:6px;font-weight:600;">
        🔍 Buscar no Cifra Club
       </a>
      </div>
     </div>
    </div>
   `;
   const titleInp=row.querySelector(`[name="song_title_${songIndex}"]`);
   const keyInp=row.querySelector(`[name="song_key_${songIndex}"]`);
   const ytInp=row.querySelector(`[name="song_youtube_${songIndex}"]`);
   const cifraInp=row.querySelector(`[name="song_cifra_${songIndex}"]`);
   const ytBtn=row.querySelector('.btn-search-yt');
   const cifraBtn=row.querySelector('.btn-search-cifra');
   function updateSearchLinks(){
    const t=titleInp.value.trim();
    const k=keyInp.value.trim();
    const ytVal=ytInp.value.trim();
    const cifraVal=cifraInp.value.trim();
    if(ytVal&&/^https?:\/\//i.test(ytVal)){
     ytBtn.href=ytVal;
     ytBtn.textContent='▶ Ouvir no YouTube';
    }else{
     const q=t?(t+(k?' tom '+k:'')):'louvor gospel';
     ytBtn.href='https://www.youtube.com/results?search_query='+encodeURIComponent(q);
     ytBtn.textContent='🔍 Buscar no YouTube';
    }
    if(cifraVal&&/^https?:\/\//i.test(cifraVal)){
     cifraBtn.href=cifraVal;
     cifraBtn.textContent='🎸 Abrir Cifra';
    }else{
     cifraBtn.href=t?'https://www.cifraclub.com.br/?q='+encodeURIComponent(t):'https://www.cifraclub.com.br/';
     cifraBtn.textContent='🔍 Buscar no Cifra Club';
    }
   }
   titleInp.addEventListener('input',updateSearchLinks);
   keyInp.addEventListener('change',updateSearchLinks);
   ytInp.addEventListener('input',updateSearchLinks);
   cifraInp.addEventListener('input',updateSearchLinks);
   updateSearchLinks();
   row.querySelector('.danger-btn').onclick=()=>row.remove();
   songsContainer.appendChild(row);
  }
  addSongBtn.onclick=()=>addSongRow();
  addSongRow();
  const addExtraBtn=dialog.querySelector('#add-extra-musician-btn');

  let extraIndex=0;
  function addExtraMusicianRow(){
   extraIndex++;
   const rowId=`extra-row-${extraIndex}`;
   const row=document.createElement('div');
   row.id=rowId;
   row.className='extra-musician-row';
   row.innerHTML=`
    <div>
     <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:2px;">Função</label>
     <input name="extra_inst_${extraIndex}" placeholder="Ex.: Violonista, Sax, VS" value="Violonista" maxlength="60" style="padding:6px 10px;min-height:36px;font-size:12.5px;" required>
    </div>
    <div>
     <label style="font-size:11.5px;font-weight:700;display:block;margin-bottom:2px;">Integrante</label>
     <select name="extra_person_${extraIndex}" style="padding:6px 10px;min-height:36px;font-size:12.5px;" required>
      <option value="">Selecione...</option>
      ${directory.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}
     </select>
    </div>
    <button type="button" class="secondary danger-btn" style="min-height:36px;padding:6px 10px;font-size:12px;" title="Remover">✕</button>
   `;
   row.querySelector('.danger-btn').onclick=()=>row.remove();
   extraContainer.appendChild(row);
  }

  addExtraBtn.onclick=()=>addExtraMusicianRow();

  const lifecycle=guardForm(dialog.querySelector('form'),dialog);
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
   const worshipForm=dialog.querySelector('#worship-scale-form');
   worshipForm.querySelector('[name=preset_occurrence]')?.addEventListener('change',event=>{
    const val=event.target.value;if(!val)return;
    const parts=val.split('|');
    const occDate=parts[0], occTime=parts[1], occTitle=decodeURIComponent(parts[2]||'');
    if(occTitle&&worshipForm.elements.title)worshipForm.elements.title.value=occTitle;
    if(occDate&&worshipForm.elements.service_date)worshipForm.elements.service_date.value=occDate;
    if(occTime&&worshipForm.elements.service_time)worshipForm.elements.service_time.value=occTime;
   });
   worshipForm.querySelector('[name=title]')?.addEventListener('change',event=>{
    const chosenTitle=event.target.value;
    const matchedTemplate=templates.find(t=>t.title===chosenTitle);
    if(matchedTemplate&&worshipForm.elements.service_time){
     worshipForm.elements.service_time.value=matchedTemplate.service_time;
    }
    const nextOcc=activeOccurrences.find(o=>o.title===chosenTitle);
    if(nextOcc){
     if(worshipForm.elements.service_date)worshipForm.elements.service_date.value=nextOcc.date;
     if(worshipForm.elements.preset_occurrence)worshipForm.elements.preset_occurrence.value=`${nextOcc.date}|${nextOcc.time}|${encodeURIComponent(nextOcc.title)}`;
    }
   });
  dialog.querySelector('#worship-scale-form').onsubmit=async ev=>{
   ev.preventDefault();if(lifecycle.busy)return;lifecycle.setBusy(true);
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');
   b.disabled=true;
   try{
    const fd=new FormData(f);
    const members=[];
    const seenPids=new Set();

    for(const item of CORE_LINEUP){
     for(let i=1;i<=item.capacity;i++){
      const slotKey=`slot_${item.role.replace(/\s+/g,'_')}_${i}`;
      const pid=fd.get(slotKey);
      if(pid&&!seenPids.has(pid)){
       seenPids.add(pid);
       members.push({person_id:pid,instrument:item.role});
      }
     }
    }

    const extraRows=extraContainer.querySelectorAll('.extra-musician-row');
    extraRows.forEach(row=>{
     const instInp=row.querySelector('input');
     const persSelect=row.querySelector('select');
     const pid=persSelect?.value;
     const inst=instInp?.value?.trim()||'Músico Extra';
     if(pid&&!seenPids.has(pid)){
      seenPids.add(pid);
      members.push({person_id:pid,instrument:inst});
     }
    });

    if(!members.length)throw new Error('Selecione pelo menos 1 integrante.');

    const songs=[];
    dialog.querySelectorAll('.worship-song-item').forEach(row=>{
      const titleInp=row.querySelector('input[name^="song_title_"]');
      const keySelect=row.querySelector('select[name^="song_key_"]');
      const ytInp=row.querySelector('input[name^="song_youtube_"]');
      const cifraInp=row.querySelector('input[name^="song_cifra_"]');
      const title=titleInp?.value?.trim();
      if(title){
        const key=keySelect?.value?.trim()||'';
        let ytUrl=ytInp?.value?.trim()||'';
        if(!ytUrl){
          ytUrl='https://www.youtube.com/results?search_query='+encodeURIComponent(title+(key?' tom '+key:''));
        }
        let cifraUrl=cifraInp?.value?.trim()||'';
        if(!cifraUrl){
          cifraUrl='https://www.cifraclub.com.br/?q='+encodeURIComponent(title);
        }
        songs.push({title,key,youtube_url:ytUrl,cifraclub_url:cifraUrl});
      }
    });
    const repNotes=fd.get('repertoire_general_notes')?.trim()||'';
    let repertoirePayload='';
    let mainResourceUrl='';
    if(songs.length||repNotes){
      repertoirePayload=JSON.stringify({notes:repNotes,songs});
      mainResourceUrl=songs[0]?.youtube_url||'';
    }
    const res=await api('/ministries/worship-scale',{
     method:'POST',
     body:{
      title:fd.get('title'),
      service_date:fd.get('service_date'),
      service_time:fd.get('service_time'),
      repertoire_title:repertoirePayload?'Repertório do culto':'',
      repertoire_notes:repertoirePayload,
      resource_url:mainResourceUrl,
      members
     }
    });
    lifecycle.complete();dialog.close();
    await refresh(`Escala criada (${res.created} integrantes).`);
   }catch(err){
    f.querySelector('.error').textContent=err.message;
   }finally{
    lifecycle.setBusy(false);b.disabled=false;
   }
  };
  dialog.showModal();
 }

 function openFinanceReportModal(){
  const dialog=host.querySelector('dialog');
  const firstDayMonth=today().slice(0,8)+'01';
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title">
    <h2>Relatórios</h2>
    ${button('close','Fechar','class="secondary"')}
   </div>
   <form class="record-form" id="finance-report-form">
    <div class="form-grid-2">
     ${field('start_date','Data inicial',firstDayMonth,'date',false,null,true)}
     ${field('end_date','Data final',today(),'date',false,null,true)}
    </div>
    ${field('account_id','Conta','','text',false,[['','Todas'],...opt(data.accounts)])}
    ${field('cost_center_id','Centro de Custo','','text',false,[['','Todos'],...opt(data.cost_centers)])}
    <div class="form-grid-2">
     ${field('direction','Movimentação','all','text',true,[['all','Entradas e Saídas'],['income','Somente Entradas'],['expense','Somente Saídas']])}
     ${field('payment_status','Status','all','text',true,[['all','Todos'],['paid','Liquidados'],['pending','Pendentes']])}
    </div>
    ${field('format','Formato','xlsx','text',true,[
     ['xlsx','Excel (.xlsx)'],
     ['html','PDF / Impressão'],
     ['csv','CSV (.csv)'],
     ['json','JSON (.json)']
    ])}
    <button type="submit">Baixar relatório</button>
   </form>`;

  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#finance-report-form').onsubmit=ev=>{
   ev.preventDefault();
   const fd=new FormData(ev.currentTarget);
   const params=new URLSearchParams();
   for(const [k,v] of fd.entries()){if(v)params.set(k,v);}
   const url='/api/finance/report?'+params.toString();
   window.open(url,'_blank','noopener');
   dialog.close();
  };
  dialog.showModal();
 }

 function openMemberDocumentModal(r){
  const dialog=host.querySelector('dialog');
  const code=String(r.id||'').slice(0,8).toUpperCase();
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title"><h2>Credencial · ${e(r.name)}</h2>${button('close','Fechar','class="secondary"')}</div>
   <div id="printable-member-doc" style="display:grid;gap:18px;margin:14px 0;">
    <article style="border:2px solid #18181b;border-radius:16px;padding:20px;background:#fff;color:#09090b;">
     <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <div><strong style="font-size:18px;letter-spacing:-0.02em;">IGREJA BATISTA DA LAGOINHA</strong><small style="display:block;color:#52525b;">CREDENCIAL DE MEMBRO</small></div>
      <span class="badge" style="background:#09090b;color:#fff;">ID #${e(code)}</span>
     </div>
     <div class="form-grid-2" style="gap:10px;font-size:13px;">
      <div><small style="color:#71717a;display:block;">Nome</small><strong>${e(r.name)}</strong></div>
      <div><small style="color:#71717a;display:block;">Jornada</small><strong>${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</strong></div>
      <div><small style="color:#71717a;display:block;">Família</small><strong>${e(r.family_name||'Individual')}</strong></div>
      <div><small style="color:#71717a;display:block;">GC</small><strong>${e(r.cell_name||'Não vinculado')}</strong></div>
      <div><small style="color:#71717a;display:block;">Nascimento</small><strong>${date(r.birthday)}</strong></div>
      <div><small style="color:#71717a;display:block;">Membro Desde</small><strong>${date(r.joined_on)}</strong></div>
     </div>
    </article>
    <article style="border:2px double #065f46;border-radius:16px;padding:22px;background:#f0fdf4;color:#064e3b;text-align:center;">
     <span class="badge" style="background:#065f46;color:#fff;margin-bottom:8px;">CERTIFICADO DE BATISMO</span>
     <h3 style="margin:6px 0;font-size:20px;">${e(r.name)}</h3>
     <small style="display:block;margin-top:8px;color:#065f46;font-weight:700;">Data: ${date(r.baptism_date||r.joined_on)}</small>
    </article>
   </div>
   <div style="display:flex;gap:10px;justify-content:flex-end;">
    <button type="button" id="print-member-doc-btn">${uiIcon('printer',16)} Imprimir / PDF</button>
   </div>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#print-member-doc-btn').onclick=()=>window.print();
  dialog.showModal();
 }

 function openSelfRegModal(){
  const dialog=host.querySelector('dialog');
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title"><h2>Ficha de Cadastro</h2>${button('close','Fechar','class="secondary"')}</div>
   <form class="record-form" id="self-reg-form">
    ${field('name','Nome completo', '', 'text', true)}
    ${field('phone','Telefone','','tel')}
    ${field('email','E-mail','','email')}
    ${field('birthday','Data de nascimento','','date')}
    ${field('integration_stage','Perfil','visitor','text',true,[['visitor','Visitante'],['new_convert','Novo Convertido'],['baptized','Batizado(a)'],['active_member','Membro']])}
    ${field('cell_id','GC (opcional)','', 'text', false, [['','Escolher depois'],...opt(data.cells)])}
    ${field('address','Endereço / Bairro','')}
    <p class="error" role="alert"></p>
    <button type="submit">Enviar</button>
   </form>`;
  const lifecycle=guardForm(dialog.querySelector('form'),dialog);
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#self-reg-form').onsubmit=async ev=>{
   ev.preventDefault();if(lifecycle.busy)return;lifecycle.setBusy(true);
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{
    const body=Object.fromEntries(new FormData(f));
    if(!body.birthday)body.birthday=null;
    if(!body.cell_id)body.cell_id=null;
    const res=await api('/members/self-register',{method:'POST',body});
    lifecycle.complete();dialog.close();
    await refresh(res.message||'Cadastro registrado.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{lifecycle.setBusy(false);b.disabled=false;}
  };
  dialog.showModal();
 }

 async function form(kind,record,presetMinistry=''){
  const r=record||{};const isEdit=Boolean(record&&r.id);let html='';
  if(kind==='cells'){
   html=field('name','Nome do GC',r.name,'text',true)
    +field('leader_name','Líder',r.leader_name||'Liderança GC')
    +field('neighborhood','Bairro',r.neighborhood)
    +field('address','Endereço',r.address)
    +field('meeting_day','Dia e horário',r.meeting_day||'Terça-feira | 19h30')
    +field('banner_url','Banner',r.banner_url||'/gc/gc-ide.webp','text',false,[
     ['/gc/gc-ide.webp','GC Ide'],
     ['/gc/gc-emanuel.webp','GC Emanuel'],
     ['/gc/gc-fe.webp','GC Fé'],
     ['/gc/gc-betel.webp','GC Betel'],
     ['/gc/gc-rocket.webp','GC Rocket'],
     ['/gc/gc-legacy.webp','GC Legacy'],
     ['/gc/gc-proposito.webp','GC Propósito'],
     ['/gc/gc-aviva.webp','GC Aviva']
    ]);
  }
  if(kind==='families'){
   html=field('name','Nome da família',r.name,'text',true)
    +field('cell_id','GC',r.cell_id,'text',false,[['','Sem GC'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('neighborhood','Bairro',r.neighborhood)
    +field('joined_on','Entrada na igreja',r.joined_on,'date');
  }
  if(kind==='people'){
   html=field('name','Nome completo',r.name,'text',true)
    +((data.pastoral_notes_allowed||r.id===data.my_person_id)?field('phone','Telefone',r.phone,'tel')
    +field('email','E-mail',r.email,'email')
    +field('birthday','Data de nascimento',r.birthday,'date')
    +field('integration_stage','Jornada',r.integration_stage||'active_member','text',true,Object.entries(stageLabels))
    +field('family_id','Família (opcional)',r.family_id,'text',false,[['','Sem família'],...opt(data.families,r.family_id,r.family_name)])
    +field('cell_id','GC (opcional)',r.cell_id,'text',false,[['','Sem GC'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('gc_role','Função no GC',r.gc_role||'member','text',true,[['leader','⭐ Líder de GC'],['member','Participante / Membro']])
    +field('address','Bairro / Endereço',r.address):'');
  }
  if(kind==='assignments'){
   directory=await api('/ministries/people');
   const defaultMin=presetMinistry||r.ministry||ministryFilter||data.user_scope||data.catalog[0];
   const rolePresets=defaultMin==='Music'?WORSHIP_ROLES:(MINISTRY_META[defaultMin]?.roles||['Integrante','Voluntário','Líder']);
   html=`<div class="lookup"><label>Buscar pessoa<input id="person-search" maxlength="100"></label>${button('lookup','Buscar','class="secondary"')}</div>`
    +field('person_id','Pessoa',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('ministry','Ministério',defaultMin,'text',true,data.catalog.map(x=>[x,x]))
    +`<label>Função
      <input name="position" list="ministry-role-suggestions" value="${e(r.position||(defaultMin==='Music'?'Tecladista':'Integrante'))}" required maxlength="80">
      <datalist id="ministry-role-suggestions">${[...new Set([...WORSHIP_ROLES,...rolePresets])].map(rp=>`<option value="${e(rp)}"></option>`).join('')}</datalist>
     </label>`
    +field('is_leader','Liderança',r.is_leader?'true':'false','text',true,[['false','Voluntário / Equipe'],['true','⭐ Líder / Coordenador']]);
  }
  if(kind==='schedules'){
   directory=await api('/ministries/people');
   const activeOccurrences=(data.service_occurrences||[]).filter(o=>!o.is_hidden);
   html=field('preset_occurrence','Culto semanal oficial (Data e Horário)','','text',false,[['','Preencher manualmente ou selecionar culto...'],...activeOccurrences.map(o=>[`${o.date}|${o.time}|${o.duration_minutes}|${encodeURIComponent(o.title)}`,`📅 ${o.title} — ${date(o.date)} (${o.weekday_name}) às ${o.time}`])])+`<div class="lookup"><label>Buscar voluntário<input id="person-search" maxlength="100"></label>${button('lookup','Buscar','class="secondary"')}</div>`
    +field('title','Culto / Evento',r.title||'Culto de Celebração','text',true)
    +field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('person_id','Voluntário',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('role_notes','Função no culto',r.role_notes)
    +field('service_date','Data',r.service_date||today(),'date',true,null,true)
    +field('service_time','Horário',r.service_time||'18:00','time',true)
    +field('duration_minutes','Duração em minutos',r.duration_minutes||60,'number',true)
    +field('response_due_at','Responder até (opcional)',r.response_due_at?.slice(0,16)||'','datetime-local')
    +field('reminder_enabled','Lembrete de resposta',r.reminder_enabled?'true':'false','text',true,[['false','Desativado'],['true','Ativado']])
    +field('status','Status',r.status||'confirmed','text',true,Object.entries(scheduleStatusLabels));
  }
  if(kind==='resources'){
   html=field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('title','Título',r.title,'text',true)
    +field('category','Categoria',r.category||'roteiro','text',true,Object.entries(resourceCatLabels))
    +field('notes','Notas',r.notes)
    +field('resource_url','Link externo',r.resource_url,'url');
  }
  if(kind==='cost-centers'){
   html=field('name','Nome',r.name,'text',true)
    +field('ministry','Ministério',r.ministry,'text',false,[['','Sem vínculo'],...Object.keys(MINISTRY_META).map(x=>[x,x])])
    +field('budget_value','Orçamento (R$)',r.budget_cents!==undefined?(r.budget_cents/100).toFixed(2):'0','text',true);
  }
  if(kind==='accounts'){
   html=field('name','Nome da conta',r.name,'text',true)
    +field('bank','Banco / Instituição',r.bank)
    +field('opening_value','Saldo inicial (R$)',r.opening_cents!==undefined?(r.opening_cents/100).toFixed(2):'0','text',true);
  }
  if(kind==='entries'){
   html=field('account_id','Conta',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('cost_center_id','Centro de Custo',r.cost_center_id,'text',false,[['','Sem centro de custo'],...opt(data.cost_centers,r.cost_center_id,r.cost_center_name)])
    +field('direction','Tipo',r.direction||'income','text',true,[['income','Entrada'],['expense','Saída']])
    +field('payment_status','Status',r.payment_status||'paid','text',true,[['paid','Liquidado'],['pending','⏳ Pendente']])
    +field('payment_method','Meio de pagamento',r.payment_method||'pix','text',true,Object.entries(paymentMethodLabels))
    +field('description','Descrição',r.description,'text',true)
    +field('occurred_on','Data',r.occurred_on||today(),'date',true)
    +field('due_date','Vencimento',r.due_date,'date',false,null,true)
    +field('amount','Valor (R$)',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true);
  }
  if(kind==='closings'){
   html=field('service_name','Culto',r.service_name,'text',true)
    +field('service_date','Data',r.service_date||today(),'date',true)
    +field('account_id','Conta de destino',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('tithes','Dízimos (R$)',r.tithes_cents!==undefined?(r.tithes_cents/100).toFixed(2):'0','text',true)
    +field('offerings_cash','Ofertas em Espécie (R$)',r.offerings_cash_cents!==undefined?(r.offerings_cash_cents/100).toFixed(2):'0','text',true)
    +field('offerings_pix','Ofertas PIX (R$)',r.offerings_pix_cents!==undefined?(r.offerings_pix_cents/100).toFixed(2):'0','text',true)
    +field('offerings_card','Ofertas Cartão (R$)',r.offerings_card_cents!==undefined?(r.offerings_card_cents/100).toFixed(2):'0','text',true)
    +field('counted_by','1º Conferente',r.counted_by,'text',true)
    +field('verified_by','2º Conferente (opcional)',r.verified_by,'text',false)
    +field('notes','Observações (opcional)',r.notes);
  }
  if(kind==='invoices'){
   html=field('number','Número da nota',r.number,'text',true)
    +field('supplier','Fornecedor',r.supplier,'text',true)
    +field('issued_on','Data de emissão',r.issued_on||today(),'date',true)
    +field('amount','Valor (R$)',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)
    +field('entry_id','Lançamento vinculado',r.entry_id,'text',false,[['','Sem vínculo'],...opt((data.entries||[]).map(x=>({...x,name:x.description})),r.entry_id)])
    +`<input name="file_id" type="hidden" value="${e(r.file_id)}"><label>Anexo (PDF ou Imagem)<input type="file" id="invoice-file" accept="application/pdf,image/jpeg,image/png,image/webp"></label><p id="invoice-status" role="status">${r.file_id?`<a href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">Ver anexo atual</a>`:''}</p>`;
  }

  const dialog=host.querySelector('dialog');
  dialog.querySelector('.sector-modal').innerHTML=`<div class="section-title"><h2>${isEdit?'Editar':'Adicionar'} · ${labels[kind]}</h2>${button('close','Fechar','class="secondary"')}</div><form class="record-form"><input name="request_id" type="hidden" value="${id()}">${html}<p class="error" role="alert"></p><button type="submit">Salvar</button></form>`;
  const lifecycle=guardForm(dialog.querySelector('form'),dialog);
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('[name=preset_occurrence]')?.addEventListener('change',event=>{const val=event.target.value;if(!val)return;const parts=val.split('|');const occDate=parts[0],occTime=parts[1],occDuration=parts[2],occTitle=decodeURIComponent(parts[3]||'');const f=dialog.querySelector('form');if(occTitle&&f.elements.title)f.elements.title.value=occTitle;if(occDate&&f.elements.service_date)f.elements.service_date.value=occDate;if(occTime&&f.elements.service_time)f.elements.service_time.value=occTime;if(occDuration&&f.elements.duration_minutes)f.elements.duration_minutes.value=occDuration;});
  dialog.querySelector('[data-sector-action="lookup"]')?.addEventListener('click',async()=>{
   try{
    directory=await api('/ministries/people?q='+encodeURIComponent(dialog.querySelector('#person-search').value));
    dialog.querySelector('[name=person_id]').innerHTML=directory.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('');
   }catch(err){dialog.querySelector('.error').textContent=err.message;}
  });
  dialog.querySelector('#invoice-file')?.addEventListener('change',async event=>{
   const file=event.target.files[0];if(!file)return;const b=dialog.querySelector('button[type=submit]'),status=dialog.querySelector('#invoice-status');
   if(file.size>10*1024*1024){status.textContent='O limite é 10 MB.';return;}
   lifecycle.setBusy(true);b.disabled=true;status.textContent='Enviando…';
   try{const body=new FormData();body.append('file',file);const res=await api('/finance/files',{method:'POST',body,raw:true});dialog.querySelector('[name=file_id]').value=res.id;status.innerHTML=`<a href="${e(res.url)}" target="_blank" rel="noopener">Anexo enviado ✓</a>`;}catch(err){status.textContent=err.message;}finally{lifecycle.setBusy(false);b.disabled=false;event.target.value='';}
  });
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(lifecycle.busy)return;const f=event.currentTarget,b=f.querySelector('button[type=submit]');lifecycle.setBusy(true);b.disabled=true;
   try{
    const body=Object.fromEntries(new FormData(f));if(isEdit)body.version=r.version;
    for(const name of ['family_id','cell_id','birthday','joined_on','baptism_date','started_on','due_date','cost_center_id','entry_id','file_id']){
     if(name in body&&!body[name])body[name]=null;
    }
    if('is_leader' in body)body.is_leader=body.is_leader==='true';
    if('reminder_enabled' in body)body.reminder_enabled=body.reminder_enabled==='true';
    if('duration_minutes' in body)body.duration_minutes=Number(body.duration_minutes);
    await api('/'+key+'/'+kind+(isEdit?'/'+r.id:''),{method:isEdit?'PUT':'POST',body});
    lifecycle.complete();dialog.close();await refresh('Registro salvo.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{lifecycle.setBusy(false);b.disabled=false;}
  };
  dialog.showModal();
 }

 
 async function action(b){
  try{
   if(b.dataset.respondSchedule || b.dataset.sectorAction === 'respond-schedule'){
    const sid=b.dataset.respondSchedule;
    const status=b.dataset.status;
    if(status==='declined'){
     let dlg=host.querySelector('#sector-dialog')||document.querySelector('#sector-dialog');
     if(!dlg){
      dlg=document.createElement('dialog');
      dlg.id='sector-dialog';
      dlg.innerHTML='<div class="sector-modal"></div>';
      (host.querySelector('.page-enter')||host).append(dlg);
     }
     if(dlg){
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
        await refresh('Indisponibilidade comunicada à coordenação.');
       }catch(err){
        b.disabled=false;
        alert(err.message);
       }
      };
      dlg.showModal();
      return;
     }
    }
    b.disabled=true;
    try{
     await api(`/ministries/schedules/${sid}/respond`,{method:'POST',body:{status,reason:''}});
     await refresh('Presença confirmada na escala!');
    }catch(err){
     b.disabled=false;
     alert(err.message);
    }
    return;
   }
   const kind=b.dataset.kind;
   const list=kind?getRowsForKind(kind):[];
   const r=list.find(x=>x.id===b.dataset.id);
   if(b.dataset.sectorAction==='open-qr'){if(openQrModal)openQrModal();return;}
   if(b.dataset.sectorAction==='filter-ministry'){ministryFilter=ministryFilter===b.dataset.ministry?'':b.dataset.ministry;paint();return;}
   if(b.dataset.sectorAction==='filter-cell'){cellFilter=cellFilter===b.dataset.cell?'':b.dataset.cell;paint();return;}
   if(b.dataset.sectorAction==='assign-gc-member'){await openAssignGcMemberModal(b.dataset.cell);return;}
   if(b.dataset.sectorAction==='people-next'||b.dataset.sectorAction==='people-prev'){peoplePage+=b.dataset.sectorAction==='people-next'?1:-1;await refresh();return;}
   if(b.dataset.sectorAction==='clear'){query='';ministryFilter='';cellFilter='';await refresh();return;}
   if(b.dataset.sectorAction==='self-reg-modal'){openSelfRegModal();return;}
   if(b.dataset.sectorAction==='worship-scale-modal'){await openWorshipScaleModal();return;}
    if(b.dataset.sectorAction==='scale-service-occurrence'){if(ministryFilter==='Music'||b.dataset.ministry==='Music'){await openWorshipScaleModal({title:b.dataset.serviceTitle,service_date:b.dataset.serviceDate,service_time:b.dataset.serviceTime});return;}await form('schedules',{title:b.dataset.serviceTitle,service_date:b.dataset.serviceDate,service_time:b.dataset.serviceTime,duration_minutes:Number(b.dataset.serviceDuration||90),ministry:b.dataset.ministry||ministryFilter},b.dataset.ministry||ministryFilter);return;}
   if(b.dataset.sectorAction==='worship-member-modal'){await form('assignments',null,'Music');return;}
   if(b.dataset.sectorAction==='finance-report-modal'){openFinanceReportModal();return;}
   if(b.dataset.sectorAction==='member-doc'){
    const person=(data.people||[]).find(x=>x.id===b.dataset.id);
    if(person)openMemberDocumentModal(person);
    return;
   }
   if(b.dataset.sectorAction==='approve-self-reg'){
    b.disabled=true;
    await api('/members/self-registrations/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Cadastro aprovado!');
    return;
   }
   if(b.dataset.sectorAction==='reject-self-reg'){
    if(!confirm('Recusar este cadastro?'))return;
    b.disabled=true;
    await api('/members/self-registrations/'+b.dataset.id,{method:'DELETE'});
    await refresh('Solicitação recusada.');
    return;
   }
   if(b.dataset.sectorAction==='approve-gc-app'){
    b.disabled=true;
    await api('/members/gc-applications/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Membro aprovado no GC!');
    return;
   }
   if(b.dataset.sectorAction==='reject-gc-app'){
    if(!confirm('Encerrar esta solicitação de GC?'))return;
    b.disabled=true;
    await api('/members/gc-applications/'+b.dataset.id,{method:'DELETE'});
    await refresh('Solicitação encerrada.');
    return;
   }
   if(b.dataset.sectorAction==='approve-min-app'){
    b.disabled=true;
    await api('/ministries/applications/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Candidato aprovado no Ministério!');
    return;
   }
   if(b.dataset.sectorAction==='reject-min-app'){
    if(!confirm('Recusar esta candidatura?'))return;
    b.disabled=true;
    await api('/ministries/applications/'+b.dataset.id,{method:'DELETE'});
    await refresh('Candidatura recusada.');
    return;
   }
   if(b.dataset.sectorAction==='settle'){
    b.disabled=true;
    await api('/finance/entries/'+b.dataset.id+'/settle',{method:'POST'});
    await refresh('Lançamento liquidado!');
    return;
   }
   if(b.dataset.sectorAction==='new')await form(kind,null,b.dataset.presetMinistry||ministryFilter);
   if(b.dataset.sectorAction==='edit')await form(kind,r);
   if(b.dataset.sectorAction==='archive'){
    if(!confirm('Arquivar este registro?'))return;
    b.disabled=true;await api('/'+key+'/'+kind+'/'+r.id+'?version='+r.version,{method:'DELETE'});await refresh('Registro arquivado.');
   }
   if(b.dataset.sectorAction==='history'){
    const changes=await api('/finance/history/'+b.dataset.id);const dialog=host.querySelector('dialog');dialog.querySelector('.sector-modal').innerHTML=`<h2>Histórico</h2>${changes.map(c=>`<article><strong>${e(c.action)} · ${e(new Date(c.created_at).toLocaleString('pt-BR'))}</strong><pre>${e(c.after_json||c.before_json||'')}</pre></article>`).join('')||'<p>Sem alterações.</p>'}${button('close','Fechar','class="secondary"')}`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
   }
  }catch(err){const status=host.querySelector('[role=status]');if(status)status.textContent=err.message;b.disabled=false;}
 }
 return {mount,setTab,getTab};
}
