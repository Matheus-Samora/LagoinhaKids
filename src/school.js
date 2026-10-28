import './school.css';
export function createSchoolUI({S,api,escape:e,icon,title,showModal,toast,refresh,render,age,statusName,time,navigateTo,openScanner,uploadImage,uploadAvatar,roomPresets=[],kidAvatar}){
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
 function childForm(ch,defaultRoomId){
  const parent=S.user.role==='parent';
  const targetRoom=ch?.room_id || defaultRoomId || (Number(S.room)||null);
  const avatarUrl=ch?.avatar_url||'';
  showModal(ch?'Editar cadastro':parent?'Cadastrar filho':'Adicionar aluno','',`<form data-form="simple-child" ${ch?`data-id="${ch.id}"`:''}>
   <div class="child-avatar-picker" style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:12px;background:#18181b;border:1px solid #27272a;border-radius:12px;">
     <div style="width:64px;height:64px;border-radius:14px;overflow:hidden;background:#09090b;border:2px solid #3f3f46;display:flex;align-items:center;justify-content:center;flex-shrink:0;" id="child-avatar-preview-box">
       ${avatarUrl ? `
         <img src="${e(avatarUrl)}" alt="Foto da criança" style="width:100%;height:100%;object-fit:cover;" id="child-avatar-preview-img"/>
       ` : `
         <span style="font-size:22px;color:#a1a1aa;">${icon('kids', 28)}</span>
       `}
     </div>
     <div style="flex:1;">
       <strong style="display:block;font-size:13px;color:#ffffff;margin-bottom:4px;">Foto de Perfil</strong>
       <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
         <label class="btn secondary btn-sm media-upload-btn" tabindex="0" style="padding:6px 12px;font-size:12px;cursor:pointer;">
           <span>${icon('camera',16)} Enviar foto</span>
           <input type="file" id="child-avatar-form-file-input" accept="image/jpeg,image/png,image/webp" hidden/>
         </label>
         <button type="button" class="mini-button danger-button" id="clear-child-avatar-form-btn" data-action="clear-child-form-avatar" ${avatarUrl ? '' : 'hidden'}>Remover</button>
       </div>
       <input type="hidden" name="avatar_url" id="child-avatar-url-input" value="${e(avatarUrl)}"/>
     </div>
   </div>
   <label>Nome da criança<input name="name" value="${e(ch?.name||'')}" required minlength="2" maxlength="100" autocomplete="off" placeholder="Nome completo"/></label>
   <label>Data de nascimento<input name="birthday" type="date" value="${e(ch?.birthday||'')}" required max="${day(new Date())}"/></label>
   ${parent?'':`<label>Turma<select name="room_id" required>${roomOptions(targetRoom)}</select></label>`}
   ${S.user.role==='admin'?`<label>Responsável<select name="parent_id">${parents(ch?.parent_id)}</select></label>`:''}
   <fieldset style="border:1px solid #27272a;border-radius:8px;padding:12px;margin:12px 0;"><legend style="font-size:12px;font-weight:700;padding:0 6px;">${icon('health',16)} SAÚDE E CUIDADOS (OPCIONAL)</legend>
      <label>Alergias ou Cuidados Especiais<input name="allergies" value="${e(ch?.allergies||[ch?.medical_conditions,ch?.emergency_medication].filter(Boolean).join(' · ')||'')}" placeholder="Ex.: Alergia alimentar, asma, etc. (opcional)" autocomplete="off"/></label>
      <label>Autorizados a buscar<input name="authorized_pickups" value="${e(ch?.authorized_pickups||'')}" placeholder="Ex.: Vovó Maria, Tio Lucas"/></label>
    </fieldset>
   ${errorSlot}<button class="btn primary full" type="submit">${ch?'Salvar':'Cadastrar'} ${icon('check',17)}</button></form>`);
 }

 function setRoomCoverPreview(url){
  const hiddenInp=document.getElementById('room-cover-url-input');
  const prevArea=document.getElementById('room-cover-preview');
  const urlField=document.getElementById('room-url-input-field');
  if(hiddenInp)hiddenInp.value=url||'';
  if(urlField)urlField.value=url&&url.startsWith('http')?url:'';
  if(prevArea){
   if(url){
    prevArea.className='media-preview-area has-image';
    prevArea.innerHTML=`<img src="${e(url)}" alt="Capa da turma" class="media-preview-img" id="room-cover-img"/><div class="media-preview-overlay"><button type="button" class="mini-button danger-button" data-action="clear-room-cover">${icon('close',14)} Remover foto</button></div>`;
   }else{
    prevArea.className='media-preview-area';
    prevArea.innerHTML=`<div class="media-empty-state"><div class="media-empty-icon">${icon('rooms',28)}</div><strong>Foto de capa</strong></div>`;
   }
  }
 }

 function roomForm(r){
  const isEdit=Boolean(r);
  const coverUrl=r?.cover_url||'';
  const allStaff=S.teamMembers?.length?S.teamMembers:(S.users?.filter(u=>['admin','teacher'].includes(u.role)&&u.active)||[]);
  const teachers=allStaff.filter(u=>u.staff_role!=='monitor');
  const monitors=allStaff.filter(u=>u.staff_role==='monitor'||u.staff_role==='teacher'||u.role==='teacher');
  const currentTeacher=r?.teacher_id||r?.created_by||S.user.id;
  const currentMonitor=r?.monitor_id||'';

  showModal(
    isEdit ? 'Editar turma' : 'Nova turma',
    '',
    `<form data-form="simple-room" ${isEdit?`data-id="${r.id}"`:''}>
      <div class="media-picker-group">
        <label class="media-picker-label">Capa da Turma</label>
        <div class="media-picker-box">
          <div class="media-preview-area ${coverUrl?'has-image':''}" id="room-cover-preview">
            ${coverUrl ? `
              <img src="${e(coverUrl)}" alt="Capa da turma" class="media-preview-img" id="room-cover-img"/>
              <div class="media-preview-overlay">
                <button type="button" class="mini-button danger-button" data-action="clear-room-cover">${icon('close',14)} Remover foto</button>
              </div>
            ` : `
              <div class="media-empty-state">
                <div class="media-empty-icon">${icon('rooms',28)}</div>
                <strong>Foto de capa</strong>
              </div>
            `}
          </div>
          <div class="media-actions-toolbar">
            <label class="btn secondary media-upload-btn" tabindex="0">
              <span>${icon('camera',16)} Enviar foto</span>
              <input type="file" id="room-cover-file-input" accept="image/jpeg,image/png,image/webp,image/gif" hidden/>
            </label>
            <button type="button" class="btn secondary" data-action="toggle-room-presets">🎨 Sugestões</button>
          </div>
          <div class="media-presets-drawer" id="room-presets-drawer" hidden>
            <div class="media-presets-grid">
              ${roomPresets.map(p=>`
                <button type="button" class="media-preset-card" data-action="pick-room-preset" data-url="${e(p.url)}" title="${e(p.name)} (${p.min_age} a ${p.max_age} anos)">
                  <img src="${e(p.url)}" alt="${e(p.name)}" loading="lazy"/>
                  <span>${e(p.name)}</span>
                </button>
              `).join('')}
            </div>
          </div>
          <input type="hidden" name="cover_url" id="room-cover-url-input" value="${e(coverUrl)}"/>
        </div>
      </div>

      <label>Nome da turma
        <input name="name" value="${e(r?.name||'')}" required minlength="2" maxlength="80" placeholder="Ex.: Pequenos Exploradores"/>
      </label>
      <div class="form-grid">
        <label>Idade mínima
          <input name="min_age" type="number" min="0" max="17" required value="${r?.min_age??2}"/>
        </label>
        <label>Idade máxima
          <input name="max_age" type="number" min="0" max="17" required value="${r?.max_age??6}"/>
        </label>
      </div>
      <label>Vagas
        <input name="capacity" type="number" min="1" max="100" required value="${r?.capacity??15}"/>
      </label>
      <div class="form-grid">
        <label>Professor(a)
          <select name="teacher_id" required>
            ${teachers.map(u=>`<option value="${u.id}" ${u.id===currentTeacher?'selected':''}>${e(u.name)}</option>`).join('')}
          </select>
        </label>
        <label>Monitor(a) (opcional)
          <select name="monitor_id">
            <option value="">Nenhum (somente professor)</option>
            ${monitors.map(u=>`<option value="${u.id}" ${u.id===currentMonitor?'selected':''}>${e(u.name)}</option>`).join('')}
          </select>
        </label>
      </div>
      <input type="hidden" name="owner_id" value="${currentTeacher}"/>
      ${errorSlot}
      <button class="btn primary full" type="submit">${isEdit ? 'Salvar' : 'Criar turma'} ${icon('check',17)}</button>
      ${isEdit ? `
      <div class="room-modal-danger-box">
        <button type="button" class="btn danger full" data-action="delete-room" data-id="${r.id}">
          ${icon('close',15)} Excluir turma
        </button>
      </div>` : ''}
    </form>`
  );
 }
 function calendarLinks(l){
  const date=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const query=new URLSearchParams({action:'TEMPLATE',text:'Aulinha — '+l.room_name,dates:date(l.starts_at)+'/'+date(l.ends_at),details:'Lagoinha Kids.',location:l.room_name});
  return `<div class="calendar-links" style="display:flex;gap:12px;flex-wrap:wrap;margin:10px 0"><a href="https://calendar.google.com/calendar/render?${e(query.toString())}" target="_blank" rel="noopener noreferrer">Google Agenda</a><a href="${e(S.apiOrigin||'')}/api/lessons/${l.id}/calendar.ics">Calendário</a></div>`;
 }
 function lessonForm(roomId,lesson){
  const tomorrow=new Date(Date.now()+86400000);
  const targetRoomId=lesson?.room_id || roomId;
  const targetRoom=S.rooms.find(r=>r.id===targetRoomId);
  const allStaff=S.teamMembers?.length?S.teamMembers:(S.users?.filter(u=>['admin','teacher'].includes(u.role)&&u.active)||[]);
  const teachers=allStaff.filter(u=>u.staff_role!=='monitor');
  const monitors=allStaff.filter(u=>u.staff_role==='monitor'||u.staff_role==='teacher'||u.role==='teacher');
  const selectedTeacher=lesson?.teacher_id || targetRoom?.teacher_id || targetRoom?.created_by || S.user.id;
  const selectedMonitor=lesson ? (lesson.monitor_id || '') : (targetRoom?.monitor_id || '');
  const materialsUrl=lesson?.materials_url || '';
  const notesText=lesson?.notes || '';

  showModal(
    lesson ? 'Editar aulinha' : 'Nova aulinha',
    '',
    `<form data-form="lesson" ${lesson ? `data-id="${lesson.id}"` : ''}>
      <label>Turma
        <select name="room_id">${roomOptions(targetRoomId)}</select>
      </label>
      <label>Dia da aula
        <input name="day" type="date" min="${day(new Date())}" value="${lesson ? lesson.starts_at.slice(0,10) : day(tomorrow)}" required/>
      </label>
      <div class="form-grid">
        <label>Início
          <input name="start" type="time" value="${lesson ? lesson.starts_at.slice(11,16) : '10:00'}" required/>
        </label>
        <label>Fim
          <input name="end" type="time" value="${lesson ? lesson.ends_at.slice(11,16) : '11:00'}" required/>
        </label>
      </div>
      <div class="form-grid">
        <label>Professor(a)
          <select name="teacher_id">
            ${teachers.map(u => `<option value="${u.id}" ${u.id === selectedTeacher ? 'selected' : ''}>${e(u.name)}</option>`).join('')}
          </select>
        </label>
        <label>Monitor(a) (opcional)
          <select name="monitor_id">
            <option value="">Nenhum (somente professor)</option>
            ${monitors.map(u => `<option value="${u.id}" ${u.id === selectedMonitor ? 'selected' : ''}>${e(u.name)}</option>`).join('')}
          </select>
        </label>
      </div>

      <div class="lesson-materials-group">
        <label>Material (PDF, Imagem ou Link)
          <div class="lesson-material-input-wrap">
            <input type="text" name="materials_url" id="lesson-materials-url-input" value="${e(materialsUrl)}" placeholder="https://..."/>
            <label class="btn secondary media-upload-btn" tabindex="0">
              <span>${icon('attachment',16)} Anexar</span>
              <input type="file" id="lesson-material-file-input" accept=".pdf,application/pdf,image/*" hidden/>
            </label>
          </div>
        </label>
        <div id="lesson-material-status" class="lesson-material-status ${materialsUrl ? 'has-file' : ''}">
          ${materialsUrl ? `<span>✓ <a href="${e(materialsUrl)}" target="_blank" rel="noopener noreferrer">${e(materialsUrl)}</a></span>` : ''}
        </div>
      </div>

      <label>Notas da aula (opcional)
        <textarea name="notes" rows="3" maxlength="1000">${e(notesText)}</textarea>
      </label>

      ${!lesson ? `
        <label>Repetir semanalmente
          <select name="repeat_weeks">
            <option value="1">Só esta data</option>
            <option value="4">4 semanas</option>
            <option value="8">8 semanas</option>
            <option value="12">12 semanas</option>
          </select>
        </label>
      ` : ''}

      ${errorSlot}
      <button class="btn primary full" type="submit">${lesson ? 'Salvar' : 'Publicar'}</button>
    </form>
    ${lesson ? `<button class="text-link danger-link" data-action="cancel-lesson" data-id="${lesson.id}">Cancelar aulinha</button>` : ''}`
  );
 }
 let currentCarouselIndex = 0;
 function renderParentEventsCarousel(){
  if(!S.events || !S.events.length) return '';
  const now = new Date();
  const upcoming = S.events.filter(e => {
   try {
    return new Date(e.ends_at || e.starts_at) >= new Date(now.getTime() - 86400000);
   } catch {
    return true;
   }
  });
  if(!upcoming.length) return '';
  if(currentCarouselIndex >= upcoming.length) currentCarouselIndex = 0;

  return `
   <section class="parent-carousel-section" aria-label="Programações e Eventos">
     <div class="carousel-section-header">
       <div>
         <span class="carousel-section-eyebrow">EVENTOS</span>
         <h2 class="carousel-section-title">Próximos Encontros ✦</h2>
       </div>
       ${upcoming.length > 1 ? `
         <div class="carousel-controls-arrows">
           <button type="button" class="carousel-arrow-btn" data-action="carousel-prev" title="Evento anterior" aria-label="Anterior">‹</button>
           <button type="button" class="carousel-arrow-btn" data-action="carousel-next" title="Próximo evento" aria-label="Próximo">›</button>
         </div>
       ` : ''}
     </div>

     <div class="parent-carousel-viewport" id="parent-carousel-viewport">
       <div class="parent-carousel-track" id="parent-carousel-track" style="transform:translateX(-${currentCarouselIndex * 100}%);">
         ${upcoming.map((ev, index) => {
           const regCount = ev.registrations_count || 0;
           const cap = ev.max_capacity || 100;
           const spotsLeft = cap - regCount;
           const isRegistered = ev.user_registered_children && ev.user_registered_children.length > 0;
           const startDate = new Date(ev.starts_at);
           const dateBadge = new Intl.DateTimeFormat('pt-BR', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo'}).format(startDate).toUpperCase();
           const audLabel = ev.target_audience === 'kids' ? 'Kids (0 a 11)' : ev.target_audience === 'teens' ? 'Teens (12 a 17)' : 'Família';

           return `
             <div class="parent-carousel-slide ${index === currentCarouselIndex ? 'active' : ''}">
               <div class="carousel-slide-card">
                 <div class="carousel-slide-banner">
                   ${ev.banner_url ? `
                     <img src="${e(ev.banner_url)}" alt="${e(ev.title)}" class="carousel-banner-img" loading="lazy"/>
                   ` : `
                     <div class="carousel-banner-placeholder">
                       <span>LAGOINHA KIDS & TEENS</span>
                     </div>
                   `}
                   <div class="carousel-banner-top-badges">
                     <span class="carousel-category-pill">${e(ev.category)}</span>
                     <span class="carousel-date-pill">📅 ${dateBadge}</span>
                   </div>
                 </div>

                 <div class="carousel-slide-body">
                   <div class="carousel-title-row">
                     <h3 class="carousel-event-title">${e(ev.title)}</h3>
                     <span class="carousel-price-tag">${e(ev.price || 'Gratuito')}</span>
                   </div>

                   <p class="carousel-event-desc">${e(ev.description)}</p>

                   <div class="carousel-meta-row">
                     <span class="carousel-meta-pill">${icon('home', 14)} ${e(ev.location || 'Templo Lagoinha')}</span>
                     <span class="carousel-meta-pill">${icon('kids', 14)} ${audLabel}</span>
                     <span class="carousel-meta-pill ${spotsLeft <= 5 ? 'urgent' : ''}">
                       ${spotsLeft > 0 ? `🎟️ ${spotsLeft} vagas` : '❌ Esgotado'}
                     </span>
                   </div>

                   <div class="carousel-actions-row">
                     ${isRegistered ? `
                       <div class="carousel-registered-badge">
                         <span>✓ Inscrito!</span>
                         <button type="button" class="mini-button" data-action="cancel-event-reg" data-id="${ev.id}">Cancelar</button>
                       </div>
                     ` : `
                       <button type="button" class="btn primary carousel-cta-btn" data-action="register-event" data-id="${ev.id}" ${spotsLeft <= 0 ? 'disabled' : ''}>
                         ${spotsLeft <= 0 ? 'Esgotado' : 'Inscrever ✦'}
                       </button>
                     `}
                     <button type="button" class="btn secondary carousel-details-btn" data-page="events">
                       Ver mural
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           `;
         }).join('')}
       </div>
     </div>

     ${upcoming.length > 1 ? `
       <div class="carousel-dots-indicator">
         ${upcoming.map((_, i) => `
           <button type="button" class="carousel-dot ${i === currentCarouselIndex ? 'active' : ''}" data-action="carousel-goto" data-index="${i}" aria-label="Ir para evento ${i+1}"></button>
         `).join('')}
       </div>
     ` : ''}
   </section>
  `;
 }
 function parentHome(){
  const activeCurriculum = S.lessons.find(l=>l.theme&&l.theme.trim());
  const devCard = activeCurriculum?`<section class="devotional-card"><div class="devotional-header"><span class="devotional-tag">📖 DISCIPULADO FAMILIAR</span><span style="font-size:11px;color:#a1a1aa;">${e(activeCurriculum.room_name||'Salinha')}</span></div><div class="devotional-theme">${e(activeCurriculum.theme)}</div>${activeCurriculum.memory_verse?`<div class="devotional-verse-box"><div class="devotional-verse-text">"${e(activeCurriculum.memory_verse)}"</div></div>`:''}${activeCurriculum.family_question?`<div class="devotional-question-box"><strong>💬 Em família:</strong><p style="margin:4px 0 0 0;">${e(activeCurriculum.family_question)}</p></div>`:''}</section>`:'';
  const eventsCarousel = renderParentEventsCarousel();
  return `${title('Meus filhos','',`<button class="btn primary" data-action="new-child">${icon('plus',17)} Adicionar filho</button>`)}${eventsCarousel}${devCard}${S.children.length?`<div class="simple-family-grid">${S.children.map(ch=>`<article class="simple-child-card"><div class="person">${kidAvatar ? kidAvatar(ch,'big') : `<span class="kid-avatar big">${initials(ch.name)}</span>`}<div><h2>${childName(ch)}</h2><p>${age(ch.birthday)} anos${ch.status==='present'?' · Na salinha':''}</p>${ch.claim_code&&ch.status==='present'?`<div style="margin-top:6px;"><span class="claim-tag-badge">TAG: ${e(ch.claim_code)}</span></div>`:''}${ch.allergies?`<div style="margin-top:4px;"><span class="allergy-badge">⚠️ ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div style="margin-top:4px;"><span class="allergy-badge">${icon('health',14)} ${e(ch.medical_conditions)}</span></div>`:''}</div></div>${ch.status==='present'?`<div class="pickup-receipt"><span>Código de retirada</span><strong>${e(ch.claim_code||'Procure a equipe')}</strong></div>`:''}<div class="simple-child-actions"><button class="btn primary" data-action="child-lessons" data-id="${ch.id}">Aulinhas ${icon('arrow',16)}</button><button class="btn secondary" data-action="digital-id" data-id="${ch.id}">${icon('qrcode',16)} Carteirinha</button><button class="btn secondary" data-action="edit-child" data-id="${ch.id}">Editar</button></div><details class="child-extra"><summary>Mais opções</summary><button class="text-link" data-action="edit-child-avatar" data-id="${ch.id}">📷 Alterar foto</button><button class="text-link" data-action="family" data-id="${ch.id}">Responsáveis e autorizações</button><button class="text-link" data-action="child-history" data-id="${ch.id}">Histórico de presença</button><button class="text-link" data-action="notify" data-kind="pickup_ready" data-id="${ch.id}">Avisar que cheguei</button><button class="text-link danger-link" data-action="archive-child" data-id="${ch.id}">Arquivar</button></details></article>`).join('')}</div>`:empty('Nenhum filho cadastrado','')}`;
 }
 function parentLessons(){
  const ch=selectedChild();
  const cards=S.lessons.map(l=>{
   const compatible=ch&&ageAt(ch.birthday,l.starts_at)>=l.min_age&&ageAt(ch.birthday,l.starts_at)<=l.max_age;
   const confirmed=ch&&l.confirmed_children.includes(ch.id);const waiting=ch&&(l.waiting_children||[]).includes(ch.id);
    return `<article class="lesson-card ${confirmed?'confirmed':''}">
      <span class="lesson-day">${dateLabel(l.starts_at)}</span>
      <h2>${e(l.room_name)}</h2>
      <div class="lesson-time">${icon('clock',18)} ${time(l.starts_at)} – ${time(l.ends_at)}</div>
      <p>${l.min_age} a ${l.max_age} anos · ${l.available} vagas</p>
      <div class="lesson-staff-row">
        <span class="lesson-staff-tag">👨‍🏫 ${e(l.teacher_name || 'Professor(a)')}</span>
        ${l.monitor_name ? `<span class="lesson-staff-tag">🤝 ${e(l.monitor_name)}</span>` : ''}
      </div>
      ${l.materials_url ? `
        <a href="${e(l.materials_url)}" target="_blank" rel="noopener noreferrer" class="lesson-material-btn">
          ${icon('download', 15)} <span>Materiais da Aula</span>
        </a>
      ` : ''}
      ${l.notes ? `
        <div class="lesson-notes-card">
          <p>${e(l.notes)}</p>
        </div>
      ` : ''}
      ${calendarLinks(l)}
      ${l.theme?`<div style="margin:6px 0;padding:6px 10px;background:#27272a;border-radius:6px;font-size:12px;color:#f4f4f5;">📖 <strong>Tema:</strong> ${e(l.theme)}</div>`:''}
      ${confirmed?`<div class="confirmed-label">${icon('check',16)} Presença confirmada</div><button class="btn secondary full" data-action="cancel-presence" data-id="${l.id}" data-child="${ch.id}">Cancelar</button>`:waiting?`<p class="soft-info">Na lista de espera.</p><button class="btn secondary full" data-action="leave-waitlist" data-id="${l.id}" data-child="${ch.id}">Sair da lista</button>`:!ch?`<button class="btn primary full" data-action="new-child">Cadastrar filho</button>`:!compatible?'<p class="soft-info">Faixa etária diferente.</p>':`<button class="btn primary full" data-action="${l.available===0?'join-waitlist':'confirm-presence'}" data-id="${l.id}" data-child="${ch.id}">${l.available===0?'Lista de espera':'Confirmar presença'} ${icon('check',16)}</button>`}
    </article>`;
  }).join('');
  return `${title('Aulinhas','',`<button class="btn secondary" data-action="refresh-school">Atualizar</button>`)}${ch?`<div class="lesson-toolbar"><label>Filho<select id="lesson-child">${S.children.map(c=>`<option value="${c.id}" ${c.id===ch.id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label></div>`:''}${cards?`<div class="lesson-cards">${cards}</div>`:empty('Nenhum horário publicado','')}`;
 }
 function roomsPage(){
  const canManage=S.user.role==='admin'||S.user.role==='teacher';
  return `${title('Turmas','',canManage?`<button class="btn primary" data-action="new-room">${icon('plus',17)} Criar turma</button>`:'')}${S.rooms.length?`<div class="simple-room-grid">${S.rooms.map(r=>{
   const lessons=S.lessons.filter(l=>l.room_id===r.id);
   return `<article class="simple-room-card panel">
     ${r.cover_url?`
       <div class="room-card-cover-wrap">
         <img src="${e(r.cover_url)}" alt="${e(r.name)}" class="room-card-cover-img" loading="lazy"/>
         <div class="room-card-cover-overlay"></div>
         <span class="room-card-age-tag">${r.min_age} a ${r.max_age} anos</span>
       </div>
     `:`
       <div class="room-card-cover-wrap placeholder">
         <span class="room-symbol" style="background:${r.color||'#f4f4f5'}">${icon('rooms',24)}</span>
         <span class="room-card-age-tag">${r.min_age} a ${r.max_age} anos</span>
       </div>
     `}
     <div class="room-card-body">
       <header>
         <div class="room-header-title">
           <h2>${e(r.name)}</h2>
           <p>${r.min_age} a ${r.max_age} anos · ${r.capacity} vagas</p>
         </div>
         ${(S.user.role==='admin'||S.user.platform_admin)?`
           <div class="room-card-actions">
             <button type="button" class="room-action-btn" data-action="edit-room" data-id="${r.id}" title="Editar">${icon('settings',14)} <span>Editar</span></button>
             <button type="button" class="room-action-btn danger" data-action="delete-room" data-id="${r.id}" title="Excluir">${icon('close',14)} <span>Excluir</span></button>
           </div>
         `:''}
       </header>
        <div class="room-staff-info-row">
          <span class="room-staff-pill">👨‍🏫 <strong>${e(r.teacher_name || r.owner_name || 'A definir')}</strong></span>
          ${r.monitor_name ? `<span class="room-staff-pill">🤝 <strong>${e(r.monitor_name)}</strong></span>` : ''}
        </div>
       <div class="simple-room-actions">
         ${(S.user.role!=='monitor'&&S.user.staff_role!=='monitor')?`<button class="btn primary" data-action="new-lesson" data-id="${r.id}">${icon('plus',16)} Publicar horário</button>`:''}
         <button class="btn secondary" data-action="room-students" data-id="${r.id}">Alunos (${r.total})</button>
       </div>
       <section class="room-schedule">
         <h3>Próximas aulinhas</h3>
         ${lessons.length?lessons.map(l=>{
           const isMon = S.user.role==='monitor'||S.user.staff_role==='monitor';
           const isMyMon = isMon && (l.monitor_id===S.user.id || r.monitor_id===S.user.id);
           return `<div class="schedule-row">
             <div>
               <strong>${dateLabel(l.starts_at)}</strong>
               <span>${time(l.starts_at)} – ${time(l.ends_at)} · ${l.confirmed_count||0} conf.</span>
               ${isMyMon ? `
                 <div style="margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                   ${l.monitor_status==='confirmed'?`<span class="badge" style="background:#059669;color:#fff;font-size:10px;">✓ Presença confirmada</span>`:''}
                   ${l.monitor_status==='declined'?`<span class="badge" style="background:#dc2626;color:#fff;font-size:10px;">✕ Indisponível</span>`:''}
                   ${(!l.monitor_status||l.monitor_status==='pending')?`
                     <button type="button" class="mini-button" data-action="monitor-respond" data-id="${l.id}" data-status="confirmed" style="background:#059669;color:#fff;font-size:10px;padding:2px 8px;">✓ Confirmar Presença</button>
                     <button type="button" class="mini-button secondary" data-action="monitor-respond" data-id="${l.id}" data-status="declined" style="color:#dc2626;font-size:10px;padding:2px 8px;">✕ Declinar</button>
                   `:''}
                 </div>
               ` : ''}
             </div>
             <div style="display:flex;gap:6px;align-items:center;">
               <button class="mini-button" data-action="lesson-curriculum" data-id="${l.id}">📖 Tema & Materiais</button>
               <button class="mini-button" data-action="lesson-roster" data-id="${l.id}">Chamada</button>
               ${!isMon?`<button class="icon-button" data-action="edit-lesson" data-id="${l.id}" aria-label="Editar">${icon('settings',16)}</button>`:''}
             </div>
           </div>`;
         }).join(''):'<p class="muted-note">Sem horários publicados.</p>'}
       </section>
     </div>
   </article>`;
  }).join('')}</div>`:empty('Nenhuma turma cadastrada','')}`;
 }
 function rosterRows(children,lesson){
   const today=day(new Date());
    return children.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${children.map(ch=>{const p=S.activePaging?.find(x=>x.child_id===ch.id);const pagingBadge=p?(p.status==='on_my_way'?`<div style="margin-top:3px;"><span style="display:inline-block;background:#22c55e;color:#000000;font-weight:700;font-size:10px;padding:2px 7px;border-radius:9999px;">🏃 Pais a caminho (${e(p.ack_user_name||'Confirmado')})</span></div>`:`<div style="margin-top:3px;"><span style="display:inline-block;background:#ef4444;color:#ffffff;font-weight:700;font-size:10px;padding:2px 7px;border-radius:9999px;">${icon('announcements',16)} Telão Ativo</span></div>`):'';return `<tr><td><div class="person">${kidAvatar?kidAvatar(ch):`<span class="kid-avatar">${initials(ch.name)}</span>`}<div><strong>${childName(ch)}</strong><small>${age(ch.birthday)} anos</small>${ch.claim_code&&ch.status==='present'?`<div><span class="claim-tag-badge">TAG: ${e(ch.claim_code)}</span></div>`:''}${pagingBadge}${ch.allergies?`<div><span class="allergy-badge">⚠️ ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div><span class="allergy-badge">${icon('health',14)} ${e(ch.medical_conditions)}</span></div>`:''}</div></div></td><td><span class="status ${ch.status}">${lesson&&lesson.starts_at.slice(0,10)!==today?'Confirmado':statusName[ch.status]}</span></td><td><div class="row-actions"><button class="mini-button" data-action="attendance" data-id="${ch.id}" ${lesson&&lesson.starts_at.slice(0,10)!==today?'disabled':''}>${ch.status==='present'?'Registrar saída':'Marcar chegada'}</button><button class="mini-button" data-action="digital-id" data-id="${ch.id}" title="Carteirinha">${icon('identity',17)}</button><button class="mini-button" data-action="paging-call" data-id="${ch.id}" title="Telão">${icon('announcements',16)} Telão</button><button class="mini-button" data-action="student-options" data-id="${ch.id}">Opções</button></div></td></tr>`;}).join('')}</tbody></table></div>`:empty('Nenhum aluno confirmado','');
 }
 function attendancePage(){
  const lesson=S.lessons.find(l=>l.id===S.selectedLesson);
  if(!lesson)S.selectedLesson=null;
  const children=lesson?S.children.filter(ch=>lesson.confirmed_children.includes(ch.id)):S.children;
  const lessonDetails = lesson ? `
    <div class="attendance-lesson-details-card" style="margin-bottom:12px;padding:12px 16px;background:#18181b;color:#ffffff;border:1px solid #27272a;border-radius:12px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:space-between;">
      <div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
          <span style="font-size:12px;font-weight:700;color:#ffffff;background:#27272a;padding:2px 8px;border-radius:6px;">👨‍🏫 ${e(lesson.teacher_name || 'Equipe')}</span>
          ${lesson.monitor_name ? `<span style="font-size:12px;font-weight:700;color:#e4e4e7;background:#27272a;padding:2px 8px;border-radius:6px;">🤝 ${e(lesson.monitor_name)}</span>` : ''}
        </div>
        ${lesson.notes ? `<p style="font-size:12px;color:#d4d4d8;margin:2px 0 0 0;">${e(lesson.notes)}</p>` : ''}
      </div>
      ${lesson.materials_url ? `
        <a href="${e(lesson.materials_url)}" target="_blank" rel="noopener noreferrer" class="mini-button" style="background:#ffffff;color:#09090b;font-weight:700;text-decoration:none;">
          ${icon('download', 14)} Materiais
        </a>
      ` : ''}
    </div>
  ` : '';
  const guestsSection=S.activeGuests&&S.activeGuests.length?`<section class="panel" style="margin-top:16px;"><h3>Visitantes (${S.activeGuests.length})</h3><div class="table-wrap"><table><thead><tr><th>Criança</th><th>Responsável</th><th>Saída</th><th>Status</th></tr></thead><tbody>${S.activeGuests.map(g=>`<tr><td><strong>${e(g.child_name)}</strong><br><small>${g.child_age} anos${g.allergies?` · ⚠️ ${e(g.allergies)}`:''}</small></td><td>${e(g.guardian_name)}<br><small>${g.guardian_phone?`<span>Telefone: ${e(g.guardian_phone)}</span>`:''}</small></td><td><button class="mini-button" data-action="guest-checkout" data-id="${g.id}">Registrar saída</button></td><td><span class="status present">Na Salinha</span></td></tr>`).join('')}</tbody></table></div></section>`:'';
  return `${title('Chamada','',`<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn primary" data-action="guest-checkin">${icon('plus',16)} Check-in Visitante</button>${lesson?`<button class="btn secondary" data-action="add-lesson-student" data-id="${lesson.id}">${icon('plus',16)} Adicionar aluno</button>`:''}</div>`)}
  <div class="scanner-desk-bar">
    <div class="scanner-desk-info">
      <span class="scanner-desk-icon">🔍</span>
      <div>
        <strong>Buscar ou check-in rápido:</strong>
      </div>
    </div>
    <div class="scanner-desk-action">
      <input id="desk-barcode-input" aria-label="Código da carteirinha ou nome da criança" type="text" placeholder="Digite o nome ou código da criança..." autocomplete="off" />
      <button type="button" class="btn primary" data-action="desk-barcode-search">Buscar aluno</button>
    </div>
  </div>
  ${lessonDetails}
  <section class="panel"><div class="lesson-toolbar inside"><label>Aulinha<select id="lesson-filter"><option value="">Todos os alunos</option>${S.lessons.map(l=>`<option value="${l.id}" ${l.id===S.selectedLesson?'selected':''}>${e(l.room_name)} · ${dateLabel(l.starts_at)} · ${time(l.starts_at)}</option>`).join('')}</select></label></div>${rosterRows(children,lesson)}</section>${guestsSection}`;
 }
 function studentCardsList(children, room){
  if(!children.length){
    return room ? `
      <div class="empty room-empty-card">
        <div class="empty-icon-wrap">${icon('rooms', 36)}</div>
        <h3>Nenhum aluno na turma ${e(room.name)}</h3>
        <div class="empty-actions" style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
          <button type="button" class="btn primary" data-action="new-child" data-room="${room.id}">
            ${icon('plus', 16)} Matricular aluno
          </button>
          <button type="button" class="btn secondary" data-action="select-room-filter" data-id="all">
            Todas as turmas
          </button>
        </div>
      </div>
    ` : empty('Nenhum aluno cadastrado', '');
  }

  const presentCount = children.filter(ch=>ch.status==='present').length;

  return `
    <div class="room-students-list-header">
      <div class="roster-stats-pill">
        <span>Alunos matriculados: <strong>${children.length}</strong></span>
        <span class="meta-dot">·</span>
        <span style="color:#15803d;font-weight:700;">🟢 ${presentCount} na salinha agora</span>
      </div>
    </div>
    <div class="room-students-grid">
      ${children.map(ch=>{
        const p = S.activePaging?.find(x=>x.child_id===ch.id);
        const pagingBadge = p ? (
          p.status==='on_my_way'
            ? `<div class="student-paging-status green">🏃 Pais a caminho (${e(p.ack_user_name||'Confirmado')})</div>`
            : `<div class="student-paging-status red">${icon('announcements',16)} Telão Ativo no Auditório</div>`
        ) : '';
        const parentPhone = ch.parent_phone || '';

        return `
          <article class="room-student-card panel">
            <div class="student-card-top">
              <div class="person">
                ${kidAvatar ? kidAvatar(ch, 'big') : `<span class="kid-avatar big" style="background:${ch.color||'#09090b'};">${initials(ch.name)}</span>`}
                <div class="student-card-bio">
                  <div class="student-name-row">
                    <h3>${childName(ch)}</h3>
                    <span class="status-pill ${ch.status}">
                      ${ch.status==='present'?'🟢 Na salinha':ch.status==='departed'?'🏁 Saída registrada':'⚪ Não chegou'}
                    </span>
                  </div>
                  <p class="student-meta">${age(ch.birthday)} anos · Nasc. ${ch.birthday.slice(0,10).split('-').reverse().join('/')} · <span class="room-name-tag">${e(ch.room_name||room?.name||'Salinha')}</span></p>
                  ${ch.claim_code && ch.status==='present' ? `<div class="claim-tag-highlight">ETIQUETA DE SEGURANÇA · CÓDIGO: <strong>${e(ch.claim_code)}</strong></div>` : ''}
                  ${pagingBadge}
                </div>
              </div>
            </div>

            ${(ch.allergies || ch.medical_conditions || ch.emergency_medication || ch.special_needs || ch.authorized_pickups) ? `
              <details class="student-health-box"><summary>${ch.allergies?'Alergia registrada · conferir orientações':'Orientações de saúde ou retirada · conferir'}</summary>
                ${ch.allergies ? `<span class="allergy-badge warning">⚠️ <strong>ALERGIA:</strong> ${e(ch.allergies)}</span>` : ''}
                ${ch.medical_conditions ? `<span class="allergy-badge medical">${icon('health',14)} <strong>SAÚDE:</strong> ${e(ch.medical_conditions)}</span>` : ''}
                ${ch.emergency_medication ? `<span class="allergy-badge med">💊 <strong>MEDICAÇÃO:</strong> ${e(ch.emergency_medication)}</span>` : ''}
                ${ch.special_needs ? `<span class="allergy-badge special">♿ <strong>CUIDADO:</strong> ${e(ch.special_needs)}</span>` : ''}
                ${ch.authorized_pickups ? `<div class="pickup-text"><span>👥 Autorizados para buscar:</span> <strong>${e(ch.authorized_pickups)}</strong></div>` : ''}
              </details>
            ` : ''}

            <div class="student-family-info">
              <span>Responsável: <strong>${e(ch.parent_name || 'Aguardando vínculo')}</strong></span>
              ${parentPhone ? `<span>📞 ${e(parentPhone)}</span>` : ''}
            </div>

            <div class="student-actions-bar">
              <button type="button" class="btn ${ch.status==='present'?'secondary':'primary'} btn-sm student-btn-main" data-action="attendance" data-id="${ch.id}">
                ${ch.status==='present' ? `${icon('out', 16)} Registrar saída` : `${icon('check', 16)} Marcar chegada`}
              </button>
              <button type="button" class="btn secondary btn-sm" data-action="digital-id" data-id="${ch.id}" title="Carteirinha Digital com QR Code">
                ${icon('qrcode', 16)} <span>Carteirinha</span>
              </button>
              <button type="button" class="btn secondary btn-sm" data-action="paging-call" data-id="${ch.id}" title="Chamar responsável no Telão do Auditório e celular">
                ${icon('speaker', 16)} <span>Telão</span>
              </button>
              <button type="button" class="btn secondary btn-sm" data-action="transfer-child" data-id="${ch.id}" title="Mudar de turma / Transferir aluno">
                🔄 <span>Mudar turma</span>
              </button>
              <button type="button" class="btn secondary btn-sm" data-action="student-options" data-id="${ch.id}" title="Editar cadastro, foto e opções">
                ${icon('settings', 16)} <span>Opções</span>
              </button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
 }
 function studentsPage(){
  const rid=Number(S.room),room=S.rooms.find(r=>r.id===rid);
  const confirmed=new Set(S.lessons.filter(l=>l.room_id===rid).flatMap(l=>l.confirmed_children));
  const isSpecificRoom = Boolean(room);
  const children = isSpecificRoom
    ? S.children.filter(ch=>ch.room_id===rid||confirmed.has(ch.id))
    : (S.room==='all' ? S.children : S.children.filter(ch=>String(ch.room_id)===S.room));

  if(isSpecificRoom){
    return `
      <div class="room-students-page">
        <div class="room-students-nav">
          <button type="button" class="btn secondary room-back-btn" data-page="rooms">
            ${icon('back', 16)} <span>Voltar para Turmas</span>
          </button>
          <div class="room-selector-box">
            <label for="room-select-filter" class="room-selector-label">Alternar turma:</label>
            <select id="room-select-filter" class="room-select-filter">
              <option value="all">Todas as turmas (${S.children.length})</option>
              ${S.rooms.map(r=>`<option value="${r.id}" ${r.id===rid?'selected':''}>${e(r.name)} (${S.children.filter(c=>c.room_id===r.id).length})</option>`).join('')}
            </select>
          </div>
        </div>

        <section class="room-hero-card panel">
          <div class="room-hero-content">
            <div class="room-hero-icon">${icon('rooms', 26)}</div>
            <div class="room-hero-info">
              <h2>${e(room.name)}</h2>
              <p class="room-hero-meta">
                <span><strong>Faixa etária:</strong> ${room.min_age} a ${room.max_age} anos</span>
                <span class="meta-dot">·</span>
                <span><strong>Capacidade:</strong> ${room.capacity} vagas por aula</span>
                <span class="meta-dot">·</span>
                <span><strong>Responsável:</strong> ${e(room.owner_name||'Equipe Lagoinha Kids')}</span>
              </p>
            </div>
          </div>
          <div class="room-hero-actions">
            <button type="button" class="btn primary" data-action="new-child" data-room="${room.id}">
              ${icon('plus', 16)} Matricular aluno nesta turma
            </button>
          </div>
        </section>

        ${studentCardsList(children, room)}
      </div>
    `;
  }

  // All rooms view
  return `
    <div class="room-students-page">
      ${title(
        'Alunos',
        S.user.role==='admin' ? 'Gerencie cadastros, turmas e vínculos familiares.' : 'Alunos matriculados nas suas turmas.',
        `<button class="btn primary" data-action="new-child">${icon('plus', 17)} Adicionar aluno</button>`
      )}
      <div class="room-filter-chips-wrap">
        <button type="button" class="filter-chip ${S.room==='all'?'active':''}" data-action="select-room-filter" data-id="all">
          Todas as turmas (${S.children.length})
        </button>
        ${S.rooms.map(r=>`
          <button type="button" class="filter-chip ${String(r.id)===S.room?'active':''}" data-action="select-room-filter" data-id="${r.id}">
            ${e(r.name)} (${S.children.filter(c=>c.room_id===r.id).length})
          </button>
        `).join('')}
      </div>
      ${studentCardsList(children, null)}
    </div>
  `;
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
  if(action==='carousel-prev'){
   const upcomingCount=S.events?S.events.length:0;
   if(upcomingCount>1){currentCarouselIndex=(currentCarouselIndex-1+upcomingCount)%upcomingCount;render();}
   return true;
  }
  if(action==='carousel-next'){
   const upcomingCount=S.events?S.events.length:0;
   if(upcomingCount>1){currentCarouselIndex=(currentCarouselIndex+1)%upcomingCount;render();}
   return true;
  }
  if(action==='carousel-goto'){
   currentCarouselIndex=Number(el.dataset.index)||0;
   render();
   return true;
  }
  if(action==='clear-child-form-avatar'){
   const prev=document.getElementById('child-avatar-preview-box');
   const input=document.getElementById('child-avatar-url-input');
   const clearBtn=document.getElementById('clear-child-avatar-form-btn');
   if(input)input.value='';
   if(prev)prev.innerHTML=`<span style="font-size:22px;color:#a1a1aa;">${icon('kids', 28)}</span>`;
   if(clearBtn)clearBtn.hidden=true;
   toast('Foto removida.');
   return true;
  }
  if(action==='join-waitlist'||action==='leave-waitlist'){await api(action==='join-waitlist'?`/lessons/${id}/waitlist`:`/lessons/${id}/waitlist/${el.dataset.child}`,{method:action==='join-waitlist'?'POST':'DELETE',...(action==='join-waitlist'?{body:{child_id:Number(el.dataset.child)}}:{})});await changed(action==='join-waitlist'?'Você entrou na lista de espera.':'Você saiu da lista.');return true;}
  if(action==='refresh-school'){await changed('Horários atualizados.');return true;}
  if(action==='open-scanner'){return true;}
  if(action==='desk-barcode-search'){
    const inp=document.getElementById('desk-barcode-input'),value=inp?.value.trim();
    if(!value)return true;
    const code=value.toUpperCase().match(/^LK-?0*(\d+)$/);
    const rows=S.children.filter(ch=>code?ch.id===Number(code[1]):ch.name.toLowerCase().includes(value.toLowerCase())||String(ch.id)===value).slice(0,20);
    if(inp)inp.value='';
    showModal('Resultado da busca','Selecione a criança e confira o responsável antes de registrar a presença.',rows.length?rows.map(ch=>`<section class="panel"><strong>${e(ch.name)}</strong><p>${e(ch.room_name||'Sem turma')}</p><button type="button" class="btn primary" data-action="attendance" data-id="${ch.id}">Conferir ${ch.status==='present'?'saída':'entrada'}</button></section>`).join(''):'<p>Nenhum aluno encontrado. Confira o nome ou código.</p>');
    return true;
  }
    const lesson=S.lessons.find(l=>l.id===id),room=S.rooms.find(r=>r.id===id);
  if(action==='new-child'){
    if(S.user.role!=='parent'&&!S.rooms.length){toast('Crie uma turma primeiro.');return true;}
    const defRoom=el.dataset.room?Number(el.dataset.room):(Number(S.room)||null);
    childForm(null,defRoom);
    return true;
  }
  if(action==='edit-child'){childForm(ch);return true;}
  if(action==='edit-user'){
   const user=S.users.find(u=>u.id===id);
   showModal('Gerenciar usuário',e(user.name),`<form data-form="school-user" data-id="${id}"><label>Nome<input name="name" required minlength="2" maxlength="100" value="${e(user.name)}"/></label><label>E-mail<input type="email" name="email" required value="${e(user.email)}"/></label><label>Perfil<select name="role">${[['admin','Administração'],['teacher','Professor(a)'],['parent','Responsável']].map(([value,label])=>`<option value="${value}" ${user.role===value?'selected':''}>${label}</option>`).join('')}</select></label><label class="checkbox-label"><input type="checkbox" name="active" ${user.active?'checked':''}/>Acesso ativo</label><fieldset><legend>Turmas sob responsabilidade do professor</legend>${S.rooms.map(r=>`<label class="checkbox-label"><input type="checkbox" name="rooms" value="${r.id}" ${user.rooms.includes(r.id)?'checked':''}/>${e(r.name)}</label>`).join('')}</fieldset><details class="child-extra"><summary>Definir nova senha</summary><label>Nova senha inicial<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" placeholder="Deixe vazio para manter a senha"/></label></details>${errorSlot}<button class="btn primary full" type="submit">Salvar usuário</button></form>`);return true;
  }
  if(action==='clear-room-cover'){setRoomCoverPreview('');toast('Capa removida.');return true;}
  if(action==='toggle-room-presets'){const d=document.getElementById('room-presets-drawer');if(d)d.hidden=!d.hidden;return true;}
  if(action==='toggle-room-url'){const d=document.getElementById('room-url-drawer');if(d)d.hidden=!d.hidden;return true;}
  if(action==='pick-room-preset'){setRoomCoverPreview(el.dataset.url);document.getElementById('room-presets-drawer')?.setAttribute('hidden','');toast('Capa sugerida aplicada!');return true;}
  if(action==='apply-room-url'){const val=document.getElementById('room-url-input-field')?.value?.trim();if(val && (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/'))){setRoomCoverPreview(val);document.getElementById('room-url-drawer')?.setAttribute('hidden','');toast('Link da capa aplicado!');}else{toast('Informe uma URL válida (ex: https://...).',true);}return true;}
  if(action==='child-lessons'){S.selectedChild=id;if(navigateTo)navigateTo('lessons');else{S.page='lessons';render();}return true;}
  if(action==='new-room'){roomForm();return true;}
  if(action==='edit-room'){roomForm(room);return true;}
  if(action==='new-lesson'||action==='edit-lesson'){
   if(S.user.role==='monitor'||S.user.staff_role==='monitor'){
    toast('Apenas professores e coordenação podem cadastrar ou editar aulinhas.');
    return true;
   }
   if(action==='new-lesson'){lessonForm(id);return true;}
   if(action==='edit-lesson'){lessonForm(lesson.room_id,lesson);return true;}
  }
  if(action==='monitor-respond'){
   const status=el.dataset.status;
   await api(`/lessons/${id}/presence-response`,{method:'POST',body:{status}});
   await changed(status==='confirmed'?'Presença confirmada com sucesso!':'Indisponibilidade informada à coordenação.');
   return true;
  }
  if(action==='lesson-roster'){S.selectedLesson=id;if(navigateTo)navigateTo('attendance');else{S.page='attendance';render();}return true;}
  if(action==='room-students'||action==='filter-room'){
    S.room=String(id);
    S.selectedLesson=null;
    if(navigateTo)navigateTo('children',false,true);
    else{S.page='children';render();}
    return true;
  }
  if(action==='select-room-filter'){
    S.room=el.dataset.id||'all';
    render();
    return true;
  }
  if(action==='transfer-child'){
    const c=S.children.find(x=>x.id===id);
    if(!c)return true;
    showModal('Mudar de turma',`${childName(c)} · ${age(c.birthday)} anos`,`<form data-form="transfer-child" data-id="${c.id}"><label>Nova turma<select name="room_id" required>${roomOptions(c.room_id)}</select></label><p class="soft-info">Ao mudar de turma, o aluno passará a constar na lista da nova salinha e nas próximas aulinhas dessa turma.</p>${errorSlot}<button class="btn primary full" type="submit">Salvar transferência</button></form>`);
    return true;
  }
  if(action==='confirm-presence'||action==='cancel-presence'){
   if(S.busy)return true;S.busy=true;el.disabled=true;
   try{if(action==='confirm-presence')await api(`/lessons/${id}/presence`,{method:'POST',body:{child_id:Number(el.dataset.child)}});else await api(`/lessons/${id}/presence/${el.dataset.child}`,{method:'DELETE'});await changed(action==='confirm-presence'?'Presença confirmada para a aulinha.':'Confirmação cancelada.');}
   finally{S.busy=false;if(el.isConnected)el.disabled=false;}
   return true;
  }
  if(action==='student-options'){
   showModal(childName(ch),'O que você precisa fazer?',`<div class="student-menu">
     <button class="btn secondary full" data-action="edit-child" data-id="${id}">${icon('settings',16)} Editar cadastro completo</button>
     <button class="btn secondary full" data-action="edit-child-avatar" data-id="${id}">${icon('camera',16)} Alterar foto do aluno</button>
     <button class="btn secondary full" data-action="transfer-child" data-id="${id}">🔄 Mudar de turma (Transferir)</button>
     <button class="btn secondary full" data-action="digital-id" data-id="${id}">${icon('qrcode',16)} Carteirinha Digital</button>
     <button class="btn secondary full" data-action="paging-call" data-id="${id}">${icon('speaker',16)} Chamar no Telão / Celular</button>
     <button class="btn secondary full" data-action="notify" data-kind="please_pickup" data-id="${id}">${icon('bell',16)} Avisar responsável no app</button>
     ${S.user.role==='admin'?`
       <button class="btn secondary full" data-action="link-guardian" data-id="${id}">${icon('kids',16)} Vincular responsável</button>
       <button class="text-link danger-link" data-action="archive-child" data-id="${id}">Arquivar cadastro do aluno</button>
     `:''}
   </div>`);
   return true;
  }
  if(action==='cancel-lesson'){showModal('Cancelar aulinha?','Os responsáveis com presença confirmada receberão um aviso.',`<form data-form="cancel-lesson" data-id="${id}"><label class="checkbox-label"><input type="checkbox" required/>Confirmo o cancelamento.</label>${errorSlot}<button class="btn danger full" type="submit">Cancelar aulinha</button></form>`);return true;}
  if(action==='delete-room'||action==='archive-room'){
   const r=S.rooms.find(x=>x.id===id);
   const rName=r?`"${e(r.name)}"`:'a turma';
   showModal('Excluir turma?',`Deseja realmente excluir ${rName}?`,`<form data-form="delete-room" data-id="${id}"><p class="soft-info">A turma será excluída das turmas ativas. As aulinhas futuras sem presenças confirmadas serão canceladas. O histórico de presenças anteriores permanece seguro.</p><label class="checkbox-label" style="margin:16px 0 18px 0;display:flex;align-items:center;gap:10px;cursor:pointer;"><input type="checkbox" required style="width:18px;height:18px;cursor:pointer;accent-color:#09090b;"/><span style="font-weight:600;font-size:13.5px;">Confirmo a exclusão desta turma.</span></label>${errorSlot}<div style="display:flex;gap:10px;margin-top:14px;"><button type="button" class="btn secondary" onclick="document.getElementById('modal').close()">Cancelar</button><button type="submit" class="btn danger" style="flex:1;">${icon('close',15)} Excluir turma</button></div></form>`);return true;
  }
  if(action==='archive-child'){
   showModal('Arquivar cadastro?','O cadastro sairá das listas ativas.',`<form data-form="archive-child" data-id="${id}"><label class="checkbox-label"><input type="checkbox" required/>Confirmo o arquivamento.</label>${errorSlot}<button class="btn danger full" type="submit">Arquivar</button></form>`);return true;
  }
  if(action==='add-lesson-student'){
   const candidates=S.children.filter(c=>!lesson.confirmed_children.includes(c.id)&&ageAt(c.birthday,lesson.starts_at)>=lesson.min_age&&ageAt(c.birthday,lesson.starts_at)<=lesson.max_age);
   showModal('Adicionar aluno à chamada',`${e(lesson.room_name)} · ${dateLabel(lesson.starts_at)}`,candidates.length?`<form data-form="lesson-student" data-id="${id}"><label>Aluno<select name="child_id">${candidates.map(c=>`<option value="${c.id}">${childName(c)}</option>`).join('')}</select></label>${errorSlot}<button class="btn primary full" type="submit">Confirmar participação</button></form>`:'<p class="soft-info">Não há outros alunos compatíveis nas suas turmas. A família pode cadastrar o filho e confirmar por sua própria conta.</p>');return true;
  }
  if(action==='lesson-curriculum'){
   const l=S.lessons.find(x=>x.id===id);
   const curr=await api(`/lessons/${id}/curriculum`).catch(()=>({theme:l?.theme||'',memory_verse:l?.memory_verse||'',family_question:l?.family_question||'',materials_url:l?.materials_url||''}));
   const isMonitor=S.user.role==='monitor'||S.user.staff_role==='monitor';
   if(isMonitor){
    showModal('Tema & Materiais da Aulinha',l?`${e(l.room_name)} · ${dateLabel(l.starts_at)}`:'Salinha',`
     <div class="lesson-curriculum-viewer" style="display:flex;flex-direction:column;gap:14px;padding:4px 0;">
      <div style="background:#27272a;border-radius:10px;padding:12px 14px;">
       <span style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">📖 Tema da Aula</span>
       <h3 style="margin:4px 0 0;font-size:16px;color:#f4f4f5;">${e(curr.theme||l?.theme||'Tema ainda não publicado pelo professor')}</h3>
      </div>
      ${(curr.memory_verse||l?.memory_verse)?`
       <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px 14px;">
        <span style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Versículo para Memorizar</span>
        <p style="margin:4px 0 0;font-size:14px;color:#e4e4e7;font-style:italic;">"${e(curr.memory_verse||l?.memory_verse)}"</p>
       </div>
      `:''}
      ${(curr.family_question||l?.family_question)?`
       <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:12px 14px;">
        <span style="font-size:11px;font-weight:700;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.05em;">Pergunta para a Família (Discipulado)</span>
        <p style="margin:4px 0 0;font-size:13.5px;color:#d4d4d8;">${e(curr.family_question||l?.family_question)}</p>
       </div>
      `:''}
      ${(curr.materials_url||l?.materials_url)?`
       <div style="margin-top:4px;">
        <a href="${e(curr.materials_url||l?.materials_url)}" target="_blank" rel="noopener noreferrer" class="btn primary full" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;padding:12px;font-weight:700;">
         ${icon('download',18)} Acessar Materiais da Aula
        </a>
       </div>
      `:'<p class="soft-info" style="text-align:center;">Nenhum link de materiais anexado para esta aula.</p>'}
      ${(l&&(l.monitor_id===S.user.id||l.monitor_name===S.user.name))?`
       <div style="border-top:1px solid #27272a;padding-top:12px;margin-top:4px;text-align:center;">
        <span style="display:block;font-size:12px;color:#a1a1aa;margin-bottom:8px;">Sua presença como monitor nesta aula:</span>
        <div style="display:flex;gap:8px;justify-content:center;">
         <button type="button" class="btn primary" data-action="monitor-respond" data-id="${l.id}" data-status="confirmed" style="background:#059669;">✓ Confirmar Presença</button>
         <button type="button" class="btn secondary" data-action="monitor-respond" data-id="${l.id}" data-status="declined" style="color:#ef4444;">✕ Informar Indisponibilidade</button>
        </div>
       </div>
      `:''}
     </div>
    `);
    return true;
   }
   showModal('Discipulado Familiar & Tema da Aulinha',l?`${e(l.room_name)} · ${dateLabel(l.starts_at)}`:'Salinha',`<form data-form="lesson-curriculum" data-id="${id}"><label>Tema da Aulinha<input name="theme" placeholder="Ex.: A Arca de Noé e a Obediência" value="${e(curr.theme||'')}" required/></label><label>Versículo para Memorizar<input name="memory_verse" placeholder="Ex.: Confia no Senhor de todo o teu coração - Pv 3:5" value="${e(curr.memory_verse||'')}"/></label><label>Conversa no Caminho de Volta (Pergunta para os pais)<textarea name="family_question" rows="3" placeholder="Ex.: O que Noé fez quando Deus pediu algo difícil? E nós, quando é difícil obedecer?">${e(curr.family_question||'')}</textarea></label><p class="muted-note">As famílias verão essas informações no aplicativo para continuar o discipulado em casa.</p>${errorSlot}<button class="btn primary full" type="submit">Salvar Discipulado</button></form>`);return true;
  }
  return false;
 }
 async function submit(form,values){
  const type=form.dataset.form,id=Number(form.dataset.id);
  if(type==='simple-child'){
   const data={name:values.name,birthday:values.birthday,allergies:values.allergies||'',medical_conditions:values.medical_conditions||'',emergency_medication:values.emergency_medication||'',special_needs:values.special_needs||'',authorized_pickups:values.authorized_pickups||'',avatar_url:values.avatar_url||''};
   if(S.user.role!=='parent')data.room_id=Number(values.room_id);
   if(S.user.role==='admin')data.parent_id=values.parent_id?Number(values.parent_id):null;
   await api(id?`/children/${id}`:'/children',{method:id?'PATCH':'POST',body:data});return 'Cadastro salvo.';
  }
  if(type==='transfer-child'){
   const c=S.children.find(x=>x.id===id);
   if(!c)throw new Error('Aluno não encontrado.');
   await api(`/children/${id}`,{
     method:'PATCH',
     body:{
       name:c.name,
       birthday:c.birthday,
       room_id:Number(values.room_id),
       allergies:c.allergies||'',
       medical_conditions:c.medical_conditions||'',
       emergency_medication:c.emergency_medication||'',
       special_needs:c.special_needs||'',
       authorized_pickups:c.authorized_pickups||'',
       avatar_url:c.avatar_url||''
     }
   });
   return 'Aluno transferido de turma com sucesso!';
  }
  if(type==='school-user'){
   const data={name:values.name,email:values.email,role:values.role,active:values.active==='on',rooms:new FormData(form).getAll('rooms').map(Number)};
   if(values.password)data.password=values.password;
   await api(`/users/${id}`,{method:'PATCH',body:data});return 'Usuário atualizado.';
  }
  if(type==='simple-room'){
   const data={name:values.name,min_age:Number(values.min_age),max_age:Number(values.max_age),capacity:Number(values.capacity),cover_url:values.cover_url||''};
   if(values.owner_id)data.owner_id=Number(values.owner_id);
   if(values.teacher_id)data.teacher_id=Number(values.teacher_id);
   if(values.monitor_id)data.monitor_id=Number(values.monitor_id);
   if(id)data.version=S.rooms.find(r=>r.id===Number(id))?.version;
   const result=await api(id?`/rooms/${id}`:'/rooms',{method:id?'PATCH':'POST',body:data});return id?'Turma salva.':{message:'Turma criada. Agora publique o primeiro horário.',roomId:result.id};
  }
  if(type==='lesson'){
   await api(id?`/lessons/${id}`:'/lessons',{method:id?'PATCH':'POST',body:{
     room_id:Number(values.room_id),
     title:values.title||'Aulinha',
     starts_at:`${values.day}T${values.start}:00-03:00`,
     ends_at:`${values.day}T${values.end}:00-03:00`,
     repeat_weeks:Number(values.repeat_weeks)||1,
     teacher_id:values.teacher_id?Number(values.teacher_id):null,
     monitor_id:values.monitor_id?Number(values.monitor_id):null,
     materials_url:(values.materials_url||'').trim(),
     notes:(values.notes||'').trim()
   }});
   return 'Aulinha publicada.';
  }
  if(type==='lesson-student'){await api(`/lessons/${id}/presence`,{method:'POST',body:{child_id:Number(values.child_id)}});return 'Aluno adicionado à chamada.';}
  if(type==='cancel-lesson'){await api(`/lessons/${id}`,{method:'DELETE'});return 'Aulinha cancelada. Famílias avisadas.';}
  if(type==='delete-room'||type==='archive-room'){await api(`/rooms/${id}`,{method:'DELETE'});return 'Turma excluída com sucesso.';}
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
 function change(event){
  if(event.target.id==='room-cover-file-input'){
   const file=event.target.files[0];
   if(!file)return;
   const prevArea=document.getElementById('room-cover-preview');
   if(prevArea){
    prevArea.className='media-preview-area';
    prevArea.innerHTML='<div class="media-empty-state"><span class="spin">●</span><strong style="margin-top:8px;">Otimizando e enviando foto de capa...</strong><p>Aguarde um instante</p></div>';
   }
   Promise.resolve().then(async()=>{
    try{
     if(!uploadImage)throw new Error('Função de upload indisponível.');
     const url=await uploadImage(file);
     setRoomCoverPreview(url);
     toast('Foto de capa da turma enviada com sucesso! 📸');
    }catch(err){
     setRoomCoverPreview('');
     toast(err.message||'Não foi possível enviar a foto.',true);
    }
   });
   return;
  }
  if(event.target.id==='child-avatar-form-file-input'){
   const file=event.target.files[0];
   if(!file)return;
   const prevArea=document.getElementById('child-avatar-preview-box');
   const hiddenInp=document.getElementById('child-avatar-url-input');
   const clearBtn=document.getElementById('clear-child-avatar-form-btn');
   if(prevArea){
    prevArea.innerHTML='<span class="spin" style="font-size:16px;">●</span>';
   }
   Promise.resolve().then(async()=>{
    try{
     if(!uploadAvatar)throw new Error('Função de upload indisponível.');
     const url=await uploadAvatar(file);
     if(hiddenInp)hiddenInp.value=url;
     if(prevArea)prevArea.innerHTML=`<img src="${e(url)}" alt="Foto da criança" style="width:100%;height:100%;object-fit:cover;" id="child-avatar-preview-img"/>`;
     if(clearBtn)clearBtn.hidden=false;
     toast('Foto enviada com sucesso! 📸');
    }catch(err){
     if(prevArea)prevArea.innerHTML=`<span style="font-size:22px;color:#a1a1aa;">${icon('kids', 28)}</span>`;
     toast(err.message||'Não foi possível enviar a foto.',true);
    }
   });
   return;
  }
  if(event.target.id==='lesson-material-file-input'){
   const file=event.target.files[0];
   if(!file)return;
   const statusBox=document.getElementById('lesson-material-status');
   const inputUrl=document.getElementById('lesson-materials-url-input');
   const saveButton=event.target.closest('form')?.querySelector('button[type="submit"]');
   if(file.size>10*1024*1024){toast('O material deve ter no máximo 10 MB.',true);event.target.value='';return;}
   if(file.type!=='application/pdf'&&!file.type.startsWith('image/')&&!file.name.toLowerCase().endsWith('.pdf')){toast('Selecione um PDF ou uma imagem.',true);event.target.value='';return;}
   if(saveButton)saveButton.disabled=true;
   if(statusBox){
     statusBox.innerHTML='<span class="spin">●</span> Enviando material de aula...';
   }
   Promise.resolve().then(async()=>{
    try{
     const data=new FormData();
     data.append('file',file);
     const res=await api('/upload',{method:'POST',body:data});
     if(inputUrl)inputUrl.value=res.url;
     if(statusBox){
       statusBox.className='lesson-material-status has-file';
       statusBox.innerHTML=`<span>✓ Arquivo anexado: <a href="${e(res.url)}" target="_blank" rel="noopener noreferrer">${e(file.name)}</a></span>`;
     }
     toast('Material anexado com sucesso! 📎');
    }catch(err){
     if(statusBox)statusBox.innerHTML=`<span style="color:#ef4444;">Erro ao anexar arquivo: ${e(err.message||'Tente novamente')}</span>`;
     toast(err.message||'Erro ao anexar arquivo.',true);
    }finally{
     if(saveButton)saveButton.disabled=false;
     event.target.value='';
    }
   });
   return;
  }
  if(event.target.id==='lesson-child'){S.selectedChild=Number(event.target.value);render();}
  if(event.target.id==='lesson-filter'){S.selectedLesson=Number(event.target.value)||null;render();}
  if(event.target.id==='room-select-filter'||event.target.classList.contains('room-select-filter')){
    S.room=event.target.value;
    render();
  }
 }
 return {page,action,submit,change,lessonForm};
}

document.addEventListener('keydown', e => {
 if (e.target && e.target.id === 'desk-barcode-input' && e.key === 'Enter') {
  e.preventDefault();
  document.querySelector('[data-action="desk-barcode-search"]')?.click();
 }
});
