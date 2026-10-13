import re
from pathlib import Path

path = Path('src/school.js')
content = path.read_text(encoding='utf-8', errors='replace')

# 1. Update childForm:
new_child_form = """ function childForm(ch){
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
 }"""

content = re.sub(r' function childForm\(ch\)\{[\s\S]*?\n \}', new_child_form, content, count=1)

# 2. Update parentHome:
new_parent_home = """ function parentHome(){
  return `${title('Meus filhos','Cadastre seus filhos e escolha as aulinhas.',`<button class="btn primary" data-action="new-child">${icon('plus',17)} Adicionar filho</button>`)}${S.children.length?`<div class="simple-family-grid">${S.children.map(ch=>`<article class="simple-child-card"><div class="person"><span class="kid-avatar big">${initials(ch.name)}</span><div><h2>${childName(ch)}</h2><p>${age(ch.birthday)} anos${ch.status==='present'?' · Na salinha':''}</p>${ch.claim_code&&ch.status==='present'?`<div style="margin-top:6px;"><span class="claim-tag-badge">RECIBO DOS PAIS · CÓDIGO: ${e(ch.claim_code)}</span></div>`:''}${ch.allergies?`<div style="margin-top:4px;"><span class="allergy-badge">⚠️ ALERGIA: ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div style="margin-top:4px;"><span class="allergy-badge">🩺 ${e(ch.medical_conditions)}</span></div>`:''}</div></div><div class="simple-child-actions"><button class="btn primary" data-action="child-lessons" data-id="${ch.id}">Ver aulinhas ${icon('arrow',16)}</button><button class="btn secondary" data-action="edit-child" data-id="${ch.id}">Editar</button></div><details class="child-extra"><summary>Mais opções</summary><button class="text-link" data-action="consent" data-id="${ch.id}">Autorização facial</button><button class="text-link" data-action="notify" data-kind="pickup_ready" data-id="${ch.id}">Avisar que cheguei para buscar</button><button class="text-link danger-link" data-action="archive-child" data-id="${ch.id}">Arquivar cadastro</button></details></article>`).join('')}</div><section class="simple-next panel"><h2>Próximo passo</h2><p>Escolha uma aulinha com dia e horário disponíveis e toque em <strong>Confirmar presença</strong>.</p><button class="btn secondary" data-page="lessons">Ver aulinhas disponíveis ${icon('arrow',16)}</button></section>`:empty('Vamos cadastrar seu filho?','Toque em “Adicionar filho”. Depois, escolha uma aulinha disponível.')}`;
 }"""

content = re.sub(r' function parentHome\(\)\{[\s\S]*?\n \}', new_parent_home, content, count=1)

# 3. Update rosterRows:
new_roster_rows = """ function rosterRows(children,lesson){
  const today=day(new Date());
  return children.length?`<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${children.map(ch=>`<tr><td><div class="person"><span class="kid-avatar">${initials(ch.name)}</span><div><strong>${childName(ch)}</strong><small>${age(ch.birthday)} anos</small>${ch.claim_code&&ch.status==='present'?`<div><span class="claim-tag-badge">TAG: ${e(ch.claim_code)}</span></div>`:''}${ch.allergies?`<div><span class="allergy-badge">⚠️ ${e(ch.allergies)}</span></div>`:''}${ch.medical_conditions?`<div><span class="allergy-badge">🩺 ${e(ch.medical_conditions)}</span></div>`:''}</div></div></td><td><span class="status ${ch.status}">${lesson&&lesson.starts_at.slice(0,10)!==today?'Confirmado para a aula':statusName[ch.status]}</span></td><td><div class="row-actions"><button class="mini-button" data-action="attendance" data-id="${ch.id}" ${lesson&&lesson.starts_at.slice(0,10)!==today?'disabled title="A chamada de chegada fica disponível no dia da aula"':''}>${ch.status==='present'?'Registrar saída':'Marcar chegada'}</button><button class="mini-button" data-action="student-options" data-id="${ch.id}">Opções</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum aluno confirmado ainda','As confirmações das famílias aparecerão aqui. Você também pode adicionar um aluno da sua turma.');
 }"""

content = re.sub(r' function rosterRows\(children,lesson\)\{[\s\S]*?\n \}', new_roster_rows, content, count=1)

# 4. Update submit for simple-child:
old_submit = "if(type==='simple-child'){"
new_submit = """if(type==='simple-child'){
   const data={name:values.name,birthday:values.birthday,allergies:values.allergies||'',medical_conditions:values.medical_conditions||'',emergency_medication:values.emergency_medication||'',special_needs:values.special_needs||'',authorized_pickups:values.authorized_pickups||''};"""

content = re.sub(r"if\(type==='simple-child'\)\{[\s\S]*?const data=\{name:values\.name,birthday:values\.birthday\};", new_submit, content, count=1)

path.write_text(content, encoding='utf-8')
print("Successfully updated src/school.js!")
