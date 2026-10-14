import './school.css';
export function createSchoolUI({S,api,escape:e,icon,title,showModal,toast,refresh,render,age,statusName,time,navigateTo,openScanner}){
 const dateLabel=value=>new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
 const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(value);
 const ageAt=(birth,when)=>{const [y,m,d]=when.slice(0,10).split('-').map(Number),[by,bm,bd]=birth.split('-').map(Number);return y-by-((m<bm||(m===bm&&d<bd))?1:0);};
 const childName=ch=>e(ch.name);
 const initials=name=>e(name.trim().split(/\s+/).slice(0,2).map(p=>p[0]).join(''));
 const roomOptions=current=>S.rooms.map(r=>`<option value="${r.id}" ${r.id===current?'selected':''}>${e(r.name)}</option>`).join('');
 const errorSlot='<p class="form-error" role="alert"></p>';
 const parents=selected=>`<option value="">Vincular depois</option>${S.users.filter(u=>u.role==='parent'&&u.active).map(u=>`<option value="${u.id}" ${u.id===selected?'selected':''}>${e(u.name)} · ${e(u.email)}</option>`).join('')}`;
 const empty=(heading,text)=>`<div class="empty">${icon('rooms',30)}<h3>${heading}</h3><p>${text}</p></div>`;
 const selectedChild=()=>{let ch=S.children.find(c=>c.id===S.selectedChild);if(!ch){ch=S.children[0];S.selectedChild=ch?.id||null;}return ch;};
 function childForm(ch){
  const parent=S.user.role==='parent';
  showModal(ch?'Editar cadastro':parent?'Cadastrar meu filho':'Adicionar aluno',parent?'Preencha as informações do seu filho. Alergias e cuidados médicos são fundamentais para a segurança.':'Escolha uma turma sob sua responsabilidade.',`<form data-form="simple-child" ${ch?`data-id="${ch.id}"`:''}>
   <label>Nome da criança<input name="name" value="${e(ch?.name||'')}" required minlength="2" maxlength="100" autocomplete="off" placeholder="Nome completo"/></label>
   <label>Data de nascimento<input name="birthday" type="date" value="${e(ch?.birthday||'')}" required max="${day(new Date())}"/></label>
   ${parent?'':`<label>Turma<select name="room_id" required>${roomOptions(ch?.room_id)}</select></label>`}
   ${S.user.role==='admin'?`<label>Responsável<select name="parent_id">${parents(ch?.parent_id)}</select></label>`:''}
   <fieldset style="border:1px solid #27272a;border-radius:8px;padding:12px;margin:12px 0;"><legend style="font-size:12px;font-weight:700;padding:0 6px;">🩺 SAÚDE, ALERGIAS E CUIDADOS MÉDICOS</legend>
     <label>Alergias alimentares<input name="allergies" value="${e(ch?.allergies||'')}" placeholder="Ex.: Amendoim, Lactose, Glúten (ou deixe vazio)"/></label>
     <label>Condições médicas / Cuidados especiais<input name="medical_conditions" value="${e(ch?.medical_conditions||'')}" placeholder="Ex.: Asma, Diabetes, TEA, TDAH"/></label>
     <label>Medicamento de emergência na salinha<input name="emergency_medication" value="${e(ch?.emergency_medication||'')}" placeholder="Ex.: Bombinha de ar na mochila com a professora"/></label>
     <label>Outras pessoas autorizadas a buscar<input name="authorized_pickups" value="${e(ch?.authorized_pickups||'')}" placeholder="Ex.: Vovó Maria, Tio Lucas (com RG/CNH)"/></label>
   </fieldset>
   ${errorSlot}<button class="btn primary full" type="submit">${ch?'Salvar alterações':'Cadastrar'} ${icon('check',17)}</button></form>`);
 }
 function roomForm(r){
  showModal(r?'Editar turma':'Criar turma','Depois, adicione os dias e horários das aulinhas.',`<form data-form="simple-room" ${r?`data-id="${r.id}"`:''}><label>Nome da turma<input name="name" value="${e(r?.name||'')}" required minlength="2" maxlength="80" placeholder="Ex.: Pequenos Exploradores"/></label><div class="form-grid"><label>Idade mínima<input name="min_age" type="number" min="0" max="17" required value="${r?.min_age??2}"/></label><label>Idade máxima<input name="max_age" type="number" min="0" max="17" required value="${r?.max_age??6}"/></label></div><label>Vagas por aulinha<input name="capacity" type="number" min="1" max="100" required value="${r?.capacity??15}"/></label>${S.user.role==='admin'?`<label>Professor responsável<select name="owner_id">${S.users.filter(u=>['admin','teacher'].includes(u.role)&&u.active).map(u=>`<option value="${u.id}" ${u.id===(r?.created_by||S.user.id)?'selected':''}>${e(u.name)}</option>`).join('')}</select></label>`:''}${errorSlot}<button class="btn primary full" type="submit">${r?'Salvar turma':'Criar turma'}</button></form>`);
 }
 function lessonForm(roomId,lesson){
  const tomorrow=new Date(Date.now()+86400000);
  showModal(lesson?'Editar aulinha':'Nova aulinha','Publique o dia e o horário para as famílias confirmarem a presença.',`<form data-form="lesson" ${lesson?`data-id="${lesson.id}"`:''}><label>Turma<select name="room_id">${roomOptions(lesson?.room_id||roomId)}</select></label><label>Dia da aula<input name="day" type="date" min="${day(new Date())}" value="${lesson?lesson.starts_at.slice(0,10):day(tomorrow)}" required/></label><div class="form-grid"><label>Início<input name="start" type="time" value="${lesson?lesson.starts_at.slice(11,16):'10:00'}" required/></label><label>Fim<input name="end" type="time" value="${lesson?lesson.ends_at.slice(11,16):'11:00'}" required/></label></div>${!lesson?'<label>Repetir semanalmente<select name="repeat_weeks"><option value="1">Só esta data</option><option value="4">4 semanas</option><option value="8">8 semanas</option><option value="12">12 semanas</option></select></label>':''}${errorSlot}<button class="btn primary full" type="submit">${lesson?'Salvar horário':'Publicar aulinha'}</button></form>${lesson?`<button class="text-link danger-link" data-action="cancel-lesson" data-id="${lesson.id}">Cancelar esta aulinha</button>`:''}`);
 }
 function parentHome(){
  const activeCurriculum = S.lessons.find(l=>l.theme&&l.theme.trim());
  const devCard = activeCurriculum?`<section class="devotional-card"><div class="devotional-header"><span class="devotional-tag">📖 DISCIPULADO FAMILIAR</span><span style="font-size:11px;color:#a1a1aa;">${e(activeCurriculum.room_name||'Salinha')}</span></div><div class="devotional-theme">${e(activeCurriculum.theme)}</div>${activeCurriculum.memory_verse?`<div class="devotional-verse-box"><div class="devotional-verse-text">"${e(activeCurriculum.memory_verse)}"</div><div class="devotional-verse-ref">Versículo para memorizar</div></div>`:''}${activeCurriculum.family_question?`<div class="devotional-question-box"><strong>💬 Conversa no caminho de volta:</strong><p style="margin:4px 0 0 0;">${e(activeCurriculum.family_question)}</p></div>`:''}</section>`:'';
  return `${title('Meus filhos','Cadastre seus filhos e escolha as aulinhas.',`<button class="btn primary" data-action="new-child">${icon('plus',17)} Adicionar filho</button>`)}${devCard}${S.children.length?`<div class="simple-family-grid">${S.children.map(ch=>`<article class="simple-child-card"><div class="person"><span class="kid-avatar big">${initials(ch.name)}</span><div><h2>${childName(ch)}</h2><p>${age(ch.birthday)} anos${ch.status==='present'?' · Na salinha':''}</p>${ch.claim_code&&ch.status==='present'?`<div style="margin-top:6px;"><span class="claim-tag-badge">RECIBO DOS PAIS · CÓDIGO: ${e(ch.claim_code)}</span></div>`:''}${ch.allergies?`<div style="margin-top:4px;"><span class="allergy-badge">⚠️ ALERGIA: ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div style="margin-top:4px;"><span class="allergy-badge">🩺 ${e(ch.medical_conditions)}</span></div>`:''}</div></div>${ch.status==='present'?`<div class="pickup-receipt"><span>Na salinha · Código de retirada</span><strong>${e(ch.claim_code||'Procure a equipe')}</strong><small>Apresente à equipe no momento de buscar.</small></div>`:''}<div class="simple-child-actions"><button class="btn primary" data-action="child-lessons" data-id="${ch.id}">Ver aulinhas ${icon('arrow',16)}</button><button class="btn secondary" data-action="digital-id" data-id="${ch.id}">${icon('qrcode',16)} Carteirinha</button><button class="btn secondary" data-action="edit-child" data-id="${ch.id}">Editar</button></div><details class="child-extra"><summary>Mais opções</summary><button class="text-link" data-action="family" data-id="${ch.id}">Responsáveis e autorizações</button><button class="text-link" data-action="child-history" data-id="${ch.id}">Histórico de presença</button><button class="text-link" data-action="consent" data-id="${ch.id}">Autorização facial</button><button class="text-link" data-action="notify" data-kind="pickup_ready" data-id="${ch.id}">Avisar que cheguei para buscar</button><button class="text-link danger-link" data-action="archive-child" data-id="${ch.id}">Arquivar cadastro</button></details></article>`).join('')}</div><section class="simple-next panel"><h2>Próximo passo</h2><p>Escolha uma aulinha com dia e horário disponíveis e toque em <strong>Confirmar presença</strong>.</p><button class="btn secondary" data-page="lessons">Ver aulinhas disponíveis ${icon('arrow',16)}</button></section>`:empty('Vamos cadastrar seu filho?','Toque em “Adicionar filho”. Depois, escolha uma aulinha disponível.')}`;
 }
 function parentLessons(){
  const ch=selectedChild();
  const cards=S.lessons.map(l=>{
   const compatible=ch&&ageAt(ch.birthday,l.starts_at)>=l.min_age&&ageAt(ch.birthday,l.starts_at)<=l.max_age;
   const confirmed=ch&&l.confirmed_children.includes(ch.id);const waiting=ch&&(l.waiting_children||[]).includes(ch.id);
   return `<article class="lesson-card ${confirmed?'confirmed':''}"><span class="lesson-day">${dateLabel(l.starts_at)}</span><h2>${e(l.room_name)}</h2><div class="lesson-time">${icon('clock',18)} ${time(l.starts_at)} – ${time(l.ends_at)}</div><p>${l.min_age} a ${l.max_age} anos · ${l.available} vagas disponíveis</p>${l.theme?`<div style="margin:6px 0;padding:6px 10px;background:#27272a;border-radius:6px;font-size:12px;color:#f4f4f5;">📖 <strong>Tema:</strong> ${e(l.theme)}</div>`:''}${confirmed?`<div class="confirmed-label">${icon('check',16)} Presença confirmada</div><button class="btn secondary full" data-action="cancel-presence" data-id="${l.id}" data-child="${ch.id}">Cancelar confirmação</button>`:waiting?`<p class="soft-info">Na lista de espera. Se surgir uma vaga, confirmaremos sua participação e enviaremos um aviso.</p><button class="btn secondary full" data-action="leave-waitlist" data-id="${l.id}" data-child="${ch.id}">Sair da lista</button>`:!ch?`<button class="btn primary full" data-action="new-child">Cadastrar filho para confirmar</button>`:!compatible?'<p class="soft-info">Esta turma atende outra faixa etária. Escolha outro filho ou consulte a equipe.</p>':`<button class="btn primary full" data-action="${l.available===0?'join-waitlist':'confirm-presence'}" data-id="${l.id}" data-child="${ch.id}">${l.available===0?'Entrar na lista de espera':'Confirmar presença'} ${icon('check',16)}</button>`}</article>`;
  }).join('');
  return `${title('Aulinhas','Dias e horários publicados pela equipe.',`<button class="btn secondary" data-action="refresh-school">Atualizar horários</button>`)}${ch?`<div class="lesson-toolbar"><label>Para qual filho?<select id="lesson-child">${S.children.map(c=>`<option value="${c.id}" ${c.id===ch.id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label><span class="schedule-zone">Horários de São Paulo</span></div>`:'<p class="soft-info">Você pode consultar os horários abaixo. Cadastre seu filho para confirmar a participação.</p>'}${cards?`<div class="lesson-cards">${cards}</div>`:empty('A equipe ainda não publicou horários','As turmas foram cadastradas, mas cada aulinha precisa de uma data e horário. Peça à equipe para publicar em Minhas turmas → Publicar horário.')}${!S.lessons.length&&S.rooms.length?`<section class="panel"><h2>Turmas cadastradas</h2>${S.rooms.map(r=>`<p><strong>${e(r.name)}</strong> · ${r.min_age} a ${r.max_age} anos · Aguardando publicação de horários</p>`).join('')}</section>`:''}<p class="muted-note">Horários atualizados automaticamente enquanto o app está aberto. A confirmação reserva a participação; a equipe confere a chegada e a saída.</p>`;
 }
 function roomsPage(){
  return `${title(S.user.role==='admin'?'Turmas':'Minhas turmas','Crie a turma e publique os horários das aulinhas.',`<button class="btn primary" data-action="new-room">${icon('plus',17)} Criar turma</button>`)}${S.rooms.length?`<div class="simple-room-grid">${S.rooms.map(r=>{const lessons=S.lessons.filter(l=>l.room_id===r.id);return `<article class="simple-room-card panel"><header><span class="room-symbol">${icon('rooms',24)}</span><button class="text-link" data-action="edit-room" data-id="${r.id}">Editar turma</button></header><h2>${e(r.name)}</h2><p>${r.min_age} a ${r.max_age} anos · ${r.capacity} vagas por aula</p>${S.user.role==='admin'?`<p class="muted-note">Responsável: ${e(r.owner_name||'Não definido')}</p>`:''}<div class="simple-room-actions"><button class="btn primary" data-action="new-lesson" data-id="${r.id}">${icon('plus',16)} Publicar horário</button><button class="btn secondary" data-action="room-students" data-id="${r.id}">Alunos (${r.total})</button></div><section class="room-schedule"><h3>Próximas aulinhas</h3>${lessons.length?lessons.map(l=>`<div class="schedule-row"><div><strong>${dateLabel(l.starts_at)}</strong><span>${time(l.starts_at)} – ${time(l.ends_at)} · ${l.confirmed_count} confirmado${l.confirmed_count===1?'':'s'}</span></div><button class="mini-button" data-action="lesson-curriculum" data-id="${l.id}" title="Discipulado Familiar">📖 Discipulado</button><button class="mini-button" data-action="lesson-roster" data-id="${l.id}">Chamada</button><button class="icon-button" data-action="edit-lesson" data-id="${l.id}" aria-label="Editar horário de ${e(r.name)}">${icon('settings',16)}</button></div>`).join(''):'<p class="muted-note">Publique a primeira aulinha para receber confirmações.</p>'}</section><details class="child-extra"><summary>Gerenciar turma</summary><button class="text-link danger-link" data-action="archive-room" data-id="${r.id}">Arquivar turma</button></details></article>`;}).join('')}</div>`:empty('Sua primeira turma começa aqui','Toque em “Criar turma” e depois publique o dia e o horário da aula.')}`;
 }
 function rosterRows(children,lesson){
  const today=day(new Date());
  return children.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${children.map(ch=>`<tr><td><div class="person"><span class="kid-avatar">${initials(ch.name)}</span><div><strong>${childName(ch)}</strong><small>${age(ch.birthday)} anos</small>${ch.claim_code&&ch.status==='present'?`<div><span class="claim-tag-badge">TAG: ${e(ch.claim_code)}</span></div>`:''}${ch.allergies?`<div><span class="allergy-badge">⚠️ ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div><span class="allergy-badge">🩺 ${e(ch.medical_conditions)}</span></div>`:''}</div></div></td><td><span class="status ${ch.status}">${lesson&&lesson.starts_at.slice(0,10)!==today?'Confirmado para a aula':statusName[ch.status]}</span></td><td><div class="row-actions"><button class="mini-button" data-action="attendance" data-id="${ch.id}" ${lesson&&lesson.starts_at.slice(0,10)!==today?'disabled title="A chamada de chegada fica disponível no dia da aula"':''}>${ch.status==='present'?'Registrar saída':'Marcar chegada'}</button><button class="mini-button" data-action="digital-id" data-id="${ch.id}" title="Carteirinha Digital">🪪</button><button class="mini-button" data-action="paging-call" data-id="${ch.id}" title="Chamar no Telão">📢 Telão</button><button class="mini-button" data-action="student-options" data-id="${ch.id}">Opções</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum aluno confirmado ainda','As confirmações das famílias aparecerão aqui. Você também pode adicionar um aluno da sua turma.');
 }
 function attendancePage(){
  const lesson=S.lessons.find(l=>l.id===S.selectedLesson);
  if(!lesson)S.selectedLesson=null;
  const children=lesson?S.children.filter(ch=>lesson.confirmed_children.includes(ch.id)):S.children;
  const guestsSection=S.activeGuests&&S.activeGuests.length?`<section class="panel" style="margin-top:16px;"><h3>Visitantes de Hoje (${S.activeGuests.length})</h3><div class="table-wrap"><table><thead><tr><th>Criança</th><th>Responsável / Contato</th><th>Saída</th><th>Status</th></tr></thead><tbody>${S.activeGuests.map(g=>`<tr><td><strong>${e(g.child_name)}</strong><br><small>${g.child_age} anos${g.allergies?` · ⚠️ ${e(g.allergies)}`:''}</small></td><td>${e(g.guardian_name)}<br><small>${g.guardian_phone?`<a href="https://wa.me/55${g.guardian_phone.replace(/\\D/g,'')}" target="_blank" style="color:#22c55e;">WhatsApp: ${e(g.guardian_phone)}</a>`:''}</small></td><td><button class="mini-button" data-action="guest-checkout" data-id="${g.id}">Registrar saída</button></td><td><span class="status present">Na Salinha</span></td></tr>`).join('')}</tbody></table></div></section>`:'';
  return `${title('Chamada','Acompanhe as crianças e faça o check-in.',`<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn primary" data-action="open-scanner" style="display:inline-flex;align-items:center;gap:6px;">${icon('qrcode',17)} 📷 Ler QR Code (Check-in)</button><button class="btn secondary" data-action="guest-checkin">${icon('plus',16)} Check-in Visitante (30s)</button>${lesson?`<button class="btn secondary" data-action="add-lesson-student" data-id="${lesson.id}">${icon('plus',16)} Adicionar aluno</button>`:''}</div>`)}
  <div class="scanner-desk-bar">
    <div class="scanner-desk-info">
      <span class="scanner-desk-icon">⚡</span>
      <div>
        <strong>Leitor de Mesa / Scanner USB:</strong>
        <span class="scanner-desk-sub">Bipe a carteirinha com o leitor de código de barras ou digite o código da criança (ex: LK-0007).</span>
      </div>
    </div>
    <div class="scanner-desk-action">
      <input id="desk-barcode-input" aria-label="Código da carteirinha ou nome da criança" type="text" placeholder="Bipar código (ex: LK-0007)..." autocomplete="off" />
      <button type="button" class="btn primary" data-action="desk-barcode-search">Check-in</button>
    </div>
  </div>
  <section class="panel"><div class="lesson-toolbar inside"><label>Aulinha<select id="lesson-filter"><option value="">Todos os alunos das minhas turmas</option>${S.lessons.map(l=>`<option value="${l.id}" ${l.id===S.selectedLesson?'selected':''}>${e(l.room_name)} · ${dateLabel(l.starts_at)} · ${time(l.starts_at)}</option>`).join('')}</select></label></div>${rosterRows(children,lesson)}</section>${guestsSection}<p class="muted-note">A confirmação da família não substitui a conferência presencial do responsável na chegada e na saída.</p>`;
 }
 function studentsPage(){
  const rid=Number(S.room),room=S.rooms.find(r=>r.id===rid);
  const confirmed=new Set(S.lessons.filter(l=>l.room_id===rid).flatMap(l=>l.confirmed_children));
  const children=room?S.children.filter(ch=>ch.room_id===rid||confirmed.has(ch.id)):S.children;
  return `${title(room?`Alunos · ${e(room.name)}`:'Alunos',S.user.role==='admin'?'Gerencie cadastros e vínculos familiares.':'Alunos vinculados às suas turmas.',`<button class="btn secondary" data-action="new-child">${icon('plus',17)} Adicionar aluno</button>`)}<section class="panel">${rosterRows(children,null)}</section>`;
 }
 const page=()=>{
  if(S.user.role==='parent'&&S.page==='overview')return parentHome();
  if(S.user.role==='parent'&&S.page==='lessons')return parentLessons();
  if(S.page==='rooms'||(S.user.role==='teacher'&&S.page==='overview'))return roomsPage();
  if(S.page==='attendance'&&S.user.role!=='parent')return attendancePage();
  if(S.page==='children'&&S.user.role!=='parent')return studentsPage();
  return null;
 };
 async function changed(message){await refresh();toast(message);}
 async function action(action,el,ch){
  const id=Number(el.dataset.id);
  if(action==='join-waitlist'||action==='leave-waitlist'){await api(action==='join-waitlist'?`/lessons/${id}/waitlist`:`/lessons/${id}/waitlist/${el.dataset.child}`,{method:action==='join-waitlist'?'POST':'DELETE',...(action==='join-waitlist'?{body:{child_id:Number(el.dataset.child)}}:{})});await changed(action==='join-waitlist'?'Você entrou na lista de espera.':'Você saiu da lista.');return true;}
  if(action==='refresh-school'){await changed('Horários atualizados.');return true;}
  if(action==='open-scanner'){if(openScanner)openScanner();return true;}
  if(action==='desk-barcode-search'){
   const inp=document.getElementById('desk-barcode-input');
   const val=inp?inp.value.trim():'';
   if(openScanner){
    openScanner();
    if(val){
     setTimeout(()=>{
      const usbInp=document.getElementById('scanner-usb-input');
      if(usbInp){usbInp.value=val;document.getElementById('scanner-usb-submit')?.click();}
     },150);
    }
   }
   return true;
  }
  const lesson=S.lessons.find(l=>l.id===id),room=S.rooms.find(r=>r.id===id);
  if(action==='new-child'){if(S.user.role!=='parent'&&!S.rooms.length){toast('Crie uma turma primeiro.');return true;}childForm();return true;}
  if(action==='edit-child'){childForm(ch);return true;}
  if(action==='edit-user'){
   const user=S.users.find(u=>u.id===id);
   showModal('Gerenciar usuário',e(user.name),`<form data-form="school-user" data-id="${id}"><label>Nome<input name="name" required minlength="2" maxlength="100" value="${e(user.name)}"/></label><label>E-mail<input type="email" name="email" required value="${e(user.email)}"/></label><label>Perfil<select name="role">${[['admin','Administração'],['teacher','Professor(a)'],['parent','Responsável']].map(([value,label])=>`<option value="${value}" ${user.role===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="checkbox-label"><input type="checkbox" name="active" ${user.active?'checked':''}/>Acesso ativo</label><fieldset><legend>Turmas sob responsabilidade do professor</legend>${S.rooms.map(r=>`<label class="checkbox-label"><input type="checkbox" name="rooms" value="${r.id}" ${user.rooms.includes(r.id)?'checked':''}/>${e(r.name)}</label>`).join('')}</fieldset><details class="child-extra"><summary>Definir nova senha</summary><label>Nova senha inicial<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Deixe vazio para manter a senha"/></label></details>${errorSlot}<button class="btn primary full" type="submit">Salvar usuário</button></form>`);return true;
  }
  if(action==='child-lessons'){S.selectedChild=id;if(navigateTo)navigateTo('lessons');else{S.page='lessons';render();}return true;}
  if(action==='new-room'){roomForm();return true;}
  if(action==='edit-room'){roomForm(room);return true;}
  if(action==='new-lesson'){lessonForm(id);return true;}
  if(action==='edit-lesson'){lessonForm(lesson.room_id,lesson);return true;}
  if(action==='lesson-roster'){S.selectedLesson=id;if(navigateTo)navigateTo('attendance');else{S.page='attendance';render();}return true;}
  if(action==='room-students'||action==='filter-room'){S.room=String(id);S.selectedLesson=null;if(navigateTo)navigateTo('children');else{S.page='children';render();}return true;}
  if(action==='confirm-presence'||action==='cancel-presence'){
   if(S.busy)return true;S.busy=true;el.disabled=true;
   try{if(action==='confirm-presence')await api(`/lessons/${id}/presence`,{method:'POST',body:{child_id:Number(el.dataset.child)}});else await api(`/lessons/${id}/presence/${el.dataset.child}`,{method:'DELETE'});await changed(action==='confirm-presence'?'Presença confirmada para a aulinha.':'Confirmação cancelada.');}
   finally{S.busy=false;if(el.isConnected)el.disabled=false;}
   return true;
  }
  if(action==='student-options'){
   showModal(childName(ch),'O que você precisa fazer?',`<div class="student-menu"><button class="btn secondary full" data-action="edit-child" data-id="${id}">Editar cadastro</button><button class="btn secondary full" data-action="face" data-id="${id}">Conferência facial</button><button class="btn secondary full" data-action="notify" data-kind="please_pickup" data-id="${id}">Avisar responsável</button>${S.user.role==='admin'?`<button class="btn secondary full" data-action="link-guardian" data-id="${id}">Vincular responsável</button><button class="text-link danger-link" data-action="archive-child" data-id="${id}">Arquivar aluno</button>`:''}</div>`);return true;
  }
  if(action==='cancel-lesson'){showModal('Cancelar aulinha?','Os responsáveis com presença confirmada receberão um aviso.',`<form data-form="cancel-lesson" data-id="${id}"><label class="checkbox-label"><input type="checkbox" required/>Confirmo o cancelamento.</label>${errorSlot}<button class="btn danger full" type="submit">Cancelar aulinha</button></form>`);return true;}
  if(action==='archive-room'||action==='archive-child'){
   showModal(action==='archive-room'?'Arquivar turma?':'Arquivar cadastro?',action==='archive-room'?'O histórico será preservado. A turma não aparecerá nas novas confirmações.':'O cadastro sairá das listas ativas. O descritor facial será excluído.',`<form data-form="${action}" data-id="${id}"><label class="checkbox-label"><input type="checkbox" required/>Confirmo o arquivamento.</label>${errorSlot}<button class="btn danger full" type="submit">Arquivar</button></form>`);return true;
  }
  if(action==='add-lesson-student'){
   const candidates=S.children.filter(c=>!lesson.confirmed_children.includes(c.id)&&ageAt(c.birthday,lesson.starts_at)>=lesson.min_age&&ageAt(c.birthday,lesson.starts_at)<=lesson.max_age);
   showModal('Adicionar aluno à chamada',`${e(lesson.room_name)} · ${dateLabel(lesson.starts_at)}`,candidates.length?`<form data-form="lesson-student" data-id="${id}"><label>Aluno<select name="child_id">${candidates.map(c=>`<option value="${c.id}">${childName(c)}</option>`).join('')}</select></label>${errorSlot}<button class="btn primary full" type="submit">Confirmar participação</button></form>`:'<p class="soft-info">Não há outros alunos compatíveis nas suas turmas. A família pode cadastrar o filho e confirmar por sua própria conta.</p>');return true;
  }
  if(action==='lesson-curriculum'){
   const l=S.lessons.find(x=>x.id===id);
   const curr=await api(`/lessons/${id}/curriculum`).catch(()=>({theme:l?.theme||'',memory_verse:l?.memory_verse||'',family_question:l?.family_question||''}));
   showModal('Discipulado Familiar & Tema da Aulinha',l?`${e(l.room_name)} · ${dateLabel(l.starts_at)}`:'Salinha',`<form data-form="lesson-curriculum" data-id="${id}"><label>Tema da Aulinha<input name="theme" placeholder="Ex.: A Arca de Noé e a Obediência" value="${e(curr.theme||'')}" required/></label><label>Versículo para Memorizar<input name="memory_verse" placeholder="Ex.: Confia no Senhor de todo o teu coração - Pv 3:5" value="${e(curr.memory_verse||'')}"/></label><label>Conversa no Caminho de Volta (Pergunta para os pais)<textarea name="family_question" rows="3" placeholder="Ex.: O que Noé fez quando Deus pediu algo difícil? E nós, quando é difícil obedecer?">${e(curr.family_question||'')}</textarea></label><p class="muted-note">As famílias verão essas informações no aplicativo para continuar o discipulado em casa.</p>${errorSlot}<button class="btn primary full" type="submit">Salvar Discipulado</button></form>`);return true;
  }
  return false;
 }
 async function submit(form,values){
  const type=form.dataset.form,id=Number(form.dataset.id);
  if(type==='simple-child'){
   const data={name:values.name,birthday:values.birthday,allergies:values.allergies||'',medical_conditions:values.medical_conditions||'',emergency_medication:values.emergency_medication||'',special_needs:values.special_needs||'',authorized_pickups:values.authorized_pickups||''};
   if(S.user.role!=='parent')data.room_id=Number(values.room_id);
   if(S.user.role==='admin')data.parent_id=values.parent_id?Number(values.parent_id):null;
   await api(id?`/children/${id}`:'/children',{method:id?'PATCH':'POST',body:data});return 'Cadastro salvo.';
  }
  if(type==='school-user'){
   const data={name:values.name,email:values.email,role:values.role,active:values.active==='on',rooms:new FormData(form).getAll('rooms').map(Number)};
   if(values.password)data.password=values.password;
   await api(`/users/${id}`,{method:'PATCH',body:data});return 'Usuário atualizado.';
  }
  if(type==='simple-room'){
   const data={name:values.name,min_age:Number(values.min_age),max_age:Number(values.max_age),capacity:Number(values.capacity)};
   if(values.owner_id)data.owner_id=Number(values.owner_id);
   if(id)data.version=S.rooms.find(r=>r.id===Number(id))?.version;
   const result=await api(id?`/rooms/${id}`:'/rooms',{method:id?'PATCH':'POST',body:data});return id?'Turma salva.':{message:'Turma criada. Agora publique o primeiro horário.',roomId:result.id};
  }
  if(type==='lesson'){
   await api(id?`/lessons/${id}`:'/lessons',{method:id?'PATCH':'POST',body:{room_id:Number(values.room_id),title:'Aulinha',starts_at:`${values.day}T${values.start}:00-03:00`,ends_at:`${values.day}T${values.end}:00-03:00`,repeat_weeks:Number(values.repeat_weeks)||1}});return 'Aulinha publicada.';
  }
  if(type==='lesson-student'){await api(`/lessons/${id}/presence`,{method:'POST',body:{child_id:Number(values.child_id)}});return 'Aluno adicionado à chamada.';}
  if(type==='cancel-lesson'){await api(`/lessons/${id}`,{method:'DELETE'});return 'Aulinha cancelada. Famílias avisadas.';}
  if(type==='archive-room'){await api(`/rooms/${id}`,{method:'DELETE'});return 'Turma arquivada.';}
  if(type==='archive-child'){await api(`/children/${id}`,{method:'DELETE'});return 'Cadastro arquivado.';}
  if(type==='lesson-curriculum'){
   await api(`/lessons/${id}/curriculum`,{method:'POST',body:{
    theme:values.theme,
    memory_verse:values.memory_verse||'',
    family_question:values.family_question||''
   }});
   return 'Conteúdo de discipulado salvo com sucesso!';
  }
  return false;
 }
 function change(event){if(event.target.id==='lesson-child'){S.selectedChild=Number(event.target.value);render();}if(event.target.id==='lesson-filter'){S.selectedLesson=Number(event.target.value)||null;render();}}
 return {page,action,submit,change,lessonForm};
}

document.addEventListener('keydown', e => {
 if (e.target && e.target.id === 'desk-barcode-input' && e.key === 'Enter') {
  e.preventDefault();
  document.querySelector('[data-action="desk-barcode-search"]')?.click();
 }
});
