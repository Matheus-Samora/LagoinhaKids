import re

with open('src/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update DEFAULT_TUNNEL
content = content.replace(
    "const DEFAULT_TUNNEL='https://running-aus-medications-richmond.trycloudflare.com';",
    "const DEFAULT_TUNNEL='https://however-boots-populations-differential.trycloudflare.com';"
)

# 2. Add mobileNavItems function before render()
if 'function mobileNavItems()' not in content:
    mobile_nav_fn = """function mobileNavItems(){
 if(S.user.role==='parent')return [['overview','Meus filhos','kids'],['lessons','Aulinhas','clock'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 if(S.user.role==='teacher')return [['rooms','Turmas','rooms'],['attendance','Chamada','check'],['notifications','Avisos','bell'],['settings','Conta','settings']];
 return [['overview','Visão','home'],['attendance','Chamada','check'],['children','Alunos','kids'],['notifications','Avisos','bell'],['settings','Conta','settings']];
}
"""
    content = content.replace("function render(){\n", mobile_nav_fn + "function render(){\n")

# 3. Add mobile bottom nav to shell in render()
old_render_shell = '<footer class="app-footer">Lagoinha Kids · Cuidado que conecta <span>Ambiente local · dados fictícios de demonstração</span></footer></main></div>`;'
new_render_shell = '<footer class="app-footer">Lagoinha Kids · Cuidado que conecta <span>Ambiente seguro · Igreja Batista da Lagoinha</span></footer></main><nav class="mobile-bottom-nav" aria-label="Navegação móvel">${mobileNavItems().map(([page,label,i])=>`<button class="mobile-bottom-btn ${S.page===page?\'active\':\'\'}" data-page="${page}">${icon(i,22)}<span>${label}</span>${page===\'notifications\'&&unread?`<b class="notification-count">${unread}</b>`:\'\'}</button>`).join(\'\')}</nav></div>`;'
content = content.replace(old_render_shell, new_render_shell)

# 4. Update roster to show allergy and claim tag badges
old_roster_tr = """<td><div class="person"><span class="kid-avatar" style="background:${ch.color}">${initials(ch.name)}</span><span><strong>${escape(ch.name)}</strong><small>${age(ch.birthday)} anos ${ch.face_enrolled?'· Cadastro facial ativo':''}</small></span></div></td><td><span class="room-label">${escape(ch.room_name)}</span></td><td><span class="status ${ch.status}"><i></i>${statusName[ch.status]}</span></td>"""
new_roster_tr = """<td><div class="person"><span class="kid-avatar" style="background:${ch.color}">${initials(ch.name)}</span><div><strong>${escape(ch.name)}</strong><small>${age(ch.birthday)} anos ${ch.face_enrolled?'· Facial ativo':''}</small>${ch.allergies?`<span class="allergy-badge" title="Alergia: ${escape(ch.allergies)}">⚠️ ${escape(ch.allergies)}</span>`:''}${ch.special_needs?`<span class="allergy-badge special" title="Necessidade Especial: ${escape(ch.special_needs)}">♿ ${escape(ch.special_needs)}</span>`:''}</div></div></td><td><span class="room-label">${escape(ch.room_name)}</span></td><td><span class="status ${ch.status}"><i></i>${statusName[ch.status]}</span>${ch.claim_code?`<span class="claim-tag-badge">TAG: ${escape(ch.claim_code)}</span>`:''}</td>"""
content = content.replace(old_roster_tr, new_roster_tr)

# 5. Add privacyModal function
if 'function privacyModal()' not in content:
    privacy_fn = """async function privacyModal(){
 try{
  const d=await api('/terms/privacy');
  showModal(d.title,d.controller,`<div class="privacy-modal-body"><p class="soft-info" style="margin-bottom:12px;"><strong>${escape(d.summary)}</strong> (Versão ${escape(d.version)})</p><div class="privacy-sections">${d.sections.map(s=>`<div class="privacy-sec" style="margin-bottom:12px;"><strong style="display:block;margin-bottom:4px;font-size:14px;">${escape(s.title)}</strong><p style="font-size:13px;color:#71717a;line-height:1.5;">${escape(s.text)}</p></div>`).join('')}</div><button type="button" class="btn primary full" data-action="close" style="margin-top:14px;">Entendido e ciente</button></div>`);
 }catch{
  showModal('Política de Privacidade','Lagoinha Kids',`<p>O Lagoinha Kids trata dados com base no Art. 14 da LGPD para salvaguarda e cuidado dos menores durante os cultos. Nenhuma foto é armazenada no servidor.</p><button type="button" class="btn primary full" data-action="close">Fechar</button>`);
 }
}
"""
    content = content.replace("function installModal(){\n", privacy_fn + "function installModal(){\n")

# 6. Update settingsPage to include privacy terms button
old_settings_link = '<button class="btn secondary" data-action="google-link"><span class="google-g">G</span> ${S.user.google_linked?\'Conta Google vinculada\':\'Vincular conta Google\'}</button>'
new_settings_link = '<button class="btn secondary" data-action="google-link"><span class="google-g">G</span> ${S.user.google_linked?\'Conta Google vinculada\':\'Vincular conta Google\'}</button><button type="button" class="btn secondary full" data-action="privacy-terms" style="margin-top:10px;border:1px solid #27272a;">${icon(\'shield\',16)} Política de Privacidade & LGPD</button>'
content = content.replace(old_settings_link, new_settings_link)

# 7. Update attendanceModal with health alerts, authorized pickups, and claim tag input
old_att_modal = """function attendanceModal(ch){if(!ch.parent_id)return toast('Peça à administração para vincular um responsável antes da entrada ou saída.',true);const out=ch.status==='present';showModal(out?'Um até logo com cuidado.':'Que bom que você chegou.',`${out?'Registrar saída':'Registrar entrada'} de ${escape(ch.name)}`,`<div class="guardian-box">${icon('shield',25)}<div><span>RESPONSÁVEL VINCULADO</span><strong>${escape(ch.parent_name)}</strong></div></div><form data-form="attendance" data-id="${ch.id}" data-direction="${out?'out':'in'}"><label class="checkbox-label"><input name="confirmed" type="checkbox" required/>Conferi presencialmente a identidade do responsável vinculado e autorizo este registro.</label><p class="soft-info">Uma comparação facial ou notificação não substitui essa conferência.</p><p class="form-error" role="alert"></p><button class="btn primary full" type="submit">Confirmar ${out?'saída':'entrada'} ${icon('check',18)}</button></form>`);}"""
new_att_modal = """function attendanceModal(ch){
 if(!ch.parent_id)return toast('Peça à administração para vincular um responsável antes da entrada ou saída.',true);
 const out=ch.status==='present';
 showModal(out?'Um até logo com cuidado.':'Que bom que você chegou.',`${out?'Registrar saída':'Registrar entrada'} de ${escape(ch.name)}`,
  `<div class="guardian-box">${icon('shield',25)}<div><span>RESPONSÁVEL VINCULADO</span><strong>${escape(ch.parent_name)}</strong></div></div>
  ${ch.allergies?`<div class="allergy-alert-box" style="margin:10px 0;padding:10px;background:#18181b;border:1px solid #3f3f46;border-radius:8px;font-size:13px;"><strong style="color:#ffffff;">⚠️ Alergia / Cuidado Médico:</strong> <span style="color:#e4e4e7;">${escape(ch.allergies)}</span>${ch.emergency_medication?`<div style="color:#a1a1aa;margin-top:4px;"><small>Medicação de emergência: ${escape(ch.emergency_medication)}</small></div>`:''}</div>`:''}
  ${ch.authorized_pickups?`<div style="margin:8px 0;font-size:12px;color:#a1a1aa;"><span>Pessoas autorizadas a retirar: </span><strong style="color:#ffffff;">${escape(ch.authorized_pickups)}</strong></div>`:''}
  <form data-form="attendance" data-id="${ch.id}" data-direction="${out?'out':'in'}">
   ${!out?`<div class="claim-info-note" style="margin:8px 0 12px;padding:8px 12px;background:#09090b;border:1px solid #27272a;border-radius:6px;font-size:12px;color:#a1a1aa;">Ao confirmar a entrada, o sistema gerará uma <strong>Etiqueta de Segurança (Claim Tag de 4 dígitos)</strong> pareada para a criança e para o responsável.</div>`:`<div class="claim-checkout-note" style="margin:8px 0 12px;padding:10px;background:#09090b;border:1px solid #27272a;border-radius:6px;"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#a1a1aa;margin-bottom:6px;">PROTOCOLO DE RETIRADA (NO TAG, NO CHILD)</div><label style="font-size:13px;display:block;margin-bottom:8px;">Código da Etiqueta do Responsável (4 caracteres):<input name="claim_code" type="text" maxlength="4" style="text-transform:uppercase;font-size:18px;font-weight:700;letter-spacing:4px;text-align:center;margin-top:4px;" placeholder="${escape(ch.claim_code||'A1B2')}" required/></label></div>`}
   <label class="checkbox-label"><input name="confirmed" type="checkbox" required/>Conferi presencialmente a identidade ${out?'e a Etiqueta de Segurança':'do responsável vinculado'} e autorizo este registro.</label>
   <p class="soft-info">Uma comparação facial ou notificação não substitui essa conferência presencial.</p>
   <p class="form-error" role="alert"></p>
   <button class="btn primary full" type="submit">Confirmar ${out?'saída':'entrada'} ${icon('check',18)}</button>
  </form>`);
}"""
content = content.replace(old_att_modal, new_att_modal)

# 8. Update renderLogin to include phone and privacy consent on register, and privacy link on footer
old_register_name = """${register?'<label>Seu nome<input name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Como podemos chamar você?"/></label>':''}"""
new_register_name = """${register?'<label>Seu nome<input name="name" autocomplete="name" required minlength="2" maxlength="100" placeholder="Como podemos chamar você?"/></label><label>Celular / WhatsApp (para avisos urgentes)<input name="phone" type="tel" maxlength="30" placeholder="(DD) 99999-9999"/></label>':''}"""
content = content.replace(old_register_name, new_register_name)

old_login_foot = """<div class="login-footnote">${icon('shield',16)} Um espaço reservado para famílias e equipe.</div>"""
new_login_foot = """<div class="login-footnote">${icon('shield',16)} Um espaço reservado para famílias e equipe. · <button type="button" class="text-link" data-action="privacy-terms" style="font-size:12px;color:#71717a;text-decoration:underline;">Termos &amp; LGPD</button></div>"""
content = content.replace(old_login_foot, new_login_foot)

# 9. Update click listener for privacy-terms
old_click_install = "if(action==='install-modal')installModal();"
new_click_install = "if(action==='install-modal')installModal();\n if(action==='privacy-terms')privacyModal();"
content = content.replace(old_click_install, new_click_install)

# 10. Update submit handler for attendance and busy state
old_busy_start = """S.busy=true;if(button)button.disabled=true;"""
new_busy_start = """S.busy=true;if(button){button.disabled=true;button.dataset.origHtml=button.innerHTML;button.innerHTML='<span class="spin">●</span> Aguarde...';}"""
content = content.replace(old_busy_start, new_busy_start)

old_busy_end = """finally{S.busy=false;if(button&&button.isConnected)button.disabled=false;}"""
new_busy_end = """finally{S.busy=false;if(button&&button.isConnected){button.disabled=false;if(button.dataset.origHtml)button.innerHTML=button.dataset.origHtml;}}"""
content = content.replace(old_busy_end, new_busy_end)

old_att_submit = "if(kind==='attendance')await api(`/children/${cid}/attendance`,{method:'POST',body:{action:form.dataset.direction,guardian_confirmed:values.confirmed==='on',guardian_id:child.parent_id,lesson_id:S.page==='attendance'?(S.selectedLesson||null):null}});"
new_att_submit = """if(kind==='attendance'){
    const attRes=await api(`/children/${cid}/attendance`,{method:'POST',body:{action:form.dataset.direction,guardian_confirmed:values.confirmed==='on',guardian_id:child.parent_id,lesson_id:S.page==='attendance'?(S.selectedLesson||null):null,claim_code:values.claim_code?values.claim_code.toUpperCase().trim():undefined}});
    modal.close();await load();
    if(form.dataset.direction==='in'&&attRes.claim_code)toast(`Entrada confirmada! Etiqueta de Segurança (TAG): ${attRes.claim_code}`);
    else toast('Saída conferida e registrada com sucesso.');
    return;
   }"""
content = content.replace(old_att_submit, new_att_submit)

with open('src/main.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated src/main.js successfully.")
