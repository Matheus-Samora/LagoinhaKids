export function createSectors({api,e,identity}){
 let key='',data={},directory=[],query='',generation=0,host;
 const cash=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
 const date=v=>v?v.slice(0,10).split('-').reverse().join('/'):'—';
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const id=()=>crypto.randomUUID();
 const role=()=>identity().platform_admin?'admin':identity().modules.find(m=>m.id===key)?.role;
 const edit=()=>['admin','editor'].includes(role());
 const labels={families:'Famílias',people:'Membros',assignments:'Vínculos ministeriais',accounts:'Contas',entries:'Entradas e saídas',invoices:'Notas fiscais'};
 const button=(action,text,extra='')=>`<button type="button" data-sector-action="${action}" ${extra}>${text}</button>`;
 const options=(rows,field='name')=>rows.map(r=>[r.id,r[field]]);
 function summary(){
  if(key==='members')return `<div class="metrics"><article><strong>${data.total_people}</strong><span>Membros cadastrados</span></article><article><strong>${data.total_families}</strong><span>Famílias cadastradas</span></article></div>`;
  if(key==='ministries')return `<div class="ministry-counts">${data.catalog.map(m=>`<span class="badge">${e(m)} · ${data.counts.find(c=>c.ministry===m)?.total||0}</span>`).join('')}</div>`;
  return `<p class="notice">Controle manual em reais. Integração bancária e validação fiscal automática ainda não estão disponíveis.</p><div class="metrics"><article><strong>${cash(data.totals.income_cents)}</strong><span>Entradas ativas</span></article><article><strong>${cash(data.totals.expense_cents)}</strong><span>Saídas ativas</span></article><article><strong>${cash(data.accounts.reduce((n,a)=>n+Number(a.balance_cents),0))}</strong><span>Saldo das contas (inclui saldos iniciais)</span></article></div>`;
 }
 function row(kind,r){
  if(kind==='families')return `<td><strong>${e(r.name)}</strong></td><td>${r.member_count} integrante(s)</td><td>${date(r.joined_on)}</td>`;
  if(kind==='people')return `<td><strong>${e(r.name)}</strong><small>${e(r.phone||r.email||'')}</small></td><td>${e(r.family_name)}<small>${e(r.relationship)}</small></td><td>${date(r.joined_on)}<small>Nascimento: ${date(r.birthday)}</small></td>`;
  if(kind==='assignments')return `<td><strong>${e(r.person_name)}</strong></td><td>${e(r.ministry)}<small>${e(r.position)}</small></td><td>${date(r.started_on)}</td>`;
  if(kind==='accounts')return `<td><strong>${e(r.name)}</strong><small>${e(r.bank)}</small></td><td>${cash(r.opening_cents)}</td><td><strong>${cash(r.balance_cents)}</strong></td>`;
  if(kind==='entries')return `<td><strong>${e(r.description)}</strong><small>${e(r.account_name)} · ${e(r.category)}</small></td><td>${date(r.occurred_on)}</td><td><span class="money ${r.direction}">${r.direction==='income'?'+':'−'} ${cash(r.amount_cents)}</span></td>`;
  return `<td><strong>${e(r.number)}</strong><small>${e(r.supplier)}</small></td><td>${date(r.issued_on)}</td><td>${cash(r.amount_cents)} ${r.file_id?`<a href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">Ver anexo</a>`:''}</td>`;
 }
 function section(kind){
  const rows=data[kind]||[];
  const headers={families:['Família','Integrantes','Entrada na igreja'],people:['Membro','Família','Datas'],assignments:['Pessoa','Ministério / função','Início'],accounts:['Conta','Saldo inicial','Saldo atual'],entries:['Lançamento','Data','Valor'],invoices:['Nota / fornecedor','Emissão','Valor / anexo']}[kind];
  return `<section class="panel sector-section"><div class="section-title"><h2>${labels[kind]}</h2>${edit()?button('new','Adicionar',`data-kind="${kind}"`):''}</div>${rows.length?`<div class="sector-table"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}<th>Ações</th></tr></thead><tbody>${rows.map(r=>`<tr>${row(kind,r)}<td class="row-buttons">${edit()?button('edit','Editar',`data-kind="${kind}" data-id="${e(r.id)}"`):'<span>Consulta</span>'}${role()==='admin'?button('archive','Arquivar',`data-kind="${kind}" data-id="${e(r.id)}"`):''}${key==='finance'&&role()==='admin'?button('history','Histórico',`data-id="${e(r.id)}"`):''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="sector-empty"><h3>Nenhum registro nesta lista</h3><p>${edit()?'Toque em Adicionar para começar ou ajuste a busca.':'A equipe ainda não cadastrou informações ou a busca não encontrou resultados.'}</p></div>`}</section>`;
 }
 function paint(message=''){
  const kinds=key==='members'?['families','people']:key==='ministries'?['assignments']:['accounts','entries','invoices'];
  host.innerHTML=`<div class="sector-toolbar"><a href="/access">← Meus acessos</a><span class="badge">${role()==='viewer'?'Somente consulta':role()==='admin'?'Administração do setor':'Cadastro e edição'}</span></div><p role="status" class="status">${e(message)}</p>${summary()}<form class="sector-search"><label>Buscar ${key==='ministries'?'pessoa':key==='members'?'membro':'lançamento ou nota'}<input name="q" value="${e(query)}" maxlength="100" placeholder="Digite um nome ou descrição"></label><button>Buscar</button>${button('clear','Limpar')}</form><p class="subtle">Listas exibem até 200 registros por seção; use a busca para localizar outros. Famílias e contas: até 500.</p>${key==='ministries'?'<p class="notice">Selecione pessoas já cadastradas no Lagoinha Members. Uma pessoa pode participar de vários ministérios.</p>':''}${kinds.map(section).join('')}<dialog id="sector-dialog"><div class="sector-modal"></div></dialog>`;
  host.querySelector('.sector-search').onsubmit=event=>{event.preventDefault();query=new FormData(event.currentTarget).get('q');void refresh();};
  host.querySelectorAll('[data-sector-action]').forEach(b=>b.onclick=()=>void action(b));
 }
 async function refresh(message=''){
  const n=++generation;
  try{const result=await api('/'+key+'?q='+encodeURIComponent(query));if(n!==generation)return;data=result;paint(message);}catch(err){if(n===generation)host.innerHTML=`<div class="panel"><p role="alert">${e(err.message)}</p>${button('retry','Tentar novamente')}</div>`;host.querySelector('[data-sector-action="retry"]')?.addEventListener('click',()=>void refresh());}
 }
 async function mount(module){key=module.id;host=document.getElementById('sector-content');query='';if(host)await refresh();}
 function field(name,label,value='',type='text',required=false,opts=null){
  const attrs=`name="${name}" ${required?'required':''}`;
  return `<label>${label}${opts?`<select ${attrs}>${opts.map(([v,t])=>`<option value="${e(v)}" ${String(v)===String(value??'')?'selected':''}>${e(t)}</option>`).join('')}</select>`:`<input ${attrs} type="${type}" value="${e(value)}" ${type==='date'?`max="${today()}"`:''} maxlength="${name==='description'?250: name==='email'?200:160}" ${['amount','opening_value'].includes(name)?'inputmode="decimal"':''}>`}</label>`;
 }
 const opt=(rows,currentId,currentLabel)=>{const list=options(rows);if(currentId&&!list.some(([v])=>v===currentId))list.push([currentId,currentLabel||'Vínculo atual']);return list;};
 async function form(kind,record){
  const r=record||{};let html='';
  if(kind==='families')html=field('name','Nome da família',r.name,'text',true)+field('joined_on','Entrada na igreja (opcional)',r.joined_on,'date');
  if(kind==='people')html=field('name','Nome completo',r.name,'text',true)+field('family_id','Família (opcional)',r.family_id,'text',false,[['','Sem família vinculada'],...opt(data.families,r.family_id,r.family_name)])+field('relationship','Parentesco (opcional)',r.relationship)+field('birthday','Data de nascimento (opcional)',r.birthday,'date')+field('joined_on','Entrada na igreja (opcional)',r.joined_on,'date')+field('phone','Telefone (opcional)',r.phone,'tel')+field('email','E-mail (opcional)',r.email,'email');
  if(kind==='assignments'){
   directory=await api('/ministries/people');
   html=`<div class="lookup"><label>Buscar pessoa cadastrada<input id="person-search" maxlength="100"></label>${button('lookup','Buscar pessoa')}</div>`+field('person_id','Pessoa cadastrada no Members',r.person_id,'text',true,opt(directory,r.person_id,r.person_name))+field('ministry','Ministério',r.ministry||data.catalog[0],'text',true,data.catalog.map(x=>[x,x]))+field('position','Função no ministério',r.position||'Integrante','text',true)+field('started_on','Data de início (opcional)',r.started_on,'date');
  }
  if(kind==='accounts')html=field('name','Nome da conta / caixa',r.name,'text',true)+field('bank','Banco ou identificação (opcional)',r.bank)+field('opening_value','Saldo inicial em R$',r.opening_cents!==undefined?(r.opening_cents/100).toFixed(2):'0','text',true);
  if(kind==='entries')html=field('account_id','Conta',r.account_id,'text',true,opt(data.accounts,r.account_id,r.account_name))+field('direction','Tipo',r.direction||'income','text',true,[['income','Entrada'],['expense','Saída']])+field('description','Descrição',r.description,'text',true)+field('occurred_on','Data',r.occurred_on||today(),'date',true)+field('amount','Valor em R$',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)+field('category','Categoria (opcional)',r.category);
  if(kind==='invoices')html=field('number','Número da nota',r.number,'text',true)+field('supplier','Fornecedor / emitente',r.supplier,'text',true)+field('issued_on','Data de emissão',r.issued_on||today(),'date',true)+field('amount','Valor em R$',r.amount_cents!==undefined?(r.amount_cents/100).toFixed(2):'','text',true)+field('entry_id','Lançamento vinculado (opcional)',r.entry_id,'text',false,[['','Sem vínculo'],...opt(data.entries.map(x=>({...x,name:x.description})),r.entry_id)])+`<input name="file_id" type="hidden" value="${e(r.file_id)}"><label>Anexar nota (PDF, JPG, PNG ou WebP, até 10 MB)<input type="file" id="invoice-file" accept="application/pdf,image/jpeg,image/png,image/webp"></label><p id="invoice-status" role="status">${r.file_id?`<a href="/api/finance/files/${e(r.file_id)}" target="_blank" rel="noopener">Ver anexo atual</a>`:'Sem anexo. O arquivo é opcional.'}</p>`;
  const dialog=host.querySelector('dialog');dialog.querySelector('.sector-modal').innerHTML=`<div class="section-title"><h2>${record?'Editar':'Adicionar'} · ${labels[kind]}</h2>${button('close','Fechar')}</div><form class="record-form"><input name="request_id" type="hidden" value="${id()}">${html}<p class="error" role="alert"></p><button type="submit">Salvar</button></form>`;
  dialog.querySelector('[data-sector-action="close"]').onclick=()=>dialog.close();
  dialog.querySelector('[data-sector-action="lookup"]')?.addEventListener('click',async()=>{try{directory=await api('/ministries/people?q='+encodeURIComponent(dialog.querySelector('#person-search').value));dialog.querySelector('[name=person_id]').innerHTML=directory.map(p=>`<option value="${e(p.id)}">${e(p.name)}</option>`).join('');}catch(err){dialog.querySelector('.error').textContent=err.message;}});
  dialog.querySelector('#invoice-file')?.addEventListener('change',async event=>{
   const file=event.target.files[0];if(!file)return;const b=dialog.querySelector('button[type=submit]'),status=dialog.querySelector('#invoice-status');
   if(file.size>10*1024*1024){status.textContent='O limite é 10 MB.';return;}
   b.disabled=true;status.textContent='Enviando anexo…';
   try{const body=new FormData();body.append('file',file);const res=await api('/finance/files',{method:'POST',body,raw:true});dialog.querySelector('[name=file_id]').value=res.id;status.innerHTML=`<a href="${e(res.url)}" target="_blank" rel="noopener">Anexo enviado. Salve a nota para concluir.</a>`;}catch(err){status.textContent=err.message;}finally{b.disabled=false;event.target.value='';}
  });
  dialog.querySelector('form').onsubmit=async event=>{
   event.preventDefault();const f=event.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
   try{const body=Object.fromEntries(new FormData(f));if(record)body.version=r.version;
    for(const name of ['family_id','birthday','joined_on','started_on','entry_id','file_id'])if(name in body&&!body[name])body[name]=null;
    await api('/'+key+'/'+kind+(record?'/'+r.id:''),{method:record?'PUT':'POST',body});dialog.close();await refresh('Registro salvo.');
   }catch(err){f.querySelector('.error').textContent=err.message;}finally{b.disabled=false;}
  };
  dialog.showModal();
 }
 async function action(b){
  try{
   const kind=b.dataset.kind,r=(data[kind]||[]).find(x=>x.id===b.dataset.id);
   if(b.dataset.sectorAction==='clear'){query='';await refresh();}
   if(b.dataset.sectorAction==='new')await form(kind);
   if(b.dataset.sectorAction==='edit')await form(kind,r);
   if(b.dataset.sectorAction==='archive'){
    if(!confirm(kind==='people'?'Arquivar este membro também encerrará seus vínculos ministeriais. Continuar?':'Arquivar este registro? Ele será preservado no histórico.'))return;
    b.disabled=true;await api('/'+key+'/'+kind+'/'+r.id+'?version='+r.version,{method:'DELETE'});await refresh('Registro arquivado.');
   }
   if(b.dataset.sectorAction==='history'){
    const changes=await api('/finance/history/'+b.dataset.id);const dialog=host.querySelector('dialog');dialog.querySelector('.sector-modal').innerHTML=`<h2>Histórico do registro</h2>${changes.map(c=>`<article><strong>${e(c.action)} · ${e(new Date(c.created_at).toLocaleString('pt-BR'))}</strong><pre>${e(c.after_json||c.before_json||'')}</pre></article>`).join('')||'<p>Sem alterações registradas.</p>'}${button('close','Fechar')}`;dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
   }
  }catch(err){const status=host.querySelector('[role=status]');if(status)status.textContent=err.message;b.disabled=false;}
 }
 return {mount};
}
