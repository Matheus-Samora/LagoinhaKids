import {ministryEmblem,MINISTRY_META} from './emblems.js';

export function createSectors({api,e,identity,openQrModal}){
 let key='',data={},directory=[],query='',ministryFilter='',generation=0,host;
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
  cells:'Células / GCs Oficiais',
  families:'Famílias',
  people:'Membros',
  schedules:'Escalas de Cultos e Eventos',
  assignments:'Vínculos Ministeriais & Funções',
  resources:'Repertórios, Roteiros e Materiais',
  closings:'Borderôs de Culto (Dupla Conferência)',
  'cost-centers':'Centros de Custo e Orçamentos',
  accounts:'Contas e Bancos Vinculados',
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
   return `<section class="welcome theme-members"><div><span class="pill">👥 MEMBRESIA CRIPTOGRAFADA &amp; 8 GCs OFICIAIS</span><h2>Cada pessoa tem nome,<br>história e <em>família.</em></h2><p>Acompanhe a jornada de integração, gerencie os 8 GCs oficiais com banners e endereços reais e receba inscrições vindas da Área de Membros.</p><div class="welcome-actions">${edit()?`${button('new','+ Cadastrar membro','data-kind="people"')}${button('new','+ Nova família','class="ghost" data-kind="families"')}${button('new','+ Novo GC / Célula','class="ghost" data-kind="cells"')}`:''}${button('self-reg-modal','🔗 Ficha de Auto-Cadastro','class="ghost"')}${button('open-qr','📱 QR Code do App','class="ghost"')}</div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✳</span><div class="sun">☀</div><div class="hill"></div><div class="little-star">✦</div></div></section>`;
  }
  if(key==='ministries'){
   return `<section class="welcome theme-ministries"><div><span class="pill">✦ 17 MINISTÉRIOS OFICIAIS &amp; ESCALA DE LOUVOR</span><h2>Dons ativados.<br>Pessoas servindo com <em>propósito.</em></h2><p>Gerencie os 17 ministérios (Link e Future separados, Champions, Music), monte a escala do Louvor por instrumento/função e aprove novos candidatos.</p>${edit()?`<div class="welcome-actions">${button('worship-scale-modal','🎹 Montar Escala do Louvor (Banda)')}${button('new','+ Cadastrar membro no Ministério','class="ghost" data-kind="assignments"')}${button('new','+ Agendar escala geral','class="ghost" data-kind="schedules"')}${button('new','+ Publicar repertório / roteiro','class="ghost" data-kind="resources"')}</div>`:''}</div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">✦</span><div class="sun">◎</div><div class="hill"></div><div class="little-star">✳</div></div></section>`;
  }
  return `<section class="welcome theme-finance"><div><span class="pill">💼 MOTOR FINANCEIRO, PREVISÕES &amp; RELATÓRIOS</span><h2>Inteligência preditiva.<br>Integridade em <em>cada registro.</em></h2><p>Motor de pré-processamento bancário, previsão de fluxo 30/60/90 dias, borderôs com dupla conferência e gerador de relatórios Excel, CSV, PDF e JSON.</p><div class="welcome-actions">${edit()?`${button('new','+ Lançar entrada / saída','data-kind="entries"')}${button('new','+ Borderô de culto','class="ghost" data-kind="closings"')}${button('new','+ Conta / Banco','class="ghost" data-kind="accounts"')}${button('new','+ Centro de custo','class="ghost" data-kind="cost-centers"')}`:''}${button('finance-report-modal','📊 Gerar Relatório (Excel / PDF / CSV)','class="ghost"')}</div></div><div class="welcome-art" aria-hidden="true"><div class="art-arch"></div><span class="flower">◈</span><div class="sun">◐</div><div class="hill"></div><div class="little-star">✦</div></div></section>`;
 }

 function selfRegistrationsPanel(){
  if(key!=='members')return '';
  const regs=data.self_registrations||[];
  const gcApps=data.gc_applications||[];
  if(!regs.length&&!gcApps.length)return '';
  return `
   ${gcApps.length?`<section class="panel sector-section" style="border-color:#0f766e;background:#f0fdfa;">
    <div class="section-title">
     <div>
      <h2 style="color:#115e59;">🏠 Solicitações de Entrada em GCs via Banner (${gcApps.length})</h2>
      <p style="margin:4px 0 0;color:#0f766e;">Membros que escolheram um GC pelos banners na Área de Membros. Entre em contato e aprove a integração!</p>
     </div>
    </div>
    <div class="sector-table">
     <table>
      <thead><tr><th>Candidato / Contato</th><th>GC Escolhido</th><th>Observações</th><th>Ações do Líder</th></tr></thead>
      <tbody>
       ${gcApps.map(a=>{
        const wUrl=whatsAppUrl(a.phone,`Olá, ${a.member_name.split(' ')[0]}! Paz! Recebemos sua inscrição pelo banner do ${a.target_name} na Lagoinha! Vamos conversar para receber você no próximo encontro?`);
        return `<tr>
         <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem telefone')}</small>${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;margin-top:4px;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Chamar no WhatsApp</a>`:''}</td>
         <td><span class="badge" style="background:#0f766e;color:#fff;">🏠 ${e(a.target_name)}</span><small>${e(a.role_desired||'Participante')}</small></td>
         <td><small>${e(a.notes||'Inscrição via banner oficial do GC')}</small></td>
         <td class="row-buttons">${edit()?`${button('approve-gc-app','✓ Aprovar no GC',`data-id="${e(a.id)}"`)}${button('reject-gc-app','Recusar',`class="secondary" data-id="${e(a.id)}"`)}`:'<span>Aguardando líder</span>'}</td>
        </tr>`;
       }).join('')}
      </tbody>
     </table>
    </div>
   </section>`:''}
   ${regs.length?`<section class="panel sector-section" style="border-color:#059669;background:#ecfdf5;"><div class="section-title"><div><h2 style="color:#065f46;">📥 Fila de Aprovação — Auto-Cadastros Recebidos (${regs.length})</h2><p style="margin:4px 0 0;color:#047857;">Visitantes e membros que preencheram o formulário online aguardando validação da secretaria.</p></div></div><div class="sector-table"><table><thead><tr><th>Nome / Contato</th><th>Família / Endereço</th><th>Jornada / Profissão</th><th>Ações</th></tr></thead><tbody>${regs.map(r=>`<tr><td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'Sem contato')}</small></td><td>${e(r.family_name||'Sem família informada')}<small>${e(r.address||'')}</small></td><td><span class="badge">${e(stageLabels[r.integration_stage]||r.integration_stage)}</span><small>${e(r.marital_status||'')} ${r.profession?'· '+e(r.profession):''}</small></td><td class="row-buttons">${edit()?`${button('approve-self-reg','✓ Aprovar e integrar',`data-id="${e(r.id)}"`)}${button('reject-self-reg','Recusar',`class="secondary" data-id="${e(r.id)}"`)}`:'<span>Aguardando secretaria</span>'}</td></tr>`).join('')}</tbody></table></div></section>`:''}`;
 }

 function ministryApplicationsPanel(){
  if(key!=='ministries')return '';
  const apps=(data.applications||[]).filter(a=>!ministryFilter||a.target_name===ministryFilter);
  if(!apps.length)return '';
  return `<section class="panel sector-section" style="border-color:#4338ca;background:#eef2ff;">
   <div class="section-title">
    <div>
     <h2 style="color:#312e81;">🙌 Candidaturas Recebidas para os Ministérios (${apps.length})</h2>
     <p style="margin:4px 0 0;color:#4338ca;">Membros que se candidataram na Área de Membros. Entre em contato para preparar o candidato e aprove sua entrada oficial!</p>
    </div>
   </div>
   <div class="sector-table">
    <table>
     <thead><tr><th>Candidato &amp; WhatsApp</th><th>Ministério &amp; Função Desejada</th><th>Experiência / Notas</th><th>Aprovação do Responsável</th></tr></thead>
     <tbody>
      ${apps.map(a=>{
       const wUrl=whatsAppUrl(a.phone,`Olá, ${a.member_name.split(' ')[0]}! Paz! Recebemos sua candidatura para servir no Ministério ${a.target_name} (${a.role_desired||'Voluntário'}). Vamos conversar sobre a preparação?`);
       return `<tr>
        <td><strong>${e(a.member_name)}</strong><small>${e(a.phone||a.email||'Sem contato')}</small>${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;margin-top:4px;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Contatar Candidato</a>`:''}</td>
        <td><span class="badge" style="background:#4338ca;color:#fff;">✦ ${e(a.target_name)}</span><small>Função: <strong>${e(a.role_desired||'Voluntário')}</strong></small></td>
        <td><small>${e(a.notes||'Disponível para entrevista e treinamento')}</small></td>
        <td class="row-buttons">${edit()?`${button('approve-min-app','✓ Aprovar e Integrar',`data-id="${e(a.id)}"`)}${button('reject-min-app','Recusar',`class="secondary" data-id="${e(a.id)}"`)}`:'<span>Aguardando líder</span>'}</td>
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
     <span class="eyebrow" style="color:#4338ca;">MINISTÉRIO DE LOUVOR · LAGOINHA MUSIC</span>
     <h2>🎹 Escala do Ministério de Louvor por Função e Instrumento</h2>
     <p style="margin:4px 0 0;color:#52525b;">Cadastre cada integrante com sua função (Tecladista, Baterista, Violonista, Guitarrista, Baixista, Vocal, Ministro) e monte a banda completa de cada culto.</p>
    </div>
    ${edit()?`<div style="display:flex;gap:8px;flex-wrap:wrap;">
     ${button('worship-member-modal','+ Cadastrar Membro no Louvor (por Função)','class="secondary"')}
     ${button('worship-scale-modal','🎹 + Criar Escala Completa do Louvor')}
    </div>`:''}
   </div>

   <div class="worship-roles-grid">
    ${WORSHIP_ROLES.map(roleName=>{
     const inRole=musicMembers.filter(m=>(m.position||'').toLowerCase().includes(roleName.split(' ')[0].toLowerCase()));
     return `<div class="worship-role-chip">
      <div style="display:flex;justify-content:space-between;align-items:center;">
       <strong>${e(roleName)}</strong>
       <span class="badge">${inRole.length}</span>
      </div>
      <small>${inRole.length?inRole.map(m=>e(m.person_name)).join(', '):'Nenhum cadastrado nesta função'}</small>
     </div>`;
    }).join('')}
   </div>

   ${services.length?`
    <h3 style="margin:18px 0 10px;font-size:15px;">📅 Próximas Bandas Escaladas (${services.length} culto${services.length===1?'':'s'})</h3>
    <div class="worship-services-grid">
     ${services.map(srv=>`<article class="worship-service-card">
      <div class="worship-service-head">
       <div>
        <strong>${e(srv.title)}</strong>
        <small>📅 ${date(srv.date)} às ${e(srv.time)}</small>
       </div>
       <span class="badge" style="background:#4338ca;color:#fff;">${srv.members.length} escalado(s)</span>
      </div>
      <div class="worship-lineup-list">
       ${srv.members.map(m=>`<div class="worship-lineup-item">
        <span class="worship-inst-tag">${e(m.role_notes||'Integrante')}</span>
        <strong>${e(m.person_name)}</strong>
       </div>`).join('')}
      </div>
     </article>`).join('')}
    </div>
   `:`<p class="subtle" style="margin-top:14px;">Nenhuma escala do Ministério de Louvor montada ainda. Toque em <strong>Criar Escala Completa do Louvor</strong> para escalar Tecladista, Baterista, Violonista, Vocais e toda a equipe!</p>`}
  </section>`;
 }

 function gcCardsShowcase(){
  if(key!=='members')return '';
  const cells=data.cells||[];
  if(!cells.length)return '';
  return `<section class="panel sector-section">
   <div class="section-title">
    <div>
     <span class="eyebrow" style="color:#0f766e;">GRUPOS DE CRESCIMENTO OFICIAIS · ARTES E ENDEREÇOS</span>
     <h2>🏠 Banners Oficiais dos GCs Ativos (${cells.length})</h2>
     <p style="margin:4px 0 0;">Estes banners são exibidos no App de Membros para inscrição direta nos GCs.</p>
    </div>
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
      <p class="gc-banner-address">📍 ${e(gc.address||gc.neighborhood||'Endereço a definir')}</p>
      <div class="gc-banner-meta">
       <span>👤 ${e(gc.leader_name||'Liderança GC')}</span>
       <span>👥 ${gc.member_count||0} membro(s) · ${gc.family_count||0} fam.</span>
      </div>
      ${edit()?`<div style="display:flex;gap:8px;margin-top:6px;">${button('edit','✏️ Editar GC / Endereço',`class="secondary" data-kind="cells" data-id="${e(gc.id)}" style="width:100%;min-height:38px;font-size:12.5px;"`)}</div>`:''}
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
    <div>
     <span class="eyebrow" style="color:#15803d;">MOTOR DE INTELIGÊNCIA FINANCEIRA · PREVISÕES &amp; PRÉ-PROCESSAMENTO</span>
     <h2>📈 Previsão de Fluxo de Caixa (30 / 60 / 90 Dias) &amp; Consolidação Bancária</h2>
     <p style="margin:4px 0 0;color:#166534;">Projeções automáticas pré-processadas com base no histórico mensal, contas a pagar/receber agendadas e saldos dos bancos vinculados.</p>
    </div>
    ${button('finance-report-modal','📊 Exportar Relatório Personalizado (Excel / PDF / CSV)')}
   </div>

   <div class="stats metrics" style="margin:14px 0;">
    ${statCard('Saldo Atual Consolidado',cash(eng.current_balance_cents),`${(eng.by_bank||[]).length} instituição(ões) vinculada(s)`,'🏦')}
    ${statCard('Previsão em 30 Dias',cash(eng.projected_30d_cents),`Média rec.: ${cash(eng.monthly_avg_income_cents)}/mês`,'📅')}
    ${statCard('Previsão em 60 Dias',cash(eng.projected_60d_cents),`Média desp.: ${cash(eng.monthly_avg_expense_cents)}/mês`,'📊')}
    ${statCard('Previsão em 90 Dias',cash(eng.projected_90d_cents),`Tendência: ${eng.trend_pct>=0?'+':''}${eng.trend_pct}%`,'🚀')}
   </div>

   ${eng.overdue_expense_count>0?`<p class="notice" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;margin-bottom:14px;">⚠️ <strong>Alerta de Pré-Processamento:</strong> Existem <strong>${eng.overdue_expense_count} conta(s) a pagar vencida(s)</strong> totalizando <strong>${cash(eng.overdue_expense_cents)}</strong>. Verifique os lançamentos pendentes abaixo.</p>`:''}

   <div class="sector-insights-grid" style="margin-bottom:0;">
    <div class="insight-card">
     <div class="insight-head"><h3>🏦 Pré-Processamento por Bancos Vinculados</h3><span class="badge">${(eng.by_bank||[]).length} banco(s)</span></div>
     <div class="insight-list">
      ${(eng.by_bank||[]).map(b=>`<div class="insight-item">
       <div><strong>${e(b.bank)}</strong><small>${b.accounts_count} conta(s) · Entradas: ${cash(b.income_cents)} · Saídas: ${cash(b.expense_cents)}</small></div>
       <strong class="money ${b.balance_cents>=0?'income':'expense'}">${cash(b.balance_cents)}</strong>
      </div>`).join('')||'<p class="subtle">Cadastre contas bancárias para visualizar a consolidação por banco.</p>'}
     </div>
    </div>
    <div class="insight-card">
     <div class="insight-head"><h3>💳 Pré-Processamento por Categoria &amp; Meio</h3><span class="badge">Classificação Automática</span></div>
     <div class="insight-list">
      ${(eng.by_category||[]).slice(0,4).map(c=>`<div class="insight-item">
       <div><strong>🏷️ ${e(c.category)}</strong><small>Entradas: ${cash(c.income_cents)} · Saídas: ${cash(c.expense_cents)}</small></div>
       <strong class="money">${cash(c.income_cents-c.expense_cents)}</strong>
      </div>`).join('')||'<p class="subtle">Os lançamentos serão agrupados automaticamente por categoria e meio de pagamento.</p>'}
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
   const linkedPeople=people.filter(p=>p.family_id).length;
   const avgFamily=data.total_families?((data.total_people||0)/data.total_families).toFixed(1):'0.0';
   const visitors=people.filter(p=>['visitor','new_convert'].includes(p.integration_stage));
   const stageCounts=Object.keys(stageLabels).map(k=>({key:k,label:stageLabels[k],count:people.filter(p=>(p.integration_stage||'active_member')===k).length}));

   return `<div class="stats metrics">
    ${statCard('Membros cadastrados',data.total_people||0,`${linkedPeople} com família vinculada`,'👤')}
    ${statCard('Famílias cadastradas',data.total_families||0,`Média de ${avgFamily} integrante(s) por família`,'🏠')}
    ${statCard('GCs Oficiais ativos',data.total_cells||cells.length,'Ide, Emanuel, Fé, Betel, Rocket, Legacy, Propósito e Aviva','🌱')}
    ${statCard('Aniversariantes do mês',birthdaysMonth.length,'Celebrando a vida neste mês','🎂')}
   </div>
   ${gcCardsShowcase()}
   <div class="sector-insights-grid">
    <section class="insight-card">
     <div class="insight-head"><h3>🎂 Aniversariantes &amp; Acolhimento Pastoral (WhatsApp 1-Clique)</h3><span class="badge">Cuidado Pastoral</span></div>
     <div class="insight-list">
      ${birthdaysMonth.slice(0,3).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! 🎉 A família Lagoinha celebra a sua vida neste mês! Que Deus abençoe ricamente seu novo ciclo!`);
       return `<div class="insight-item"><div><strong>🎂 ${e(p.name)}</strong><small>${e(p.family_name||'Sem família')} · Nascimento: ${date(p.birthday)}</small></div><div style="display:flex;gap:6px;align-items:center;">${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;border-color:#86efac;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Parabéns</a>`:'<span class="badge">Mês atual</span>'}</div></div>`;
      }).join('')}
      ${visitors.slice(0,2).map(p=>{
       const wUrl=whatsAppUrl(p.phone,`Olá, ${p.name.split(' ')[0]}! Que alegria receber você na Lagoinha! Como podemos caminhar junto com você e sua família?`);
       return `<div class="insight-item"><div><strong>👋 ${e(p.name)}</strong><small>${e(stageLabels[p.integration_stage]||'Visitante')} · Entrada: ${date(p.joined_on)}</small></div><div>${wUrl?`<a class="badge" style="background:#dcfce7;color:#166534;border-color:#86efac;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 Acolher</a>`:`<span class="badge">${e(stageLabels[p.integration_stage]||'Visitante')}</span>`}</div></div>`;
      }).join('')}
      ${!birthdaysMonth.length&&!visitors.length?'<p class="subtle" style="margin:0;">Cadastre membros reais com data de nascimento e telefone para acionar mensagens pastorais com 1 clique.</p>':''}
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
    ${statCard('Candidaturas / Líderes',`${(data.applications||[]).length} / ${leadersCount}`,'Novos candidatos e líderes ativos','⭐')}
   </div>
   ${ministryApplicationsPanel()}
   <div class="section-title" style="margin-top:8px;">
    <div>
     <h2>Painel Interativo dos 17 Ministérios Oficiais</h2>
     <span class="subtle">Ministério <strong>Link</strong> e Ministério <strong>Future</strong> operam de forma independente · Arte oficial do <strong>Champions</strong> integrada</span>
    </div>
    ${ministryFilter?button('filter-ministry','Mostrar todos os 17 ministérios','data-ministry="" class="secondary"'):''}
   </div>
   <div class="ministry-grid-cards ministry-counts">
    ${(data.catalog||[]).map(m=>{
     const total=data.counts.find(c=>c.ministry===m)?.total||0;
     const activeClass=ministryFilter===m?'active':'';
     const meta=MINISTRY_META[m]||{tagline:'Ministério Oficial'};
     return `<button type="button" class="ministry-card-btn ${activeClass}" data-sector-action="filter-ministry" data-ministry="${e(m)}">
      <div class="ministry-card-top">
       ${ministryEmblem(m)}
       <span class="ministry-count-pill badge">${total} ativo(s)</span>
      </div>
      <strong class="ministry-card-name">${e(m)}</strong>
      <small style="font-size:11px;opacity:0.75;text-align:left;">${e(meta.tagline)}</small>
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
  const invoicesWithFile=(data.invoices||[]).filter(i=>i.file_id).length;
  const flowTotal=incomeCents+expenseCents;
  const incomePct=flowTotal>0?Math.round((incomeCents/flowTotal)*100):50;
  const netFlow=incomeCents-expenseCents;

  return `${financialEnginePanel()}
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
     <div class="insight-head"><h3>🎯 Centros de Custo &amp; Contas</h3><span class="badge">${(data.cost_centers||[]).length} centro(s) · ${(data.accounts||[]).length} conta(s)</span></div>
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
  if(kind==='cells')return `<td><strong>${e(r.name)}</strong><small>📍 ${e(r.address||r.neighborhood||'Endereço não informado')}</small></td><td>${e(r.leader_name||'Liderança GC')}<small>${e(r.meeting_day||'')}</small></td><td><span class="badge">${r.member_count||0} membro(s)</span> <span class="badge">${r.family_count||0} família(s)</span></td>`;
  if(kind==='families')return `<td><strong>${e(r.name)}</strong><small>${e(r.neighborhood||'')}</small></td><td><span class="badge">${r.member_count} integrante(s)</span>${r.cell_name?`<small>GC: ${e(r.cell_name)}</small>`:''}</td><td>${date(r.joined_on)}</td>`;
  if(kind==='people'){
   const wUrl=whatsAppUrl(r.phone,`Olá, ${r.name.split(' ')[0]}! Paz seja contigo!`);
   return `<td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'')}${r.profession?` · ${e(r.profession)}`:''}</small>${wUrl?`<a class="badge" style="margin-top:4px;font-size:11px;" href="${e(wUrl)}" target="_blank" rel="noopener">💬 WhatsApp</a>`:''}</td><td>${e(r.family_name)}<small>${e(r.relationship||'Membro')}${r.cell_name?` · GC: ${e(r.cell_name)}`:''}</small><span class="badge" style="margin-top:4px;">${e(stageLabels[r.integration_stage||'active_member']||r.integration_stage)}</span></td><td>${date(r.joined_on)}<small>Nasc.: ${date(r.birthday)}${r.baptism_date?` · Batismo: ${date(r.baptism_date)}`:''}</small></td>`;
  }
  if(kind==='schedules')return `<td><strong>${e(r.title)}</strong><small>📅 ${date(r.service_date)} às ${e(r.service_time||'18:00')}</small></td><td><span class="badge">✦ ${e(r.ministry)}</span><small>👤 ${e(r.person_name)} ${r.role_notes?`· <strong>${e(r.role_notes)}</strong>`:''}</small></td><td><span class="badge">${e(scheduleStatusLabels[r.status]||r.status)}</span></td>`;
  if(kind==='assignments')return `<td><strong>${e(r.person_name)}</strong>${r.is_leader?' <span class="badge">⭐ Líder</span>':''}</td><td><span class="badge">✦ ${e(r.ministry)}</span><small>Função: <strong>${e(r.position)}</strong></small></td><td>${date(r.started_on)}<small>${e(trainingLabels[r.training_status||'certified']||r.training_status)}</small></td>`;
  if(kind==='resources')return `<td><strong>${e(r.title)}</strong><small>${e(resourceCatLabels[r.category]||r.category)}</small></td><td><span class="badge">✦ ${e(r.ministry)}</span><small>${e(r.notes||'')}</small></td><td>${r.resource_url?`<a class="badge" href="${e(r.resource_url)}" target="_blank" rel="noopener">🔗 Abrir material</a>`:'<span class="subtle">Texto interno</span>'}</td>`;
  if(kind==='closings')return `<td><strong>${e(r.service_name)}</strong><small>Data: ${date(r.service_date)} · Conta: ${e(r.account_name)}</small></td><td><small>Dízimos: ${cash(r.tithes_cents)} · Espécie: ${cash(r.offerings_cash_cents)}<br>PIX: ${cash(r.offerings_pix_cents)} · Cartão: ${cash(r.offerings_card_cents)}</small></td><td><strong class="money income">${cash(r.total_cents)}</strong><small>✍️ ${e(r.counted_by)} &amp; ${e(r.verified_by)}</small></td>`;
  if(kind==='cost-centers')return `<td><strong>${e(r.name)}</strong><small>${e(r.ministry||'Geral')}</small></td><td>${cash(r.budget_cents)}</td><td><span class="money expense">Saídas: ${cash(r.spent_cents)}</span><small>Entradas: ${cash(r.income_cents)}</small></td>`;
  if(kind==='accounts')return `<td><strong>${e(r.name)}</strong><small>${e(r.bank||'Caixa Interno')}</small></td><td>${cash(r.opening_cents)}</td><td><strong>${cash(r.balance_cents)}</strong></td>`;
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
   cells:['GC / Endereço','Líder e Reunião','Comunhão'],
   families:['Família','Integrantes / GC','Entrada na igreja'],
   people:['Membro','Família e Jornada','Datas'],
   schedules:['Culto / Evento','Ministério e Função','Status'],
   assignments:['Pessoa','Ministério / Função','Início e Trilha'],
   resources:['Material / Repertório','Ministério e Notas','Acesso'],
   closings:['Culto / Conta','Detalhamento','Total e Conferência'],
   'cost-centers':['Centro de Custo','Orçamento','Execução'],
   accounts:['Conta / Banco','Saldo inicial','Saldo atual'],
   entries:['Lançamento','Data / Status','Valor'],
   invoices:['Nota / Fornecedor','Emissão','Valor / Anexo']
  }[kind];
  const filterSuffix=['assignments','schedules','resources'].includes(kind)&&ministryFilter?` · ${e(ministryFilter)}`:'';
  return `<section class="panel sector-section"><div class="section-title"><h2>${labels[kind]}${filterSuffix}</h2>${edit()?button('new','Adicionar',`data-kind="${kind}"`):''}</div>${rows.length?`<div class="sector-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${row(kind,r)}<td class="row-buttons">${kind==='people'?button('member-doc','🪪 Carteirinha / Batismo',`class="secondary" data-id="${e(r.id)}"`):''}${kind==='entries'&&r.payment_status==='pending'&&edit()?button('settle','✓ Dar baixa',`data-id="${e(r.id)}"`):''}${edit()?button('edit','Editar',`data-kind="${kind}" data-id="${e(r.id)}"`):'<span>Consulta</span>'}${canArchive()?button('archive','Arquivar',`data-kind="${kind}" data-id="${e(r.id)}"`):''}${key==='finance'&&canArchive()&&['accounts','entries','invoices'].includes(kind)?button('history','Histórico',`data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty"><h3>Nenhum registro nesta lista</h3><p>${edit()?'Toque em Adicionar para realizar um cadastro real ou ajuste a busca.':'A equipe ainda não cadastrou informações nesta lista.'}</p></div>`}</section>`;
 }

 function paint(message=''){
  const kinds=key==='members'?['people','families','cells']:key==='ministries'?['schedules','assignments','resources']:['entries','closings','accounts','cost-centers','invoices'];
  const roleBadgeLabel=role()==='viewer'?'Somente consulta':role()==='pastor'?'👑 Acesso Pastoral Pleno (Alteração liberada)':role()==='admin'?'🛡️ Administração do Setor':'✏️ Cadastro e Edição';
  host.innerHTML=`<div class="page-enter"><div class="sector-toolbar"><div style="display:flex;gap:8px;flex-wrap:wrap;"><a class="button secondary" href="/membro">← Área do Membro</a>${button('open-qr','📱 QR Code do App','class="secondary"')}</div><span class="badge">${roleBadgeLabel} · 🔒 Dados Criptografados</span></div><p role="status" class="status">${e(message)}</p>${heroBanner()}${selfRegistrationsPanel()}${summary()}<form class="sector-search"><label>Buscar ${key==='ministries'?'pessoa ou escala':key==='members'?'membro':'lançamento ou nota'}<input name="q" value="${e(query)}" maxlength="100" placeholder="Digite um nome ou descrição"></label><button>Buscar</button>${button('clear','Limpar','class="secondary"')}</form>${kinds.map(section).join('')}<dialog id="sector-dialog"><div class="sector-modal"></div></dialog></div>`;
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
  return `<label>${label}${opts?`<select ${attrs}>${opts.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value??'')?'selected':''}>${e(t)}</option>`).join('')}</select>`:`<input ${attrs} type="${type}" value="${e(value)}" ${maxDate} maxlength="${name==='pastoral_notes'?600:name==='description'||name==='address'||name==='notes'||name==='resource_url'||name==='banner_url'?250:name==='email'?200:160}" ${['amount','opening_value','budget_value','tithes','offerings_cash','offerings_pix','offerings_card'].includes(name)?'inputmode="decimal"':''}>`}</label>`;
 }

 const opt=(rows,currentId,currentLabel)=>{const list=options(rows||[]);if(currentId&&!list.some(([v])=>v===currentId))list.push([currentId,currentLabel||'Vínculo atual']);return list;};

 async function openWorshipScaleModal(){
  directory=await api('/ministries/people');
  const musicAssignments=(data.assignments||[]).filter(a=>a.ministry==='Music');
  const dialog=host.querySelector('dialog');

  const slotSelect=(slotRole)=>{
   const matching=musicAssignments.filter(a=>(a.position||'').toLowerCase().includes(slotRole.split(' ')[0].toLowerCase()));
   const others=musicAssignments.filter(a=>!matching.includes(a));
   const allPeople=directory.filter(p=>!musicAssignments.some(a=>a.person_id===p.id));
   return `<label class="worship-slot-field">
    <span>🎵 ${e(slotRole)}</span>
    <select name="slot_${e(slotRole)}">
     <option value="">— Não escalar neste culto —</option>
     ${matching.length?`<optgroup label="Cadastrados como ${e(slotRole)}">${matching.map(m=>`<option value="${e(m.person_id)}">★ ${e(m.person_name)} (${e(m.position)})</option>`).join('')}</optgroup>`:''}
     ${others.length?`<optgroup label="Outros integrantes do Louvor">${others.map(m=>`<option value="${e(m.person_id)}">${e(m.person_name)} (${e(m.position)})</option>`).join('')}</optgroup>`:''}
     ${allPeople.length?`<optgroup label="Membros Gerais (Cadastrará no Louvor automaticamente)">${allPeople.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('')}</optgroup>`:''}
    </select>
   </label>`;
  };

  dialog.querySelector('.sector-modal').innerHTML=`
   <div class="section-title">
    <h2>🎹 Montar Escala do Ministério de Louvor (Por Instrumento / Função)</h2>
    ${button('close','Fechar','class="secondary"')}
   </div>
   <p class="subtle" style="margin-top:0;">Selecione cada músico ou vocalista para sua respectiva função no culto. O sistema verifica conflitos de horário e já vincula cada membro à sua função musical.</p>
   <form class="record-form" id="worship-scale-form">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">
     ${field('title','Culto / Celebração','Culto de Celebração','text',true)}
     ${field('service_date','Data do Culto',today(),'date',true,null,true)}
     ${field('service_time','Horário','18:00','text',true,[['09:00','09:00 (Manhã)'],['10:00','10:00 (Manhã)'],['17:00','17:00 (Tarde)'],['18:00','18:00 (Noite)'],['19:30','19:30 (Semana)'],['20:00','20:00 (Especial)']])}
    </div>
    ${field('repertoire_notes','Repertório / Músicas e Tons do Culto (opcional)','','text',false)}
    <div style="border-top:1px solid #e4e4e7;padding-top:12px;">
     <strong style="display:block;margin-bottom:10px;font-size:14px;">🎸 Selecione os Integrantes por Função Musical:</strong>
     <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
      ${WORSHIP_ROLES.map(slotSelect).join('')}
     </div>
    </div>
    <p class="error" role="alert"></p>
    <button type="submit">Salvar Escala Completa do Louvor</button>
   </form>`;

  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('#worship-scale-form').onsubmit=async ev=>{
   ev.preventDefault();
   const f=ev.currentTarget,b=f.querySelector('button[type=submit]');
   b.disabled=true;
   try{
    const fd=new FormData(f);
    const members=[];
    for(const rName of WORSHIP_ROLES){
     const pid=fd.get('slot_'+rName);
     if(pid)members.push({person_id:pid,instrument_role:rName});
    }
    if(!members.length)throw new Error('Selecione pelo menos 1 integrante (Tecladista, Baterista, Vocal, etc.) para gerar a escala.');
    const res=await api('/ministries/worship-scale',{
     method:'POST',
     body:{
      title:fd.get('title'),
      service_date:fd.get('service_date'),
      service_time:fd.get('service_time'),
      repertoire_notes:fd.get('repertoire_notes')||'',
      members
     }
    });
    dialog.close();
    await refresh(`Escala do Louvor criada com ${res.created_count} integrante(s) escalado(s)!`);
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
    <h2>📊 Gerador de Relatórios Financeiros Personalizados</h2>
    ${button('close','Fechar','class="secondary"')}
   </div>
   <p class="subtle" style="margin-top:0;">Extraia qualquer relatório combinando filtros de período, banco/conta vinculada, centro de custo e formato de exportação (Excel <code>.xls</code>, Relatório Executivo Impresso/PDF, CSV ou JSON).</p>
   <form class="record-form" id="finance-report-form">
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
     ${field('start_date','Data Inicial (opcional)',firstDayMonth,'date',false,null,true)}
     ${field('end_date','Data Final (opcional)',today(),'date',false,null,true)}
    </div>
    ${field('account_id','Conta / Banco Vinculado','','text',false,[['','Todas as contas e bancos'],...opt(data.accounts)])}
    ${field('cost_center_id','Centro de Custo / Ministério','','text',false,[['','Todos os centros de custo'],...opt(data.cost_centers)])}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
     ${field('direction','Tipo de Movimentação','all','text',true,[['all','Entradas e Saídas (Completo)'],['income','Somente Entradas / Receitas'],['expense','Somente Saídas / Despesas']])}
     ${field('payment_status','Status de Liquidação','all','text',true,[['all','Liquidados + Pendentes'],['paid','Somente Liquidados (Pagos)'],['pending','Somente Pendentes (A Pagar/Receber)']])}
    </div>
    ${field('format','Modelo de Exportação','xls','text',true,[
     ['xls','📊 Planilha Microsoft Excel (.xls) — Com Abas de Resumo, Bancos e Lançamentos'],
     ['html','🖨️ Relatório Executivo Impresso / Salvar em PDF'],
     ['csv','📑 Arquivo Contábil CSV (.csv)'],
     ['json','🧩 Estrutura Completa JSON (.json)']
    ])}
    <button type="submit">📥 Gerar e Baixar Relatório Agora</button>
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
    ${field('cell_id','Deseja participar de algum GC? (opcional)','', 'text', false, [['','Escolher depois'],...opt(data.cells)])}
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
    if(!body.cell_id)body.cell_id=null;
    const res=await api('/members/self-register',{method:'POST',body});
    dialog.close();
    await refresh(res.message||'Auto-cadastro registrado.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{b.disabled=false;}
  };
  dialog.showModal();
 }

 async function form(kind,record,presetMinistry=''){
  const r=record||{};let html='';
  if(kind==='cells'){
   html=field('name','Nome do GC / Célula',r.name,'text',true)
    +field('leader_name','Nome do(a) Líder',r.leader_name||'Liderança GC')
    +field('neighborhood','Bairro / Região',r.neighborhood)
    +field('address','Endereço Completo do GC (exibido no Banner)',r.address)
    +field('meeting_day','Dia e Horário (ex.: Terça-feira | 19h30)',r.meeting_day||'Terça-feira | 19h30')
    +field('banner_url','Arte / Banner do GC',r.banner_url||'/gc/gc-ide.webp','text',false,[
     ['/gc/gc-ide.webp','Banner Oficial — GC Ide'],
     ['/gc/gc-emanuel.webp','Banner Oficial — GC Emanuel'],
     ['/gc/gc-fe.webp','Banner Oficial — GC Fé'],
     ['/gc/gc-betel.webp','Banner Oficial — GC Betel'],
     ['/gc/gc-rocket.webp','Banner Oficial — GC Rocket'],
     ['/gc/gc-legacy.webp','Banner Oficial — GC Legacy'],
     ['/gc/gc-proposito.webp','Banner Oficial — GC Propósito'],
     ['/gc/gc-aviva.webp','Banner Oficial — GC Aviva']
    ]);
  }
  if(kind==='families'){
   html=field('name','Nome da família',r.name,'text',true)
    +field('cell_id','Célula / GC vinculado (opcional)',r.cell_id,'text',false,[['','Sem GC vinculado'],...opt(data.cells,r.cell_id,r.cell_name)])
    +field('neighborhood','Bairro / Região (opcional)',r.neighborhood)
    +field('joined_on','Entrada na igreja (opcional)',r.joined_on,'date');
  }
  if(kind==='people'){
   html=field('name','Nome completo',r.name,'text',true)
    +field('family_id','Família (opcional)',r.family_id,'text',false,[['','Sem família vinculada'],...opt(data.families,r.family_id,r.family_name)])
    +field('cell_id','Célula / GC (opcional)',r.cell_id,'text',false,[['','Sem GC vinculado'],...opt(data.cells,r.cell_id,r.cell_name)])
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
    +field('address','Endereço residencial (criptografado)',r.address)
    +field('pastoral_notes','Observações pastorais (criptografadas com AES-128)',r.pastoral_notes);
  }
  if(kind==='assignments'){
   directory=await api('/ministries/people');
   const defaultMin=presetMinistry||r.ministry||ministryFilter||data.user_scope||data.catalog[0];
   const rolePresets=defaultMin==='Music'?WORSHIP_ROLES:(MINISTRY_META[defaultMin]?.roles||['Integrante','Voluntário','Líder']);
   html=`<div class="lookup"><label>Buscar pessoa cadastrada<input id="person-search" maxlength="100"></label>${button('lookup','Buscar pessoa','class="secondary"')}</div>`
    +field('person_id','Pessoa cadastrada no Members',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('ministry','Ministério',defaultMin,'text',true,data.catalog.map(x=>[x,x]))
    +`<label>Função no Ministério (ex.: Tecladista, Baterista, Vocal, Recepção)
      <input name="position" list="ministry-role-suggestions" value="${e(r.position||(defaultMin==='Music'?'Tecladista':'Integrante'))}" required maxlength="80">
      <datalist id="ministry-role-suggestions">${[...new Set([...WORSHIP_ROLES,...rolePresets])].map(rp=>`<option value="${e(rp)}"></option>`).join('')}</datalist>
     </label>`
    +field('is_leader','Nível de liderança',r.is_leader?'true':'false','text',true,[['false','Voluntário / Equipe'],['true','⭐ Líder / Coordenador Responsável (Recebe Notificações)']])
    +field('training_status','Trilha de Capacitação',r.training_status||'certified','text',true,Object.entries(trainingLabels))
    +field('started_on','Data de início (opcional)',r.started_on,'date');
  }
  if(kind==='schedules'){
   directory=await api('/ministries/people');
   html=`<div class="lookup"><label>Buscar voluntário<input id="person-search" maxlength="100"></label>${button('lookup','Buscar pessoa','class="secondary"')}</div>`
    +field('title','Culto ou Evento (ex.: Culto de Celebração Domingo)',r.title||'Culto de Celebração','text',true)
    +field('ministry','Ministério',r.ministry||ministryFilter||data.user_scope||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))
    +field('person_id','Voluntário escalado',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))
    +field('role_notes','Função específica no culto (ex.: Tecladista, Baterista, Vocal, Câmera 1)',r.role_notes)
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
    +field('bank','Banco vinculado ou instituição (ex.: Itaú, Bradesco, Sicoob, Caixa Interno)',r.bank)
    +field('opening_value','Saldo inicial em R$',r.opening_cents!==undefined?(r.opening_cents/100).toFixed(2):'0','text',true);
  }
  if(kind==='entries'){
   html=field('account_id','Conta / Banco Vinculado',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('cost_center_id','Centro de Custo (opcional)',r.cost_center_id,'text',false,[['','Sem centro de custo'],...opt(data.cost_centers,r.cost_center_id,r.cost_center_name)])
    +field('direction','Tipo',r.direction||'income','text',true,[['income','Entrada / Receita'],['expense','Saída / Despesa']])
    +field('payment_status','Situação do lançamento',r.payment_status||'paid','text',true,[['paid','🟢 Liquidado (Pago / Recebido)'],['pending','⏳ Pendente (Previsão de Conta a Pagar / Receber)']])
    +field('payment_method','Meio de pagamento',r.payment_method||'pix','text',true,Object.entries(paymentMethodLabels))
    +field('description','Descrição',r.description,'text',true)
    +field('occurred_on','Data de competência / pagamento',r.occurred_on||today(),'date',true)
    +field('due_date','Data de vencimento (para previsão 30/60/90 dias)',r.due_date,'date',false,null,true)
    +field('amount','Valor em R$',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)
    +field('category','Categoria (ex.: Dízimo, Oferta, Energia, Som, Missões)',r.category);
  }
  if(kind==='closings'){
   html=field('service_name','Identificação do Culto (ex.: Culto Domingo 18h)',r.service_name,'text',true)
    +field('service_date','Data do culto',r.service_date||today(),'date',true)
    +field('account_id','Conta / Banco de destino',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))
    +field('tithes','Total de Dízimos em R$',r.tithes_cents!==undefined?(r.tithes_cents/100).toFixed(2):'0','text',true)
    +field('offerings_cash','Ofertas em Espécie em R$',r.offerings_cash_cents!==undefined?(r.offerings_cash_cents/100).toFixed(2):'0','text',true)
    +field('offerings_pix','Ofertas via PIX em R$',r.offerings_pix_cents!==undefined?(r.offerings_pix_cents/100).toFixed(2):'0','text',true)
    +field('offerings_card','Ofertas em Cartão em R$',r.offerings_card_cents!==undefined?(r.offerings_card_cents/100).toFixed(2):'0','text',true)
    +field('counted_by','1º Conferente (Tesoureiro / Diácono)',r.counted_by,'text',true)
    +field('verified_by','2º Conferente (Testemunha / Dupla Conferência)',r.verified_by,'text',true)
    +field('notes','Observações do fechamento (criptografadas)',r.notes);
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
    dialog.close();await refresh('Registro salvo com integridade verificada.');
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
   if(b.dataset.sectorAction==='approve-gc-app'){
    b.disabled=true;
    await api('/members/gc-applications/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Membro aprovado e vinculado oficialmente ao GC!');
    return;
   }
   if(b.dataset.sectorAction==='reject-gc-app'){
    if(!confirm('Encerrar esta solicitação de GC?'))return;
    b.disabled=true;
    await api('/members/gc-applications/'+b.dataset.id,{method:'DELETE'});
    await refresh('Solicitação de GC encerrada.');
    return;
   }
   if(b.dataset.sectorAction==='approve-min-app'){
    b.disabled=true;
    await api('/ministries/applications/'+b.dataset.id+'/approve',{method:'POST'});
    await refresh('Candidato aprovado e integrado oficialmente ao Ministério!');
    return;
   }
   if(b.dataset.sectorAction==='reject-min-app'){
    if(!confirm('Recusar esta candidatura ministerial?'))return;
    b.disabled=true;
    await api('/ministries/applications/'+b.dataset.id,{method:'DELETE'});
    await refresh('Candidatura recusada.');
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
