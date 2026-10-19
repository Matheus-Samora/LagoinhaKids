import {uiIcon} from '../ui/icons.js';
import {ministryEmblem,MINISTRY_META} from './emblems.js';
import {t, translateDOM} from './i18n.js';

export function createSectors({api,e,identity,openQrModal,onTabChange}){
 let key='',data={},directory=[],query='',ministryFilter='',activeTab='all',generation=0,host;
 const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
 const date=v=>v?v.slice(0,10).split('-').reverse().join('/'):'—';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const id=()=>crypto.randomUUID();
 const role=()=>{
  if(identity().platform_admin)return 'admin';
  if(identity().pastor)return 'pastor';
  return identity().modules.find(m=>m.id===key)?.role;
 };
 const edit=()=>['admin','pastor','editor'].includes(role());
 const canArchive=()=>['admin','pastor'].includes(role());

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
 const options=(rows,field='name')=>rows.map(r=>[r.id,r[field]]);

 function cleanPhone(p){
  const digits=String(p||'').replace(/\D/g,'');
  if(!digits)return '';
  return digits.startsWith('55')?digits:'55'+digits;
 }

 function whatsAppUrl(){return '';}

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
        const wUrl=whatsAppUrl(a.phone,`Olá, ${a.member_name.split(' ')[0]}! Paz! Recebemos sua inscrição no ${a.target_name} na Lagoinha!`);
        return `<tr>
         <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem telefone')}</small>${wUrl?`<span>WhatsApp</span>`:''}</td>
         <td><span class="badge" style="background:#0f766e;color:#fff;">${e(a.target_name)}</span><small>${e(a.role_desired||'Participante')}</small></td>
         <td><small>${e(a.notes||'—')}</small></td>
         <td class="row-buttons">${edit()?`${button('approve-gc-app','Aprovar',`data-id="${e(a.id)}"`)}${button('reject-gc-app','Recusar',`class="secondary" data-id="${e(a.id)}"`)}`:'<span>Aguardando</span>'}</td>
        </tr>`;
       }).join('')}
      </tbody>
     </table>
    </div>
   </section>`:''}
   ${regs.length?`<section class="panel sector-section" style="border-color:#059669;background:#ecfdf5;"><div class="section-title"><h2 style="color:#065f46;">Cadastros pendentes (${regs.length})</h2></div><div class="sector-table"><table><thead><tr><th>Nome</th><th>Família</th><th>Jornada</th><th>Ações</th></tr></thead><tbody>${regs.map(r=>`<tr><td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'Sem contato')}</small></td><td>${e(r.family_name||'—')}<small>${e(r.address||'')}</small></td><td><span class="badge">${e(stageLabels[r.integration_stage]||r.integration_stage)}</span></td><td class="row-buttons">${edit()?`${button('approve-self-reg','Aprovar',`data-id="${e(r.id)}"`)}${button('reject-self-reg','Recusar',`class="secondary" data-id="${e(r.id)}"`)}`:'<span>Aguardando</span>'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;
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
       const wUrl=whatsAppUrl(a.phone,`Olá, ${a.member_name.split(' ')[0]}! Paz! Recebemos sua candidatura para o Ministério ${a.target_name}.`);
       return `<tr>
        <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem contato')}</small>${wUrl?`<span>WhatsApp</span>`:''}</td>
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
  const musicSchedules=(data.schedules||[]).filter(s=>s.ministry==='Music');
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
     ${services.map(srv=>`<article class="worship-service-card">
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
     </article>`).join('')}
    </div>
   `:`<p class="subtle" style="margin-top:12px;">Nenhuma escala agendada.</p>`}
  </section>`;
 }

 function gcCardsShowcase(){
  if(key!=='members')return '';
  const cells=data.cells||[];
  if(!cells.length)return '';
  return `<section class="panel sector-section">
   <div class="section-title">
    <h2>GCs Ativos (${cells.length})</h2>
    ${edit()?button('new','+ Adicionar GC','data-kind="cells"'):''}
   </div>
   <div class="gc-showcase-grid">
    ${cells.map(gc=>`<article class="gc-banner-card">
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
       <span>${gc.member_count||0} membro(s)</span>
      </div>
      ${edit()?`<div style="display:flex;gap:8px;margin-top:6px;">${button('edit','Editar',`class="secondary" data-kind="cells" data-id="${e(gc.id)}" style="width:100%;min-height:36px;font-size:12.5px;"`)}</div>`:''}
     </div>
    </article>`).join('')}
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
   const stageCounts=Object.keys(stageLabels).map(k=>({key:k,label:stageLabels[k],count:people.filter(p=>(p.integration_stage||'active_member')===k).length}));

   return `<div class="stats metrics">
    ${statCard('Membros',data.total_people||0)}
    ${statCard('Famílias',data.total_families||0)}
    ${statCard('GCs ativos',data.total_cells||cells.length)}
    ${statCard('Aniversariantes',birthdaysMonth.length)}
   </div>

   <details class="panel"><summary>Integração e aniversários</summary><div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>Aniversariantes</h3><span class="badge">Mês atual</span></div>
     <div class="insight-list">
      ${birthdaysMonth.slice(0,3).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! A família Lagoinha celebra a sua vida neste mês!`);
       return `<div class="insight-item"><div><strong>${e(p.name)}</strong><small>${date(p.birthday)}</small></div><div>${wUrl?`<span>Parabéns</span>`:''}</div></div>`;
      }).join('')}
      ${visitors.slice(0,2).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! Que alegria receber você na Lagoinha!`);
       return `<div class="insight-item"><div><strong>${e(p.name)}</strong><small>${e(stageLabels[p.integration_stage]||'Visitante')}</small></div><div>${wUrl?`<span>Acolher</span>`:''}</div></div>`;
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
     const total=data.counts.find(c=>c.ministry===m)?.total||0;
     const activeClass=ministryFilter===m?'active':'';
     return `<button type="button" class="ministry-card-btn ${activeClass}" data-sector-action="filter-ministry" data-ministry="${e(m)}">
      <div class="ministry-card-top">
       ${ministryEmblem(m)}
       <span class="ministry-count-pill badge">${total}</span>
      </div>
      <strong class="ministry-card-name">${e(m)}</strong>
     </button>`;
    }).join('')}
   </div>
   ${worshipScalePanel()}`;
  }

  const incomeCents=Number(data.totals?.income_cents||0);
  const expenseCents=Number(data.totals?.expense_cents||0);
  const pendingIncome=Number(data.totals?.pending_income_cents||0);
  const pendingExpense=Number(data.totals?.pending_expense_cents||0);
  const totalBalance=(data.accounts||[]).reduce((n,a)=>n+Number(a.balance_cents||0),0);
  const flowTotal=incomeCents+expenseCents;
  const incomePct=flowTotal>0?Math.round((incomeCents/flowTotal)*100):50;
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
     <div class="insight-head"><h3>Balanço</h3><span class="badge">${netFlow>=0?'Superávit':'Atenção'}</span></div>
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
  if(kind==='cells')return `<td><strong>${e(r.name)}</strong><small>${e(r.address||r.neighborhood||'—')}</small></td><td>${e(r.leader_name||'Liderança GC')}<small>${e(r.meeting_day||'')}</small></td><td><span class="badge">${r.member_count||0} membro(s)</span></td>`;
  if(kind==='families')return `<td><strong>${e(r.name)}</strong><small>${e(r.neighborhood||'')}</small></td><td><span class="badge">${r.member_count} integrante(s)</span>${r.cell_name?`<small>GC: ${e(r.cell_name)}</small>`:''}</td><td>${date(r.joined_on)}</td>`;
  if(kind==='people'){
   const wUrl=whatsAppUrl(r.phone,`Olá, ${r.name.split(' ')[0]}! Paz seja contigo!`);
   return `<td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'')}</small>${wUrl?`<span>WhatsApp</span>`:''}</td><td>${e(r.family_name||'—')}<small>${e(r.relationship||'Membro')}${r.cell_name?` · GC: ${e(r.cell_name)}`:''}</small><span class="badge" style="margin-top:4px;">${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</span></td><td>${date(r.joined_on)}<small>Nasc.: ${date(r.birthday)}</small></td>`;
  }
  if(kind==='schedules')return `<td><strong>${e(r.title)}</strong><small>${date(r.service_date)} às ${e(r.service_time||'18:00')}</small></td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.person_name)} ${r.role_notes?`· <strong>${e(r.role_notes)}</strong>`:''}</small></td><td><span class="badge">${e(scheduleStatusLabels[r.status]||r.status)}</span></td>`;
  if(kind==='assignments')return `<td><strong>${e(r.person_name)}</strong>${r.is_leader?' <span class="badge">⭐ Líder</span>':''}</td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.position)}</small></td><td>${date(r.started_on)}<small>${e(trainingLabels[r.training_status||'certified']||r.training_status)}</small></td>`;
  if(kind==='resources')return `<td><strong>${e(r.title)}</strong><small>${e(resourceCatLabels[r.category]||r.category)}</small></td><td><span class="badge">${e(r.ministry)}</span><small>${e(r.notes||'')}</small></td><td>${r.resource_url?`<a class="badge" href="${e(r.resource_url)}" target="_blank" rel="noopener">Abrir</a>`:'<span class="subtle">Interno</span>'}</td>`;
  if(kind==='closings')return `<td><strong>${e(r.service_name)}</strong><small>${date(r.service_date)} · ${e(r.account_name)}</small></td><td><small>Dízimos: ${cash(r.tithes_cents)} · Espécie: ${cash(r.offerings_cash_cents)} · PIX: ${cash(r.offerings_pix_cents)}</small></td><td><strong class="money income">${cash(r.total_cents)}</strong><small>${e(r.counted_by)} &amp; ${e(r.verified_by)}</small></td>`;
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
  return rows;
 }

 function section(kind){
  const rows=getRowsForKind(kind);
  const headers={
   cells:['GC / Endereço','Líder','Membros'],
   families:['Família','Integrantes','Entrada'],
   people:['Membro','Família / GC','Datas'],
   schedules:['Culto / Evento','Ministério / Função','Status'],
   assignments:['Pessoa','Ministério / Função','Início'],
   resources:['Material','Ministério','Acesso'],
   closings:['Culto / Conta','Resumo','Total'],
   'cost-centers':['Centro de Custo','Orçamento','Gasto'],
   accounts:['Conta / Banco','Saldo inicial','Saldo atual'],
   entries:['Lançamento','Data / Status','Valor'],
   invoices:['Nota / Fornecedor','Emissão','Valor']
  }[kind];
  const filterSuffix=['assignments','schedules','resources'].includes(kind)&&ministryFilter?` · ${e(ministryFilter)}`:'';
  return `<section class="panel sector-section" id="section-${kind}"><div class="section-title"><h2>${uiIcon(kind,20)}${labels[kind]}${filterSuffix}</h2>${edit()?button('new','+ Adicionar',`data-kind="${kind}"`):''}</div>${rows.length?`<div class="sector-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${row(kind,r)}<td class="row-buttons">${kind==='people'?button('member-doc','Credencial',`class="secondary" data-id="${e(r.id)}"`):''}${kind==='entries'&&r.payment_status==='pending'&&edit()?button('settle','Baixar',`data-id="${e(r.id)}"`):''}${edit()?button('edit','Editar',`data-kind="${kind}" data-id="${e(r.id)}"`):'<span>Consulta</span>'}${canArchive()?button('archive','Arquivar',`data-kind="${kind}" data-id="${e(r.id)}"`):''}${key==='finance'&&canArchive()&&['accounts','entries','invoices'].includes(kind)?button('history','Histórico',`data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty"><h3>Nenhum registro</h3></div>`}</section>`;
 }

 function paint(message=''){
  const allKinds=key==='members'?['people','families','cells']:key==='ministries'?['schedules','assignments','resources']:['entries','closings','accounts','cost-centers','invoices'];
  const visibleKinds=activeTab==='all'?allKinds:activeTab==='worship'?['schedules']:allKinds.filter(k=>k===activeTab);
  const showSummary=activeTab==='all';
  const showWorshipOnly=key==='ministries'&&activeTab==='worship';
  const showGcCards=key==='members'&&(activeTab==='all'||activeTab==='cells');

  host.innerHTML=`<div class="page-enter"><p role="status" class="status">${e(message)}</p>${heroBanner()}${showSummary?`${selfRegistrationsPanel()}${summary()}`:''}${showWorshipOnly?worshipScalePanel():''}${showGcCards?gcCardsShowcase():''}<form class="sector-search"><label>Buscar<input name="q" value="${e(query)}" maxlength="100" placeholder="Pesquisar..."></label><button>Buscar</button>${button('clear','Limpar','class="secondary"')}</form>${visibleKinds.map(section).join('')}<dialog id="sector-dialog"><div class="sector-modal"></div></dialog></div>`;
  host.querySelector('.sector-search').onsubmit=event=>{event.preventDefault();query=new FormData(event.currentTarget).get('q');void refresh();};
  host.querySelectorAll('[data-sector-action]').forEach(b=>b.onclick=()=>void action(b));
  translateDOM(host);
 }

 async function refresh(message=''){
  const n=++generation;
  try{const result=await api('/'+key+'?q='+encodeURIComponent(query));if(n!==generation)return;data=result;paint(message);}catch(err){if(n===generation)host.innerHTML=`<div class="panel"><p role="alert">${e(err.message)}</p>${button('retry','Tentar novamente')}</div>`;host.querySelector('[data-sector-action="retry"]')?.addEventListener('click',()=>void refresh());}
 }

 async function mount(module,initialTab='all'){key=module.id;activeTab=initialTab||'all';host=document.getElementById('sector-content');query='';ministryFilter='';if(host)await refresh();}

 function setTab(tab){
  activeTab=tab||'all';
  if(activeTab==='worship')ministryFilter='Music';
  else if(ministryFilter==='Music'&&tab!=='worship')ministryFilter='';
  if(host&&Object.keys(data).length)paint();
  if(onTabChange)onTabChange(activeTab);
 }

 function getTab(){return activeTab;}

 function field(name,label,value='',type='text',required=false,opts=null,allowFutureDate=false){
  const attrs=`name="${name}" ${required?'required':''}`;
  const maxDate=(type==='date'&&!allowFutureDate)?`max="${today()}"`:'';
  return `<label>${label}${opts?`<select ${attrs}>${opts.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value??'')?'selected':''}>${e(t)}</option>`).join('')}</select>`:`<input ${attrs} type="${type}" value="${e(value)}" ${maxDate} maxlength="${name==='pastoral_notes'?600:name==='description'||name==='address'||name==='notes'||name==='resource_url'||name==='banner_url'?250:name==='email'?200:160}" ${['amount','opening_value','budget_value','tithes','offerings_cash','offerings_pix','offerings_card'].includes(name)?'inputmode="decimal"':''}>`}</label>`;
 }

 const opt=(rows,currentId,currentLabel)=>{const list=options(rows||[]);if(currentId&&!list.some(([v])=>v===currentId))list.push([currentId,currentLabel||'Vínculo atual']);return list;};

 async function openWorshipScaleModal(){
  directory=await api('/ministries/people');
  const musicAssignments=(data.assignments||[]).filter(a=>a.ministry==='Music');
  const dialog=host.querySelector('dialog');

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
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
     ${field('title','Culto','Culto de Celebração','text',true)}
     ${field('service_date','Data',today(),'date',true,null,true)}
     ${field('service_time','Horário','18:00','text',true,[['09:00','09:00'],['10:00','10:00'],['17:00','17:00'],['18:00','18:00'],['19:30','19:30'],['20:00','20:00']])}
    </div>
    ${field('repertoire_notes','Repertório / Tons (opcional)','','text',false)}

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

  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#worship-scale-form').onsubmit=async ev=>{
   ev.preventDefault();
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

    const res=await api('/ministries/worship-scale',{
     method:'POST',
     body:{
      title:fd.get('title'),
      service_date:fd.get('service_date'),
      service_time:fd.get('service_time'),
      repertoire_title:fd.get('repertoire_notes')?'Repertório do culto':'',
      repertoire_notes:fd.get('repertoire_notes')||'',
      members
     }
    });
    dialog.close();
    await refresh(`Escala criada (${res.created} integrantes).`);
   }catch(err){
    f.querySelector('.error').textContent=err.message;
   }finally{
    b.disabled=false;
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
    ${field('family_name','Família', '')}
    ${field('cell_id','GC','', 'text', false, [['','Escolher depois'],...opt(data.cells)])}
    ${field('integration_stage','Perfil','visitor','text',true,[['visitor','Visitante'],['new_convert','Novo Convertido'],['baptized','Batizado(a)'],['active_member','Membro']])}
    ${field('birthday','Data de nascimento','','date')}
    ${field('phone','Telefone','','tel')}
    ${field('email','E-mail','','email')}
    ${field('marital_status','Estado Civil','','text',false,[['','Selecione...'],['Solteiro(a)','Solteiro(a)'],['Casado(a)','Casado(a)'],['Viúvo(a)','Viúvo(a)'],['Divorciado(a)','Divorciado(a)']])}
    ${field('profession','Profissão','')}
    ${field('address','Endereço / Bairro','')}
    <p class="error" role="alert"></p>
    <button type="submit">Enviar</button>
   </form>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#self-reg-form').onsubmit=async ev=>{
   ev.preventDefault();
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{
    const body=Object.fromEntries(new FormData(f));
    if(!body.birthday)body.birthday=null;
    if(!body.cell_id)body.cell_id=null;
    const res=await api('/members/self-register',{method:'POST',body});
    dialog.close();
    await refresh(res.message||'Cadastro registrado.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{b.disabled=false;}
  };
  dialog.showModal();
 }

 async function form(kind,record,presetMinistry=''){
  const r=record||{};let html='';
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
    +field('family_id','Família',r.family_id,'text',false,[['','Sem família'],...opt(data.families,r.family_id,r.family_name)])
    +field('cell_id','GC',r.cell_id,'text',false,[['','Sem GC'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('relationship','Parentesco',r.relationship)
    +field('integration_stage','Jornada',r.integration_stage||'active_member','text',true,Object.entries(stageLabels))
    +field('birthday','Data de nascimento',r.birthday,'date')
    +field('joined_on','Entrada na igreja',r.joined_on,'date')
    +field('baptism_date','Data de batismo',r.baptism_date,'date')
    +field('marital_status','Estado civil',r.marital_status,'text',false,[['','Não informado'],['Solteiro(a)','Solteiro(a)'],['Casado(a)','Casado(a)'],['Viúvo(a)','Viúvo(a)'],['Divorciado(a)','Divorciado(a)']])
    +field('profession','Profissão',r.profession)
    +field('phone','Telefone',r.phone,'tel')
    +field('email','E-mail',r.email,'email')
    +field('origin_church','Igreja de origem',r.origin_church)
    +field('address','Endereço',r.address)
    +(data.pastoral_notes_allowed?field('pastoral_notes','Observações pastorais',r.pastoral_notes):'');
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
    +field('is_leader','Liderança',r.is_leader?'true':'false','text',true,[['false','Voluntário / Equipe'],['true','⭐ Líder / Coordenador']])
    +field('training_status','Capacitação',r.training_status||'certified','text',true,Object.entries(trainingLabels))
    +field('started_on','Início',r.started_on,'date');
  }
  if(kind==='schedules'){
   directory=await api('/ministries/people');
   html=`<div class="lookup"><label>Buscar voluntário<input id="person-search" maxlength="100"></label>${button('lookup','Buscar','class="secondary"')}</div>`
    +field('title','Culto / Evento',r.title||'Culto de Celebração','text',true)
    +field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('person_id','Voluntário',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('role_notes','Função no culto',r.role_notes)
    +field('service_date','Data',r.service_date||today(),'date',true,null,true)
    +field('service_time','Horário',r.service_time||'18:00','text',true,[['09:00','09:00'],['10:00','10:00'],['17:00','17:00'],['18:00','18:00'],['19:30','19:30'],['20:00','20:00']])
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
    +field('ministry','Ministério',r.ministry)
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
    +field('amount','Valor (R$)',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)
    +field('category','Categoria',r.category);
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
    +field('verified_by','2º Conferente',r.verified_by,'text',true)
    +field('notes','Observações',r.notes);
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
  dialog.querySelector('.sector-modal').innerHTML=`<div class="section-title"><h2>${record?'Editar':'Adicionar'} · ${labels[kind]}</h2>${button('close','Fechar','class="secondary"')}</div><form class="record-form"><input name="request_id" type="hidden" value="${id()}">${html}<p class="error" role="alert"></p><button type="submit">Salvar</button></form>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('[data-sector-action="lookup"]')?.addEventListener('click',async()=>{
   try{
    directory=await api('/ministries/people?q='+encodeURIComponent(dialog.querySelector('#person-search').value));
    dialog.querySelector('[name=person_id]').innerHTML=directory.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('');
   }catch(err){dialog.querySelector('.error').textContent=err.message;}
  });
  dialog.querySelector('#invoice-file')?.addEventListener('change',async event=>{
   const file=event.target.files[0];if(!file)return;const b=dialog.querySelector('button[type=submit]'),status=dialog.querySelector('#invoice-status');
   if(file.size>10*1024*1024){status.textContent='O limite é 10 MB.';return;}
   b.disabled=true;status.textContent='Enviando…';
   try{const body=new FormData();body.append('file',file);const res=await api('/finance/files',{method:'POST',body,raw:true});dialog.querySelector('[name=file_id]').value=res.id;status.innerHTML=`<a href="${e(res.url)}" target="_blank" rel="noopener">Anexo enviado ✓</a>`;}catch(err){status.textContent=err.message;}finally{b.disabled=false;event.target.value='';}
  });
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const f=event.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{
    const body=Object.fromEntries(new FormData(f));if(record)body.version=r.version;
    for(const name of ['family_id','cell_id','birthday','joined_on','baptism_date','started_on','due_date','cost_center_id','entry_id','file_id']){
     if(name in body&&!body[name])body[name]=null;
    }
    if('is_leader' in body)body.is_leader=body.is_leader==='true';
    await api('/'+key+'/'+kind+(record?'/'+r.id:''),{method:record?'PUT':'POST',body});
    dialog.close();await refresh('Registro salvo.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{b.disabled=false;}
  };
  dialog.showModal();
 }

 async function action(b){
  try{
   const kind=b.dataset.kind;
   const list=kind?getRowsForKind(kind):[];
   const r=list.find(x=>x.id===b.dataset.id);
   if(b.dataset.sectorAction==='open-qr'){if(openQrModal)openQrModal();return;}
   if(b.dataset.sectorAction==='filter-ministry'){ministryFilter=ministryFilter===b.dataset.ministry?'':b.dataset.ministry;paint();return;}
   if(b.dataset.sectorAction==='clear'){query='';ministryFilter='';await refresh();return;}
   if(b.dataset.sectorAction==='self-reg-modal'){openSelfRegModal();return;}
   if(b.dataset.sectorAction==='worship-scale-modal'){await openWorshipScaleModal();return;}
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
   if(b.dataset.sectorAction==='new')await form(kind);
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
