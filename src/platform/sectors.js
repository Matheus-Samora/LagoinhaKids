export function createSectors({api,e,identity}){
 let key='',data={},directory=[],query='',ministryFilter='',generation=0,host;
 const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
 const date=v=>v?v.slice(0,10).split('-').reverse().join('/'):'—';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const id=()=>crypto.randomUUID();
 const role=()=>identity().platform_admin?'admin':identity().modules.find(m=>m.id===key)?.role;
 const edit=()=>['admin','editor'].includes(role());
 const labels={
  cells:'Células / GCs',
  families:'Famílias',
  people:'Membros',
  schedules:'Escalas de Cultos e Eventos',
  assignments:'Vínculos Ministeriais',
  resources:'Repertórios, Roteiros e Materiais',
  closings:'Borderôs de Culto (Dupla Conferência)',
  'cost-centers':'Centros de Custo e Orçamentos',
  accounts:'Contas e Caixas',
  entries:'Entradas e Saídas',
  invoices:'Notas Fiscais'
 };
 const stageLabels={
  visitor:'👋 Visitante',
  new_convert:'🌱 Novo Convertido',
  baptized:'💧 Batizado',
  in_training:'📖 Trilha DNA',
  active_member:'✓ Membro Ativo',
  leader:'⭐ Líder'
 };
 const trainingLabels={
  certified:'🟢 Certificado',
  in_training:'🟡 Em Treinamento',
  pending:'⚪ Pendente'
 };
 const scheduleStatusLabels={
  confirmed:'🟢 Confirmado',
  pending:'🟡 Aguardando',
  declined:'🔴 Indisponível'
 };
 const resourceCatLabels={
  repertorio:'🎵 Repertório / Cifras',
  roteiro:'📋 Roteiro de Culto',
  checklist:'✅ Checklist Operacional',
  documento:'📄 Manual / Documento'
 };
 const paymentMethodLabels={
  pix:'PIX',
  cash:'Espécie',
  card:'Cartão',
  transfer:'TED / Boleto',
  multi:'Múltiplos (Borderô)'
 };
 const button=(action,text,extra='')=>`<button type="button" data-sector-action="${action}" ${extra}>${text}</button>`;
 const options=(rows,field='name')=>rows.map(r=>[r.id,r[field]]);

 const ministryIcons={
  'Music':'🎵','Intercessão':'🙏','Hero':'🛡️','Shine':'✨','Bem Casados':'💍','Rocket':'🚀','Legacy':'🏛️','Kids':'🧒',
  'Manutenção':'🔧','Voluntário':'🤝','Follow':'🧭','Link Future':'🌐','Gourmet':'🍽️','Champions':'🏆','DNA':'🧬','Sonoplastia':'🎚️'
 };

 function cleanPhone(p){
  const digits=String(p||'').replace(/\D/g,'');
  if(!digits)return '';
  return digits.startsWith('55')?digits:'55'+digits;
 }

 function whatsAppUrl(phone,msg){
  const num=cleanPhone(phone);
  if(!num)return '';
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
 }

 function statCard(label,value,helper,symbol){
  return `<article class="stat"><div><span>${label}</span><strong>${value}</strong><small>${helper}</small></div><span class="stat-icon" aria-hidden="true">${symbol}</span></article>`;
 }

 function heroBanner(){
  if(key==='members'){
   return `<section class="welcome theme-members"><div><span class="pill">👥 MEMBRESIA, DISCIPULADO & CÉLULAS</span><h2>Cada pessoa tem nome,<br>história e <em>família.</em></h2><p>Acompanhe a jornada de integração (Visitante → Batismo → Membro → Líder), conecte células/GCs e cuide de cada família.</p><div class="welcome-actions">${edit()?`${button('new','+ Cadastrar membro','data-kind="people"')}${button('new','+ Nova família','class="ghost" data-kind="families"')}${button('new','+ Nova Célula / GC','class="ghost" data-kind="cells"')}`:''}${button('self-reg-modal','🔗 Ficha de Auto-Cadastro','class="ghost"')}</div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>`;
  }
  if(key==='ministries'){
   return `<section class="welcome theme-ministries"><div><span class="pill">✦ CORPO EM MOVIMENTO & VOLUNTARIADO</span><h2>Dons ativados.<br>Pessoas servindo com <em>propósito.</em></h2><p>Gerencie os 16 ministérios oficiais, agende escalas de culto com detecção de conflito e disponibilize roteiros e repertórios.</p>${edit()?`<div class="welcome-actions">${button('new','+ Vincular pessoa a ministério','data-kind="assignments"')}${button('new','+ Agendar escala de culto','class="ghost" data-kind="schedules"')}${button('new','+ Publicar repertório / roteiro','class="ghost" data-kind="resources"')}</div>`:''}</div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✦</span><div class="sun">◎</div><div class="hill"></div><div class="little-star">✳</div></div></section>`;
  }
  return `<section class="welcome theme-finance"><div><span class="pill">💼 TESOURARIA & MORDOMIA CRISTÃ</span><h2>Clareza financeira.<br>Integridade em <em>cada registro.</em></h2><p>Gerencie contas, centros de custo, contas a pagar/receber, borderôs de culto com dupla conferência e notas fiscais.</p><div class="welcome-actions">${edit()?`${button('new','+ Lançar entrada / saída','data-kind="entries"')}${button('new','+ Borderô de culto','class="ghost" data-kind="closings"')}${button('new','+ Centro de custo','class="ghost" data-kind="cost-centers"')}${button('new','+ Nota fiscal','class="ghost" data-kind="invoices"')}${button('new','+ Nova conta','class="ghost" data-kind="accounts"')}`:''}<a class="button ghost" href="/api/finance/export.csv" download="lagoinha-finance-relatorio.csv">📥 Exportar CSV</a></div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">◈</span><div class="sun">◐</div><div class="hill"></div><div class="little-star">✦</div></div></section>`;
 }

 function selfRegistrationsPanel(){
  if(key!=='members')return '';
  const regs=data.self_registrations||[];
  if(!regs.length)return '';
  return `<section class="panel sector-section" style="border-color:#059669;background:#ecfdf5;"><div class="section-title"><div><h2 style="color:#065f46;">📥 Fila de Aprovação — Auto-Cadastros Recebidos (${regs.length})</h2><p style="margin:4px 0 0;color:#047857;">Visitantes e membros que preencheram o formulário online aguardando validação da secretaria.</p></div></div><div class="sector-table"><table><thead><tr><th>Nome / Contato</th><th>Família / Endereço</th><th>Jornada / Profissão</th><th>Ações</th></tr></thead><tbody>${regs.map(r=>`<tr><td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'Sem contato')}</small></td><td>${e(r.family_name||'Sem família informada')}<small>${e(r.address||'')}</small></td><td><span class="badge">${e(stageLabels[r.integration_stage]||r.integration_stage)}</span><small>${e(r.marital_status||'')} ${r.profession?'· '+e(r.profession):''}</small></td><td class="row-buttons">${edit()?`${button('approve-self-reg','✓ Aprovar e integrar',`data-id="${e(r.id)}"`)}${button('reject-self-reg','Recusar',`class="secondary" data-id="${e(r.id)}"`)}`:'<span>Aguardando secretaria</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
 }

 function summary(){
  if(key==='members'){
   const people=data.people||[],families=data.families||[],cells=data.cells||[];
   const currentMonth=today().slice(5,7);
   const birthdaysMonth=people.filter(p=>p.birthday&&p.birthday.slice(5,7)===currentMonth);
   const linkedPeople=people.filter(p=>p.family_id).length;
   const avgFamily=data.total_families?((data.total_people||0)/data.total_families).toFixed(1):'0.0';
   const visitors=people.filter(p=>['visitor','new_convert'].includes(p.integration_stage));
   const stageCounts=Object.keys(stageLabels).map(k=>({key:k,label:stageLabels[k],count:people.filter(p=>(p.integration_stage||'active_member')===k).length}));

   return `<div class="stats metrics">
    ${statCard('Membros cadastrados',data.total_people||0,`${linkedPeople} com família vinculada`,'👤')}
    ${statCard('Famílias cadastradas',data.total_families||0,`Média de ${avgFamily} integrante(s) por família`,'🏠')}
    ${statCard('Células / GCs ativos',data.total_cells||cells.length,'Pequenos grupos em comunhão','🌱')}
    ${statCard('Aniversariantes do mês',birthdaysMonth.length,'Celebrando a vida neste mês','🎂')}
   </div>
   <div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>🎂 Aniversariantes & Acolhimento Pastoral (WhatsApp 1-Clique)</h3><span class="badge">Cuidado Pastoral</span></div>
     <div class="insight-list">
      ${birthdaysMonth.slice(0,3).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! 🎉 A família Lagoinha celebra a sua vida neste mês! Que Deus abençoe ricamente seu novo ciclo!`);
       return `<div class="insight-item"><div><strong>🎂 ${e(p.name)}</strong><small>${e(p.family_name||'Sem família')} · Nascimento: ${date(p.birthday)}</small></div><div style="display:flex;gap:6px;align-items:center;">${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;border-color:#86efac;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Parabéns</a>`:'<span class="badge">Mês atual</span>'}</div></div>`;
      }).join('')}
      ${visitors.slice(0,2).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! Que alegria receber você na Lagoinha! Como podemos caminhar junto com você e sua família?`);
       return `<div class="insight-item"><div><strong>👋 ${e(p.name)}</strong><small>${e(stageLabels[p.integration_stage]||'Visitante')} · Entrada: ${date(p.joined_on)}</small></div><div>${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;border-color:#86efac;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Acolher</a>`:`<span class="badge">${e(stageLabels[p.integration_stage]||'Visitante')}</span>`}</div></div>`;
      }).join('')}
      ${!birthdaysMonth.length&&!visitors.length?'<p class="subtle" style="margin:0;">Informe datas de nascimento, telefone e estágio de integração para acionar mensagens pastorais com 1 clique.</p>':''}
     </div>
    </section>
    <section class="insight-card">
     <div class="insight-head"><h3>🧭 Funil da Jornada Eclesiástica</h3><span class="badge">${people.length} na lista</span></div>
     <div class="insight-list">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;">
       ${stageCounts.map(s=>`<div class="insight-item" style="flex-direction:column;align-items:flex-start;gap:2px;"><small>${e(s.label)}</small><strong style="font-size:18px;">${s.count}</strong></div>`).join('')}
      </div>
     </div>
    </section>
   </div>`;
  }

  if(key==='ministries'){
   const assignments=data.assignments||[];
   const schedules=data.schedules||[];
   const uniquePeople=new Set(assignments.map(a=>a.person_id)).size;
   const activeMinistries=(data.counts||[]).filter(c=>c.total>0).length;
   const leadersCount=assignments.filter(a=>a.is_leader||/l[ií]der|coord|pastor|diret|superv|respons/i.test(a.position||'')).length;
   const certifiedCount=assignments.filter(a=>(a.training_status||'certified')==='certified').length;

   return `${data.user_scope?`<p class="notice">🔒 Coordenação delegada ativa: você possui permissão de gestão focada no ministério <strong>${e(data.user_scope)}</strong>.</p>`:''}
   <div class="stats metrics">
    ${statCard('Vínculos ativos',assignments.length,`${certifiedCount} voluntário(s) certificado(s)`,'✦')}
    ${statCard('Voluntários únicos',uniquePeople,'Pessoas servindo ativamente','🙌')}
    ${statCard('Escalas agendadas',schedules.length,`${activeMinistries}/${(data.catalog||[]).length} ministérios ativos`,'📅')}
    ${statCard('Liderança & Cargos',leadersCount,'Líderes e coordenadores nomeados','⭐')}
   </div>
   <div class="section-title" style="margin-top:8px;">
    <h2>Painel dos 16 Ministérios Oficiais</h2>
    ${ministryFilter?button('filter-ministry','Mostrar todos os ministérios','data-ministry="" class="secondary"'):'<span class="subtle">Toque em um ministério para filtrar escalas, voluntários e roteiros</span>'}
   </div>
   <div class="ministry-grid-cards ministry-counts">
    ${(data.catalog||[]).map(m=>{
     const total=data.counts.find(c=>c.ministry===m)?.total||0;
     const activeClass=ministryFilter===m?'active':'';
     return `<button type="button" class="ministry-card-btn ${activeClass}" data-sector-action="filter-ministry" data-ministry="${e(m)}">
      <div class="ministry-card-top">
       <span class="ministry-emoji" aria-hidden="true">${ministryIcons[m]||'✦'}</span>
       <span class="ministry-count-pill badge">${e(m)} · ${total}</span>
      </div>
      <strong class="ministry-card-name">${e(m)}</strong>
     </button>`;
    }).join('')}
   </div>`;
  }

  const incomeCents=Number(data.totals?.income_cents||0);
  const expenseCents=Number(data.totals?.expense_cents||0);
  const pendingIncome=Number(data.totals?.pending_income_cents||0);
  const pendingExpense=Number(data.totals?.pending_expense_cents||0);
  const totalBalance=(data.accounts||[]).reduce((n,a)=>n+Number(a.balance_cents||0),0);
  const invoicesWithFile=(data.invoices||[]).filter(i=>i.file_id).length;
  const flowTotal=incomeCents+expenseCents;
  const incomePct=flowTotal>0?Math.round((incomeCents/flowTotal)*100):50;
  const netFlow=incomeCents-expenseCents;

  return `<p class="notice">Controle manual em reais com suporte a centros de custo, borderô de culto com dupla conferência e exportação contábil CSV.</p>
   <div class="stats metrics">
    ${statCard('Entradas liquidadas',cash(incomeCents),pendingIncome?`+ ${cash(pendingIncome)} a receber`:'Receitas, dízimos e ofertas','📈')}
    ${statCard('Saídas liquidadas',cash(expenseCents),pendingExpense?`+ ${cash(pendingExpense)} a pagar`:'Despesas e pagamentos pagos','📉')}
    ${statCard('Saldo das contas',cash(totalBalance),'Inclui saldos iniciais de abertura','🏦')}
    ${statCard('Notas & Borderôs',`${(data.invoices||[]).length} / ${(data.closings||[]).length}`,`${invoicesWithFile} nota(s) com PDF/imagem`,'🧾')}
   </div>
   <div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>📊 Balanço de Entradas vs. Saídas</h3><span class="badge">${netFlow>=0?'Superávit':'Atenção ao fluxo'}</span></div>
     <div>
      <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:700;margin-bottom:4px;">
       <span class="income">Entradas: ${cash(incomeCents)} (${flowTotal?incomePct:0}%)</span>
       <span class="expense">Saídas: ${cash(expenseCents)} (${flowTotal?100-incomePct:0}%)</span>
      </div>
      <div class="cashflow-meter"><div class="cashflow-meter-in" style="width:${incomePct}%"></div></div>
      <small class="subtle">Resultado líquido liquidado: <strong>${netFlow>=0?'+':'−'} ${cash(Math.abs(netFlow))}</strong> ${pendingExpense?`· Contas a pagar pendentes: <strong>${cash(pendingExpense)}</strong>`:''}</small>
     </div>
    </section>
    <section class="insight-card">
     <div class="insight-head"><h3>🎯 Centros de Custo & Contas</h3><span class="badge">${(data.cost_centers||[]).length} centro(s) · ${(data.accounts||[]).length} conta(s)</span></div>
     <div class="insight-list">
      ${(data.cost_centers||[]).slice(0,2).map(cc=>{
       const pct=cc.budget_cents>0?Math.min(100,Math.round((Number(cc.spent_cents||0)/Number(cc.budget_cents))*100)):0;
       return `<div class="insight-item" style="flex-direction:column;align-items:stretch;gap:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
         <strong>🎯 ${e(cc.name)} ${cc.ministry?`<small style="display:inline;">(${e(cc.ministry)})</small>`:''}</strong>
         <small style="margin:0;font-weight:700;">${cash(cc.spent_cents)} / ${cash(cc.budget_cents)}</small>
        </div>
        <div class="account-progress-track"><div class="account-progress-fill" style="width:${pct}%"></div></div>
       </div>`;
      }).join('')}
      ${(data.accounts||[]).slice(0,2).map(a=>`<div class="insight-item"><strong>🏦 ${e(a.name)}</strong><strong class="money">${cash(a.balance_cents)}</strong></div>`).join('')||'<p class="subtle" style="margin:0;">Cadastre contas e centros de custo para acompanhar a execução orçamentária.</p>'}
     </div>
    </section>
   </div>`;
 }

 function row(kind,r){
  if(kind==='cells')return `<td><strong>${e(r.name)}</strong><small>${e(r.neighborhood||'Bairro não informado')}</small></td><td>${e(r.leader_name||'Sem líder definido')}<small>${e(r.meeting_day||'')}</small></td><td><span class="badge">${r.member_count||0} membro(s)</span> <span class="badge">${r.family_count||0} família(s)</span></td>`;
  if(kind==='families')return `<td><strong>${e(r.name)}</strong><small>${e(r.neighborhood||'')}</small></td><td><span class="badge">${r.member_count} integrante(s)</span>${r.cell_name?`<small>Célula: ${e(r.cell_name)}</small>`:''}</td><td>${date(r.joined_on)}</td>`;
  if(kind==='people'){
   const wUrl=whatsAppUrl(r.phone,`Olá, ${r.name.split(' ')[0]}! Paz seja contigo!`);
   return `<td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'')}${r.profession?` · ${e(r.profession)}`:''}</small>${wUrl?`<a class="badge" style="margin-top:4px;font-size:11px;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 WhatsApp</a>`:''}</td><td>${e(r.family_name)}<small>${e(r.relationship||'Membro')}${r.cell_name?` · Célula: ${e(r.cell_name)}`:''}</small><span class="badge" style="margin-top:4px;">${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</span></td><td>${date(r.joined_on)}<small>Nasc.: ${date(r.birthday)}${r.baptism_date?` · Batismo: ${date(r.baptism_date)}`:''}</small></td>`;
  }
  if(kind==='schedules')return `<td><strong>${e(r.title)}</strong><small>📅 ${date(r.service_date)} às ${e(r.service_time||'18:00')}</small></td><td><span class="badge">${ministryIcons[r.ministry]||'✦'} ${e(r.ministry)}</span><small>👤 ${e(r.person_name)} ${r.role_notes?`(${e(r.role_notes)})`:''}</small></td><td><span class="badge">${e(scheduleStatusLabels[r.status]||r.status)}</span></td>`;
  if(kind==='assignments')return `<td><strong>${e(r.person_name)}</strong>${r.is_leader?' <span class="badge">⭐ Líder</span>':''}</td><td><span class="badge">${ministryIcons[r.ministry]||'✦'} ${e(r.ministry)}</span><small>${e(r.position)}</small></td><td>${date(r.started_on)}<small>${e(trainingLabels[r.training_status||'certified']||r.training_status)}</small></td>`;
  if(kind==='resources')return `<td><strong>${e(r.title)}</strong><small>${e(resourceCatLabels[r.category]||r.category)}</small></td><td><span class="badge">${ministryIcons[r.ministry]||'✦'} ${e(r.ministry)}</span><small>${e(r.notes||'')}</small></td><td>${r.resource_url?`<a class="badge" href="${e(r.resource_url)}" target="_blank" rel="noopener">🔗 Abrir material</a>`:'<span class="subtle">Texto interno</span>'}</td>`;
  if(kind==='closings')return `<td><strong>${e(r.service_name)}</strong><small>Data: ${date(r.service_date)} · Conta: ${e(r.account_name)}</small></td><td><small>Dízimos: ${cash(r.tithes_cents)} · Espécie: ${cash(r.offerings_cash_cents)}<br>PIX: ${cash(r.offerings_pix_cents)} · Cartão: ${cash(r.offerings_card_cents)}</small></td><td><strong class="money income">${cash(r.total_cents)}</strong><small>✍️ ${e(r.counted_by)} &amp; ${e(r.verified_by)}</small></td>`;
  if(kind==='cost-centers')return `<td><strong>${e(r.name)}</strong><small>${e(r.ministry||'Geral')}</small></td><td>${cash(r.budget_cents)}</td><td><span class="money expense">Saídas: ${cash(r.spent_cents)}</span><small>Entradas: ${cash(r.income_cents)}</small></td>`;
  if(kind==='accounts')return `<td><strong>${e(r.name)}</strong><small>${e(r.bank)}</small></td><td>${cash(r.opening_cents)}</td><td><strong>${cash(r.balance_cents)}</strong></td>`;
  if(kind==='entries'){
   const isPending=(r.payment_status||'paid')==='pending';
   return `<td><strong>${e(r.description)}</strong><small>${e(r.account_name)}${r.cost_center_name?` · 🎯 ${e(r.cost_center_name)}`:''}${r.category?` · ${e(r.category)}`:''} · ${e(paymentMethodLabels[r.payment_method]||r.payment_method||'PIX')}</small></td><td>${date(r.occurred_on)}${r.due_date?`<small>Venc.: ${date(r.due_date)}</small>`:''}<span class="badge" style="margin-top:4px;">${isPending?'⏳ Pendente':'🟢 Liquidado'}</span></td><td><span class="money ${r.direction}">${r.direction==='income'?'+':'−'} ${cash(r.amount_cents)}</span></td>`;
  }
  return `<td><strong>${e(r.number)}</strong><small>${e(r.supplier)}</small></td><td>${date(r.issued_on)}</td><td><strong>${cash(r.amount_cents)}</strong> ${r.file_id?`<a class="badge" href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">📎 Ver anexo</a>`:''}</td>`;
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
   cells:['Célula / GC','Líder e Reunião','Comunhão'],
   families:['Família','Integrantes / Célula','Entrada na igreja'],
   people:['Membro','Família e Jornada','Datas'],
   schedules:['Culto / Evento','Ministério e Voluntário','Status'],
   assignments:['Pessoa','Ministério / Função','Início e Trilha'],
   resources:['Material / Repertório','Ministério e Notas','Acesso'],
   closings:['Culto / Conta','Detalhamento','Total e Conferência'],
   'cost-centers':['Centro de Custo','Orçamento','Execução'],
   accounts:['Conta','Saldo inicial','Saldo atual'],
   entries:['Lançamento','Data / Status','Valor'],
   invoices:['Nota / Fornecedor','Emissão','Valor / Anexo']
  }[kind];
  const filterSuffix=['assignments','schedules','resources'].includes(kind)&&ministryFilter?` · ${e(ministryFilter)}`:'';
  return `<section class="panel sector-section"><div class="section-title"><h2>${labels[kind]}${filterSuffix}</h2>${edit()?button('new','Adicionar',`data-kind="${kind}"`):''}</div>${rows.length?`<div class="sector-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${row(kind,r)}<td class="row-buttons">${kind==='people'?button('member-doc','🪪 Carteirinha / Batismo',`class="secondary" data-id="${e(r.id)}"`):''}${kind==='entries'&&r.payment_status==='pending'&&edit()?button('settle','✓ Dar baixa',`data-id="${e(r.id)}"`):''}${edit()?button('edit','Editar',`data-kind="${kind}" data-id="${e(r.id)}"`):'<span>Consulta</span>'}${role()==='admin'?button('archive','Arquivar',`data-kind="${kind}" data-id="${e(r.id)}"`):''}${key==='finance'&&role()==='admin'&&['accounts','entries','invoices'].includes(kind)?button('history','Histórico',`data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty"><h3>Nenhum registro nesta lista</h3><p>${edit()?'Toque em Adicionar para começar ou ajuste a busca.':'A equipe ainda não cadastrou informações ou a busca não encontrou resultados.'}</p></div>`}</section>`;
 }

 function paint(message=''){
  const kinds=key==='members'?['people','families','cells']:key==='ministries'?['schedules','assignments','resources']:['entries','closings','accounts','cost-centers','invoices'];
  host.innerHTML=`<div class="page-enter"><div class="sector-toolbar"><a class="button secondary" href="/access">← Meus acessos</a><span class="badge">${role()==='viewer'?'Somente consulta':role()==='admin'?'🛡️ Administração do setor':'✏️ Cadastro e edição'}</span></div><p role="status" class="status">${e(message)}</p>${heroBanner()}${selfRegistrationsPanel()}${summary()}<form class="sector-search"><label>Buscar ${key==='ministries'?'pessoa':key==='members'?'membro':'lançamento ou nota'}<input name="q" value="${e(query)}" maxlength="100" placeholder="Digite um nome ou descrição"></label><button>Buscar</button>${button('clear','Limpar','class="secondary"')}</form><p class="subtle">Listas exibem até 200 registros por seção; use a busca para localizar outros. Famílias e contas: até 500.</p>${key==='ministries'?'<p class="notice">Selecione pessoas já cadastradas no Lagoinha Members. O sistema valida conflitos de horário automaticamente nas escalas.</p>':''}${kinds.map(section).join('')}<dialog id="sector-dialog"><div class="sector-modal"></div></dialog></div>`;
  host.querySelector('.sector-search').onsubmit=event=>{event.preventDefault();query=new FormData(event.currentTarget).get('q');void refresh();};
  host.querySelectorAll('[data-sector-action]').forEach(b=>b.onclick=()=>void action(b));
 }

 async function refresh(message=''){
  const n=++generation;
  try{const result=await api('/'+key+'?q='+encodeURIComponent(query));if(n!==generation)return;data=result;paint(message);}catch(err){if(n===generation)host.innerHTML=`<div class="panel"><p role="alert">${e(err.message)}</p>${button('retry','Tentar novamente')}</div>`;host.querySelector('[data-sector-action="retry"]')?.addEventListener('click',()=>void refresh());}
 }

 async function mount(module){key=module.id;host=document.getElementById('sector-content');query='';ministryFilter='';if(host)await refresh();}

 function field(name,label,value='',type='text',required=false,opts=null,allowFutureDate=false){
  const attrs=`name="${name}" ${required?'required':''}`;
  const maxDate=(type==='date'&&!allowFutureDate)?`max="${today()}"`:'';
  return `<label>${label}${opts?`<select ${attrs}>${opts.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value??'')?'selected':''}>${e(t)}</option>`).join('')}</select>`:`<input ${attrs} type="${type}" value="${e(value)}" ${maxDate} maxlength="${name==='pastoral_notes'?600:name==='description'||name==='address'||name==='notes'||name==='resource_url'?250:name==='email'?200:160}" ${['amount','opening_value','budget_value','tithes','offerings_cash','offerings_pix','offerings_card'].includes(name)?'inputmode="decimal"':''}>`}</label>`;
 }

 const opt=(rows,currentId,currentLabel)=>{const list=options(rows||[]);if(currentId&&!list.some(([v])=>v===currentId))list.push([currentId,currentLabel||'Vínculo atual']);return list;};

 function openMemberDocumentModal(r){
  const dialog=host.querySelector('dialog');
  const code=String(r.id||'').slice(0,8).toUpperCase();
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title"><h2>🪪 Documentos Oficiais · ${e(r.name)}</h2>${button('close','Fechar','class="secondary"')}</div>
   <div id="printable-member-doc" style="display:grid;gap:18px;margin:14px 0;">
    <article style="border:2px solid #18181b;border-radius:16px;padding:20px;background:#fff;color:#09090b;">
     <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #18181b;padding-bottom:12px;margin-bottom:14px;">
      <div><strong style="font-size:18px;letter-spacing:-0.02em;">IGREJA BATISTA DA LAGOINHA</strong><small style="display:block;color:#52525b;">CREDENCIAL OFICIAL DE MEMBRESIA · LAGOINHA MEMBERS</small></div>
      <span class="badge" style="background:#09090b;color:#fff;">ID #${e(code)}</span>
     </div>
     <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;">
      <div><small style="color:#71717a;display:block;">Nome Completo</small><strong>${e(r.name)}</strong></div>
      <div><small style="color:#71717a;display:block;">Estágio Eclesiástico</small><strong>${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</strong></div>
      <div><small style="color:#71717a;display:block;">Núcleo Familiar</small><strong>${e(r.family_name||'Individual')} (${e(r.relationship||'Titular')})</strong></div>
      <div><small style="color:#71717a;display:block;">Célula / GC</small><strong>${e(r.cell_name||'Não vinculado')}</strong></div>
      <div><small style="color:#71717a;display:block;">Data de Nascimento</small><strong>${date(r.birthday)}</strong></div>
      <div><small style="color:#71717a;display:block;">Membro Desde / Batismo</small><strong>${date(r.joined_on)} ${r.baptism_date?`· Batismo: ${date(r.baptism_date)}`:''}</strong></div>
     </div>
    </article>
    <article style="border:2px double #065f46;border-radius:16px;padding:22px;background:#f0fdf4;color:#064e3b;text-align:center;">
     <span class="badge" style="background:#065f46;color:#fff;margin-bottom:8px;">CERTIFICADO ECLESIÁSTICO DE BATISMO E COMUNHÃO</span>
     <h3 style="margin:6px 0;font-size:20px;">Certificamos que ${e(r.name)}</h3>
     <p style="font-size:13.5px;color:#047857;margin:6px auto;max-width:520px;">Confessou publicamente a fé em nosso Senhor Jesus Cristo e encontra-se integrado(a) à comunhão da Igreja Batista da Lagoinha.</p>
     <small style="display:block;margin-top:12px;color:#065f46;font-weight:700;">Data de Batismo: ${date(r.baptism_date||r.joined_on)} · Emitido em ${date(today())}</small>
    </article>
   </div>
   <div style="display:flex;gap:10px;justify-content:flex-end;">
    <button type="button" id="print-member-doc-btn">🖨️ Imprimir / Salvar PDF</button>
   </div>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#print-member-doc-btn').onclick=()=>window.print();
  dialog.showModal();
 }

 function openSelfRegModal(){
  const dialog=host.querySelector('dialog');
  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title"><h2>🔗 Ficha de Auto-Cadastro · Visitante ou Membro</h2>${button('close','Fechar','class="secondary"')}</div>
   <p class="subtle">Envie dados diretamente para a fila de aprovação da secretaria da igreja.</p>
   <form class="record-form" id="self-reg-form">
    ${field('name','Nome completo', '', 'text', true)}
    ${field('family_name','Sobrenome da Família (ex.: Família Silva)', '')}
    ${field('integration_stage','Como você se identifica hoje?','visitor','text',true,[['visitor','Visitante de 1ª ou 2ª vez'],['new_convert','Novo Convertido / Decisão'],['baptized','Já sou batizado(a)'],['active_member','Membro da Lagoinha atualizando dados']])}
    ${field('birthday','Data de nascimento','','date')}
    ${field('phone','WhatsApp / Telefone','','tel')}
    ${field('email','E-mail','','email')}
    ${field('marital_status','Estado Civil','','text',false,[['','Selecione...'],['Solteiro(a)','Solteiro(a)'],['Casado(a)','Casado(a)'],['Viúvo(a)','Viúvo(a)'],['Divorciado(a)','Divorciado(a)']])}
    ${field('profession','Profissão (opcional)','')}
    ${field('address','Endereço / Bairro (opcional)','')}
    <p class="error" role="alert"></p>
    <button type="submit">Enviar ficha para a secretaria</button>
   </form>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#self-reg-form').onsubmit=async ev=>{
   ev.preventDefault();
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{
    const body=Object.fromEntries(new FormData(f));
    if(!body.birthday)body.birthday=null;
    const res=await api('/members/self-register',{method:'POST',body});
    dialog.close();
    await refresh(res.message||'Auto-cadastro registrado.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{b.disabled=false;}
  };
  dialog.showModal();
 }

 async function form(kind,record){
  const r=record||{};let html='';
  if(kind==='cells'){
   html=field('name','Nome da Célula / GC',r.name,'text',true)
    +field('leader_name','Nome do(a) Líder',r.leader_name)
    +field('neighborhood','Bairro / Região',r.neighborhood)
    +field('meeting_day','Dia e Horário (ex.: Quarta às 20h)',r.meeting_day);
  }
  if(kind==='families'){
   html=field('name','Nome da família',r.name,'text',true)
    +field('cell_id','Célula / GC vinculado (opcional)',r.cell_id,'text',false,[['','Sem célula vinculada'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('neighborhood','Bairro / Região (opcional)',r.neighborhood)
    +field('joined_on','Entrada na igreja (opcional)',r.joined_on,'date');
  }
  if(kind==='people'){
   html=field('name','Nome completo',r.name,'text',true)
    +field('family_id','Família (opcional)',r.family_id,'text',false,[['','Sem família vinculada'],...opt(data.families,r.family_id,r.family_name)])
    +field('cell_id','Célula / GC (opcional)',r.cell_id,'text',false,[['','Sem célula vinculada'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('relationship','Parentesco (opcional)',r.relationship)
    +field('integration_stage','Estágio na Jornada Eclesiástica',r.integration_stage||'active_member','text',true,Object.entries(stageLabels))
    +field('birthday','Data de nascimento (opcional)',r.birthday,'date')
    +field('joined_on','Entrada na igreja (opcional)',r.joined_on,'date')
    +field('baptism_date','Data de batismo nas águas (opcional)',r.baptism_date,'date')
    +field('marital_status','Estado civil (opcional)',r.marital_status,'text',false,[['','Não informado'],['Solteiro(a)','Solteiro(a)'],['Casado(a)','Casado(a)'],['Viúvo(a)','Viúvo(a)'],['Divorciado(a)','Divorciado(a)']])
    +field('profession','Profissão (opcional)',r.profession)
    +field('phone','Telefone / WhatsApp (opcional)',r.phone,'tel')
    +field('email','E-mail (opcional)',r.email,'email')
    +field('origin_church','Igreja de origem (opcional)',r.origin_church)
    +field('address','Endereço residencial (opcional)',r.address)
    +field('pastoral_notes','Observações pastorais (opcional)',r.pastoral_notes);
  }
  if(kind==='assignments'){
   directory=await api('/ministries/people');
   html=`<div class="lookup"><label>Buscar pessoa cadastrada<input id="person-search" maxlength="100"></label>${button('lookup','Buscar pessoa','class="secondary"')}</div>`
    +field('person_id','Pessoa cadastrada no Members',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('position','Função no ministério',r.position||'Integrante','text',true)
    +field('is_leader','Nível de liderança',r.is_leader?'true':'false','text',true,[['false','Voluntário / Equipe'],['true','⭐ Líder / Coordenador de Ministério']])
    +field('training_status','Trilha de Capacitação',r.training_status||'certified','text',true,Object.entries(trainingLabels))
    +field('started_on','Data de início (opcional)',r.started_on,'date');
  }
  if(kind==='schedules'){
   directory=await api('/ministries/people');
   html=`<div class="lookup"><label>Buscar voluntário<input id="person-search" maxlength="100"></label>${button('lookup','Buscar pessoa','class="secondary"')}</div>`
    +field('title','Culto ou Evento (ex.: Culto de Celebração Domingo)',r.title||'Culto de Celebração','text',true)
    +field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('person_id','Voluntário escalado',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('role_notes','Função específica no culto (ex.: Vocal, Câmera 1, Recepção)',r.role_notes)
    +field('service_date','Data da escala',r.service_date||today(),'date',true,null,true)
    +field('service_time','Horário do culto',r.service_time||'18:00','text',true,[['09:00','09:00 (Manhã)'],['10:00','10:00 (Manhã)'],['17:00','17:00 (Tarde)'],['18:00','18:00 (Noite)'],['19:30','19:30 (Quarta/Quinta)'],['20:00','20:00 (Especial)']])
    +field('status','Confirmação do voluntário',r.status||'confirmed','text',true,Object.entries(scheduleStatusLabels));
  }
  if(kind==='resources'){
   html=field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('title','Título do material / música / checklist',r.title,'text',true)
    +field('category','Categoria',r.category||'roteiro','text',true,Object.entries(resourceCatLabels))
    +field('notes','Orientações, tom da música ou resumo do roteiro',r.notes)
    +field('resource_url','Link externo opcional (Cifra, YouTube, Drive)',r.resource_url,'url');
  }
  if(kind==='cost-centers'){
   html=field('name','Nome do Centro de Custo / Projeto',r.name,'text',true)
    +field('ministry','Ministério ou área vinculada (opcional)',r.ministry)
    +field('budget_value','Orçamento previsto em R$',r.budget_cents!==undefined?(r.budget_cents/100).toFixed(2):'0','text',true);
  }
  if(kind==='accounts'){
   html=field('name','Nome da conta / caixa',r.name,'text',true)
    +field('bank','Banco ou identificação (opcional)',r.bank)
    +field('opening_value','Saldo inicial em R$',r.opening_cents!==undefined?(r.opening_cents/100).toFixed(2):'0','text',true);
  }
  if(kind==='entries'){
   html=field('account_id','Conta / Caixa',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('cost_center_id','Centro de Custo (opcional)',r.cost_center_id,'text',false,[['','Sem centro de custo'],...opt(data.cost_centers,r.cost_center_id,r.cost_center_name)])
    +field('direction','Tipo',r.direction||'income','text',true,[['income','Entrada / Receita'],['expense','Saída / Despesa']])
    +field('payment_status','Situação do lançamento',r.payment_status||'paid','text',true,[['paid','🟢 Liquidado (Pago / Recebido)'],['pending','⏳ Pendente (Conta a Pagar / Receber)']])
    +field('payment_method','Meio de pagamento',r.payment_method||'pix','text',true,Object.entries(paymentMethodLabels))
    +field('description','Descrição',r.description,'text',true)
    +field('occurred_on','Data de competência / pagamento',r.occurred_on||today(),'date',true)
    +field('due_date','Data de vencimento (opcional para pendentes)',r.due_date,'date',false,null,true)
    +field('amount','Valor em R$',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)
    +field('category','Categoria (ex.: Dízimo, Oferta, Energia, Som)',r.category);
  }
  if(kind==='closings'){
   html=field('service_name','Identificação do Culto (ex.: Culto Domingo 18h)',r.service_name,'text',true)
    +field('service_date','Data do culto',r.service_date||today(),'date',true)
    +field('account_id','Conta / Caixa de destino',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('tithes','Total de Dízimos em R$',r.tithes_cents!==undefined?(r.tithes_cents/100).toFixed(2):'0','text',true)
    +field('offerings_cash','Ofertas em Espécie em R$',r.offerings_cash_cents!==undefined?(r.offerings_cash_cents/100).toFixed(2):'0','text',true)
    +field('offerings_pix','Ofertas via PIX em R$',r.offerings_pix_cents!==undefined?(r.offerings_pix_cents/100).toFixed(2):'0','text',true)
    +field('offerings_card','Ofertas em Cartão em R$',r.offerings_card_cents!==undefined?(r.offerings_card_cents/100).toFixed(2):'0','text',true)
    +field('counted_by','1º Conferente (Tesoureiro / Diácono)',r.counted_by,'text',true)
    +field('verified_by','2º Conferente (Testemunha / Dupla Conferência)',r.verified_by,'text',true)
    +field('notes','Observações do fechamento (opcional)',r.notes);
  }
  if(kind==='invoices'){
   html=field('number','Número da nota',r.number,'text',true)
    +field('supplier','Fornecedor / emitente',r.supplier,'text',true)
    +field('issued_on','Data de emissão',r.issued_on||today(),'date',true)
    +field('amount','Valor em R$',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)
    +field('entry_id','Lançamento vinculado (opcional)',r.entry_id,'text',false,[['','Sem vínculo'],...opt((data.entries||[]).map(x=>({...x,name:x.description})),r.entry_id)])
    +`<input name="file_id" type="hidden" value="${e(r.file_id)}"><label>Anexar nota (PDF, JPG, PNG ou WebP, até 10 MB)<input type="file" id="invoice-file" accept="application/pdf,image/jpeg,image/png,image/webp"></label><p id="invoice-status" role="status">${r.file_id?`<a href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">Ver anexo atual</a>`:'Sem anexo. O arquivo é opcional.'}</p>`;
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
   b.disabled=true;status.textContent='Enviando anexo…';
   try{const body=new FormData();body.append('file',file);const res=await api('/finance/files',{method:'POST',body,raw:true});dialog.querySelector('[name=file_id]').value=res.id;status.innerHTML=`<a href="${e(res.url)}" target="_blank" rel="noopener">Anexo enviado. Salve a nota para concluir.</a>`;}catch(err){status.textContent=err.message;}finally{b.disabled=false;event.target.value='';}
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
   if(b.dataset.sectorAction==='filter-ministry'){ministryFilter=ministryFilter===b.dataset.ministry?'':b.dataset.ministry;paint();return;}
   if(b.dataset.sectorAction==='clear'){query='';ministryFilter='';await refresh();return;}
   if(b.dataset.sectorAction==='self-reg-modal'){openSelfRegModal();return;}
   if(b.dataset.sectorAction==='member-doc'){
    const person=(data.people||[]).find(x=>x.id===b.dataset.id);
    if(person)openMemberDocumentModal(person);
    return;
   }
   if(b.dataset.sectorAction==='approve-self-reg'){
    b.disabled=true;
    await api('/members/self-registrations/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Auto-cadastro aprovado e integrado à membresia!');
    return;
   }
   if(b.dataset.sectorAction==='reject-self-reg'){
    if(!confirm('Recusar esta solicitação de auto-cadastro?'))return;
    b.disabled=true;
    await api('/members/self-registrations/'+b.dataset.id,{method:'DELETE'});
    await refresh('Solicitação recusada.');
    return;
   }
   if(b.dataset.sectorAction==='settle'){
    b.disabled=true;
    await api('/finance/entries/'+b.dataset.id+'/settle',{method:'POST'});
    await refresh('Lançamento baixado como liquidado!');
    return;
   }
   if(b.dataset.sectorAction==='new')await form(kind);
   if(b.dataset.sectorAction==='edit')await form(kind,r);
   if(b.dataset.sectorAction==='archive'){
    if(!confirm(kind==='people'?'Arquivar este membro também encerrará seus vínculos ministeriais. Continuar?':'Arquivar este registro? Ele será preservado no histórico.'))return;
    b.disabled=true;await api('/'+key+'/'+kind+'/'+r.id+'?version='+r.version,{method:'DELETE'});await refresh('Registro arquivado.');
   }
   if(b.dataset.sectorAction==='history'){
    const changes=await api('/finance/history/'+b.dataset.id);const dialog=host.querySelector('dialog');dialog.querySelector('.sector-modal').innerHTML=`<h2>Histórico do registro</h2>${changes.map(c=>`<article><strong>${e(c.action)} · ${e(new Date(c.created_at).toLocaleString('pt-BR'))}</strong><pre>${e(c.after_json||c.before_json||'')}</pre></article>`).join('')||'<p>Sem alterações registradas.</p>'}${button('close','Fechar','class="secondary"')}`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
   }
  }catch(err){const status=host.querySelector('[role=status]');if(status)status.textContent=err.message;b.disabled=false;}
 }
 return {mount};
}
