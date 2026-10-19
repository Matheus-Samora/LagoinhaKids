import { uiIcon } from '../ui/icons.js';

const QUICK_TEMPLATES = [
  {
    label: '📢 Aviso do Setor',
    text: 'Olá, {primeiro_nome}! Paz! Passando para compartilhar um aviso importante do nosso setor ({setor}):\n\n',
  },
  {
    label: '🗓️ Lembrete de Reunião / Culto',
    text: 'Olá, {primeiro_nome}! Paz! Lembrando do nosso encontro hoje ({setor}). Contamos com você!',
  },
  {
    label: '🙌 Escala / Voluntariado',
    text: 'Olá, {primeiro_nome}! Paz! Você está confirmado(a) na nossa programação do {setor}? Qualquer dúvida estamos à disposição!',
  },
  {
    label: '💛 Mensagem Pastoral',
    text: 'Olá, {primeiro_nome}! Graça e paz! A liderança da Lagoinha está orando por você e sua família nesta semana.',
  },
];

export function whatsappDispatchUI({ api, e }) {
  function openModal({ defaultSector = '', defaultGroup = '' } = {}) {
    const existing = document.getElementById('whatsapp-dispatch-dialog');
    if (existing) existing.remove();

    const dlg = document.createElement('dialog');
    dlg.id = 'whatsapp-dispatch-dialog';
    dlg.className = 'integrity-dialog whatsapp-modal-dialog';
    dlg.style.maxWidth = '720px';
    dlg.style.width = 'min(95vw, 720px)';
    document.body.append(dlg);
    let qrPollTimer = null;
    let qrRequestBusy = false;
    let qrLastFetch = 0;
    dlg.addEventListener('close', () => {
      if (qrPollTimer) clearInterval(qrPollTimer);
      dlg.remove();
    }, { once: true });

    let state = {
      sector: defaultSector,
      group: defaultGroup,
      search: '',
      data: null,
      selectedKeys: new Set(),
      message: QUICK_TEMPLATES[0].text,
      autoGreet: true,
      alsoNotifyApp: true,
      configOpen: false,
      configData: null,
      lastResult: null,
      loading: true,
      connectionState: 'unknown',
      qrModalOpen: false,
      qrLoading: false,
      qrBase64: '',
      error: '',
      statusMsg: '',
    };

    async function fetchRecipients(preserveSelection = false) {
      state.loading = true;
      state.error = '';
      render();
      try {
        const params = new URLSearchParams();
        if (state.sector) params.set('sector', state.sector);
        if (state.group) params.set('group', state.group);
        const res = await api(`/platform/whatsapp/recipients?${params.toString()}`);
        state.data = res;
        state.sector = res.sector;
        if (!preserveSelection) {
          state.selectedKeys = new Set((res.recipients || []).map((r) => r.key));
        } else {
          const validKeys = new Set((res.recipients || []).map((r) => r.key));
          state.selectedKeys = new Set([...state.selectedKeys].filter((k) => validKeys.has(k)));
        }
      } catch (err) {
        state.error = err.message || 'Erro ao carregar destinatários.';
      } finally {
        state.loading = false;
        render();
      }
    }

    function filteredRecipients() {
      const list = state.data?.recipients || [];
      const q = state.search.trim().toLowerCase();
      if (!q) return list;
      return list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.normalized_phone.includes(q) ||
          (r.sector_label || '').toLowerCase().includes(q) ||
          (r.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }

    function previewMessage() {
      const all = state.data?.recipients || [];
      const sample = all.find((r) => state.selectedKeys.has(r.key)) || {
        name: 'Maria Silva',
        first_name: 'Maria',
        sector_label: 'Lagoinha',
        cell_name: 'GC Ide',
      };
      let txt = (state.message || '').trim();
      const hasName = /\{(nome|primeiro_nome)\}/i.test(txt);
      txt = txt
        .replace(/\{nome\}/gi, sample.name)
        .replace(/\{primeiro_nome\}/gi, sample.first_name)
        .replace(/\{setor\}/gi, sample.sector_label || 'Lagoinha')
        .replace(/\{grupo\}/gi, sample.sector_label || 'Lagoinha')
        .replace(/\{gc\}/gi, sample.cell_name || sample.sector_label || 'Lagoinha');
      if (state.autoGreet && !hasName && txt) {
        txt = `Olá, ${sample.first_name}! Paz!\n\n${txt}`;
      }
      return { sampleName: sample.name, text: txt };
    }

    function groupOptionsHtml() {
      const d = state.data;
      if (!d) return '<option value="">Todos do setor</option>';
      const opts = ['<option value="">Todos do setor selecionado</option>'];
      if (state.sector === 'members' || state.sector === 'all') {
        opts.push('<option value="birthdays" ' + (state.group === 'birthdays' ? 'selected' : '') + '>🎂 Aniversariantes do mês</option>');
        opts.push('<option value="stage:visitor" ' + (state.group === 'stage:visitor' ? 'selected' : '') + '>👋 Visitantes</option>');
        opts.push('<option value="stage:new_convert" ' + (state.group === 'stage:new_convert' ? 'selected' : '') + '>🌱 Novos Convertidos</option>');
        for (const c of d.cells || []) {
          const val = `gc:${c.id}`;
          opts.push(`<option value="${e(val)}" ${state.group === val ? 'selected' : ''}>🏠 ${e(c.name)}</option>`);
        }
      }
      if (state.sector === 'ministries' || state.sector === 'all') {
        opts.push('<option value="leaders" ' + (state.group === 'leaders' ? 'selected' : '') + '>⭐ Líderes de Ministério</option>');
        for (const m of d.ministries || []) {
          const val = `ministry:${m}`;
          opts.push(`<option value="${e(val)}" ${state.group === val ? 'selected' : ''}>🎸 Ministério ${e(m)}</option>`);
        }
      }
      if (state.sector === 'kids') {
        opts.push('<option value="present" ' + (state.group === 'present' ? 'selected' : '') + '>🟢 Responsáveis com crianças presentes hoje</option>');
        for (const r of d.rooms || []) {
          const val = `room:${r.id}`;
          opts.push(`<option value="${e(val)}" ${state.group === val ? 'selected' : ''}>🧸 Turma ${e(r.name)}</option>`);
        }
      }
      return opts.join('');
    }

    async function checkConnectionStatus() {
      try {
        const res = await api('/platform/whatsapp/instance/status');
        state.connectionState = res.state || 'unknown';
        state.connectionProvider = res.provider || '';
        state.connectionMessage = res.message || '';
      } catch {
        state.connectionState = 'unknown';
      }
      render();
    }

    async function requestQrCode(background = false) {
      if (qrRequestBusy || !dlg.isConnected) return;
      qrRequestBusy = true;
      state.qrModalOpen = true;
      state.qrLoading = !state.qrBase64;
      state.error = '';
      if (!background) render();
      try {
        const res = await api('/platform/whatsapp/instance/connect', { method: 'POST' });
        if (!state.qrModalOpen || !dlg.isConnected) return;
        qrLastFetch = Date.now();
        const image = res.base64 || res.qrcode?.base64 || '';
        if (res.state === 'open') {
          state.connectionState = 'open';
          state.qrModalOpen = false;
          state.statusMsg = 'WhatsApp conectado com sucesso!';
        } else if (image) {
          const normalized = image.startsWith('data:image/png;base64,')
            ? image : `data:image/png;base64,${image}`;
          if (!/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(normalized)) {
            throw new Error('Imagem do QR Code inválida. Tente novamente.');
          }
          state.qrBase64 = normalized;
          state.connectionState = 'qrcode';
        } else {
          state.connectionState = res.state || 'connecting';
        }
        if (state.qrModalOpen) startQrPolling();
      } catch (err) {
        if (state.qrModalOpen) state.error = 'Erro ao solicitar QR Code: ' + (err.message || 'Tente novamente');
      } finally {
        qrRequestBusy = false;
        state.qrLoading = false;
        if (dlg.isConnected) render();
      }
    }

    function startQrPolling() {
      if (qrPollTimer) return;
      let polling = false;
      qrPollTimer = setInterval(async () => {
        if (polling || !state.qrModalOpen || !dlg.isConnected) return;
        polling = true;
        try {
          const st = await api('/platform/whatsapp/instance/status');
          if (!state.qrModalOpen || !dlg.isConnected) return;
          if (st.state === 'open') {
            clearInterval(qrPollTimer);
            qrPollTimer = null;
            state.connectionState = 'open';
            state.qrModalOpen = false;
            state.statusMsg = 'Celular da igreja conectado com sucesso ao WhatsApp!';
            render();
          } else if (!state.qrBase64 || Date.now() - qrLastFetch >= 15000) {
            await requestQrCode(true);
          }
        } catch {
          // Retry transient network failures on the next poll.
        } finally {
          polling = false;
        }
      }, 3000);
    }

    function renderConnectionCard() {
      if (state.connectionProvider === 'meta' || state.data?.provider_status?.provider === 'meta') {
        return `<div class="panel" role="status" style="margin-bottom:14px;padding:16px;">
          <strong>WhatsApp oficial · Meta</strong>
          <p>${e(state.connectionMessage || 'Validando configuração da Meta...')}</p>
          <small>Mensagens iniciadas pela igreja exigem modelos aprovados. Credenciais válidas não confirmam entrega.</small>
          <button type="button" class="secondary" id="wa-validate-meta">Verificar conexão</button>
        </div>`;
      }

      if (state.connectionState === 'open') {
        return `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:22px;">🟢</span>
              <div>
                <strong style="color:#166534;font-size:13.5px;display:block;">WhatsApp da Igreja Conectado</strong>
                <small style="color:#15803d;">Pronto para disparar mensagens personalizadas em 2º plano.</small>
              </div>
            </div>
            <button type="button" class="secondary" id="wa-disconnect-btn" style="padding:4px 10px;font-size:11.5px;">Desconectar Aparelho</button>
          </div>
        `;
      }

      if (state.qrModalOpen) {
        return `
          <div id="wa-active-qr-card" style="background:#ffffff;border:2px dashed #16a34a;border-radius:12px;padding:16px;text-align:center;margin-bottom:14px;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <strong style="font-size:14.5px;color:#166534;">📱 Conectar Celular da Igreja (WhatsApp Web)</strong>
              <button type="button" class="secondary" id="wa-close-qr-box" style="padding:4px 10px;font-size:12px;">Fechar QR Code</button>
            </div>
            <div style="margin:12px auto;display:grid;place-items:center;">
              ${
                state.qrLoading
                  ? '<div style="padding:40px;color:var(--muted);"><span class="spinner" style="display:inline-block;margin-bottom:8px;">⏳</span><br>Gerando QR Code no servidor...</div>'
                  : state.qrBase64
                  ? `<img src="${e(state.qrBase64)}" alt="QR Code WhatsApp" style="width:min(230px,100%);height:auto;aspect-ratio:1;display:block;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.08);" />`
                  : '<div style="padding:30px;color:#dc2626;">Aguardando o servidor gerar o QR Code. A imagem aparecerá automaticamente.</div>'
              }
            </div>
            <ol style="text-align:left;max-width:390px;margin:12px auto 8px;padding-left:22px;font-size:13px;color:var(--text);line-height:1.5;">
              <li>Abra o WhatsApp no celular da igreja</li>
              <li>Toque nos <strong>3 pontinhos</strong> (ou <strong>Configurações</strong> no iPhone) → <strong>Aparelhos conectados</strong></li>
              <li>Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o QR Code acima!</li>
            </ol>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;">
              🔄 Aguardando leitura da câmera no celular (reconhece automaticamente)...
            </div>
          </div>
        `;
      }

      return `
        <div style="background:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:10px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:22px;">📱</span>
            <div>
              <strong style="color:#854d0e;font-size:13.5px;display:block;">WhatsApp da Igreja Desconectado</strong>
              <small style="color:#a16207;">Aponte a câmera do celular para o QR Code (como no WhatsApp Web). Você não precisa de chaves nem códigos.</small>
            </div>
          </div>
          <button type="button" id="wa-open-qr-btn" class="btn primary" style="background:#16a34a;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;">
            📷 Conectar WhatsApp (Ler QR Code)
          </button>
        </div>
      `;
    }

    async function openConfigSubpanel() {
      try {
        state.configData = await api('/platform/whatsapp/config');
        state.configOpen = true;
        render();
      } catch (err) {
        state.error = err.message;
        render();
      }
    }

    function renderConfigSubpanel() {
      const cfg = state.configData || { provider: 'evolution', api_url: '', instance_id: '', sender_name: 'Lagoinha', enabled: true };
      return `
        <div class="panel" style="margin-bottom:14px;border:1px solid var(--border);background:var(--surface-2, #f8fafc);padding:14px;border-radius:12px;">
          <div class="section-title" style="margin-bottom:10px;">
            <h3 style="margin:0;font-size:15px;">⚙️ Opções Técnicas de Servidor</h3>
            <button type="button" class="secondary" id="wa-close-cfg" style="padding:4px 10px;font-size:12px;">Voltar ao Disparo</button>
          </div>
          <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#1e40af;">
            Configure o provedor autorizado pela igreja. Para a Meta oficial, use o Phone Number ID e o token do aplicativo empresarial. Não reutilize a chave da Evolution.
          </div>
          <form id="wa-config-form" class="record-form" style="gap:10px;">
            <div class="form-grid-2">
              <label>Provedor de WhatsApp
                <select name="provider">
                  <option value="evolution" ${cfg.provider === 'evolution' ? 'selected' : ''}>Evolution API (QR Code / Instância)</option>
                  <option value="zapi" ${cfg.provider === 'zapi' ? 'selected' : ''}>Z-API</option>
                  <option value="meta" ${cfg.provider === 'meta' ? 'selected' : ''}>Meta WhatsApp Cloud API (Oficial)</option>
                  <option value="webhook" ${cfg.provider === 'webhook' ? 'selected' : ''}>Webhook / Gateway (n8n, Make, etc.)</option>
                </select>
              </label>
              <label>Identificação do Remetente
                <input name="sender_name" value="${e(cfg.sender_name || 'Igreja Batista da Lagoinha')}" maxlength="120">
              </label>
            </div>
            <div class="form-grid-2">
              <label>URL da API / Servidor
                <input name="api_url" value="${e(cfg.api_url || '')}" placeholder="Ex.: https://api.suaigreja.com ou https://api.z-api.io" maxlength="300">
              </label>
              <label>Instância / Phone Number ID
                <input name="instance_id" value="${e(cfg.instance_id || '')}" placeholder="Ex.: lagoinha-oficial" maxlength="160">
              </label>
            </div>
            <div class="form-grid-2">
              <label>Token da API / API Key ${cfg.has_api_token ? '<small style="color:#16a34a;">(Já salvo ✓)</small>' : ''}
                <input name="api_token" type="password" placeholder="${cfg.has_api_token ? 'Deixe em branco para manter o atual' : 'Cole o token da API'}" maxlength="500">
              </label>
              <label>Client-Token (Opcional — Z-API) ${cfg.has_client_token ? '<small style="color:#16a34a;">(Já salvo ✓)</small>' : ''}
                <input name="client_token" type="password" placeholder="Opcional" maxlength="300">
              </label>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-top:4px;">
              <button type="submit">Salvar Conexão</button>
              <div style="display:flex;gap:6px;align-items:center;">
                <input id="wa-test-phone" type="tel" placeholder="DDD + Número p/ teste" style="width:170px;padding:6px 10px;font-size:13px;">
                <button type="button" class="secondary" id="wa-test-btn">Testar Envio</button>
              </div>
            </div>
          </form>
        </div>
      `;
    }

    function render() {
      const pStatus = state.data?.provider_status;
      const visible = filteredRecipients();
      const totalSelected = state.selectedKeys.size;
      const prev = previewMessage();

      dlg.innerHTML = `
        <div class="section-title" style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:8px;">
            <h2 style="margin:0;">💬 Disparo Personalizado · WhatsApp</h2>
            ${
              state.connectionState === 'open'
                ? `<span class="badge" style="background:#dcfce7;color:#166534;">🟢 Celular Conectado</span>`
                : `<span class="badge" style="background:#fef3c7;color:#92400e;">📱 Celular Desconectado</span>`
            }
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            ${
              pStatus?.can_configure
                ? `<button type="button" class="secondary" id="wa-open-cfg" style="padding:6px 10px;font-size:12px;">⚙️ Opções Avançadas</button>`
                : ''
            }
            <button type="button" class="secondary" id="wa-close-modal">Fechar</button>
          </div>
        </div>

        ${state.error ? `<p role="alert" class="error" style="margin-bottom:10px;">${e(state.error)}</p>` : ''}
        ${state.statusMsg ? `<p role="status" class="status" style="margin-bottom:10px;color:#166534;font-weight:600;">${e(state.statusMsg)}</p>` : ''}

        ${state.configOpen ? renderConfigSubpanel() : ''}

        ${renderConnectionCard()}

        ${
          state.loading
            ? '<p role="status">Carregando contatos cadastrados no aplicativo…</p>'
            : `
          <div class="form-grid-2" style="margin-bottom:10px;">
            <label>1. Setor
              <select id="wa-sector-select">
                ${(state.data?.allowed_sectors || []).map((s) => `<option value="${e(s.id)}" ${s.id === state.sector ? 'selected' : ''}>${e(s.label)}</option>`).join('')}
              </select>
            </label>
            <label>2. Grupo ou Filtro Rápido
              <select id="wa-group-select">
                ${groupOptionsHtml()}
              </select>
            </label>
          </div>

          <div style="border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
              <input id="wa-search-input" type="search" value="${e(state.search)}" placeholder="🔍 Buscar pessoa específica por nome ou telefone..." style="flex:1;min-width:200px;padding:7px 10px;font-size:13px;">
              <div style="display:flex;gap:6px;align-items:center;">
                <button type="button" class="secondary" id="wa-select-all" style="padding:5px 10px;font-size:12px;">Marcar todos (${visible.length})</button>
                <button type="button" class="secondary" id="wa-clear-all" style="padding:5px 10px;font-size:12px;">Desmarcar</button>
              </div>
            </div>
            <div style="max-height:165px;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:6px;">
              ${
                visible.length
                  ? visible
                      .map(
                        (r) => `
                  <label class="check" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12.5px;cursor:pointer;">
                    <input type="checkbox" data-wa-recipient="${e(r.key)}" ${state.selectedKeys.has(r.key) ? 'checked' : ''}>
                    <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      <strong style="display:block;overflow:hidden;text-overflow:ellipsis;">${e(r.name)}</strong>
                      <small style="color:var(--muted);">${e(r.phone)} · ${e(r.sector_label)}</small>
                    </div>
                  </label>`
                      )
                      .join('')
                  : '<p class="subtle" style="grid-column:1/-1;margin:6px 0;">Nenhum membro com telefone cadastrado neste filtro.</p>'
              }
            </div>
            <div style="margin-top:6px;font-size:12px;color:var(--muted);display:flex;justify-content:space-between;">
              <span>Selecionados para o disparo: <strong>${totalSelected}</strong> de ${(state.data?.recipients || []).length} contato(s)</span>
            </div>
          </div>

          <form id="wa-send-form" class="record-form" style="gap:10px;">
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                <strong style="font-size:13px;">3. Mensagem Personalizada</strong>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${QUICK_TEMPLATES.map((tpl, idx) => `<button type="button" class="secondary" data-wa-tpl="${idx}" style="padding:3px 8px;font-size:11.5px;">${e(tpl.label)}</button>`).join('')}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                <small style="align-self:center;color:var(--muted);">Inserir variável:</small>
                <button type="button" class="secondary" data-wa-var="{primeiro_nome}" style="padding:2px 8px;font-size:11.5px;">+ {primeiro_nome}</button>
                <button type="button" class="secondary" data-wa-var="{nome}" style="padding:2px 8px;font-size:11.5px;">+ {nome}</button>
                <button type="button" class="secondary" data-wa-var="{setor}" style="padding:2px 8px;font-size:11.5px;">+ {setor}</button>
              </div>
              <textarea id="wa-message-input" rows="4" required maxlength="2000" placeholder="Digite o aviso..." style="width:100%;padding:10px;border-radius:10px;font:inherit;">${e(state.message)}</textarea>
            </div>

            <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;">
              <label class="check"><input type="checkbox" id="wa-auto-greet" ${state.autoGreet ? 'checked' : ''}> Saudar pelo nome se não houver variável</label>
              <label class="check"><input type="checkbox" id="wa-notify-app" ${state.alsoNotifyApp ? 'checked' : ''}> Enviar também notificação dentro do App</label>
            </div>

            <div style="background:var(--surface-2, #f8fafc);border:1px dashed var(--border);border-radius:10px;padding:8px 12px;font-size:12.5px;">
              <small style="color:var(--muted);display:block;margin-bottom:2px;">Prévia personalizada para <strong>${e(prev.sampleName)}</strong>:</small>
              <div style="white-space:pre-wrap;">${e(prev.text)}</div>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
              <button type="submit" id="wa-submit-btn" ${totalSelected === 0 ? 'disabled' : ''} style="background:#16a34a;color:#fff;border-color:#15803d;">
                🚀 Disparar no WhatsApp para ${totalSelected} pessoa(s)
              </button>
            </div>
          </form>

          ${
            state.lastResult && !state.lastResult.configured
              ? `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
                  <small style="display:block;margin-bottom:6px;font-weight:600;">Envio direto rápido (enquanto a API não está ativa):</small>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;max-height:110px;overflow-y:auto;">
                    ${state.lastResult.results
                      .map(
                        (r) =>
                          `<a class="badge" style="background:#dcfce7;color:#166534;text-decoration:none;padding:5px 10px;" href="https://wa.me/${e(r.normalized_phone)}?text=${encodeURIComponent(r.message)}" target="_blank" rel="noopener">📲 ${e(r.name)}</a>`
                      )
                      .join('')}
                  </div>
                 </div>`
              : ''
          }
        `
        }
      `;

      dlg.querySelector('#wa-close-modal')?.addEventListener('click', () => dlg.close());
      dlg.querySelector('#wa-open-cfg')?.addEventListener('click', () => void openConfigSubpanel());
      dlg.querySelector('#wa-close-cfg')?.addEventListener('click', () => {
        state.configOpen = false;
        render();
      });

      const cfgForm = dlg.querySelector('#wa-config-form');
      if (cfgForm) {
        cfgForm.onsubmit = async (ev) => {
          ev.preventDefault();
          const fd = new FormData(cfgForm);
          try {
            const res = await api('/platform/whatsapp/config', {
              method: 'PUT',
              body: {
                provider: fd.get('provider'),
                sender_name: fd.get('sender_name'),
                api_url: fd.get('api_url'),
                instance_id: fd.get('instance_id'),
                api_token: fd.get('api_token'),
                client_token: fd.get('client_token'),
                enabled: true,
              },
            });
            state.statusMsg = res.message;
            state.configOpen = false;
            await fetchRecipients(true);
            await checkConnectionStatus();
          } catch (err) {
            state.error = err.message;
            render();
          }
        };
      }

      dlg.querySelector('#wa-test-btn')?.addEventListener('click', async () => {
        const phone = dlg.querySelector('#wa-test-phone')?.value || '';
        if (!phone.trim()) {
          state.error = 'Informe um número com DDD para enviar o teste.';
          render();
          return;
        }
        try {
          const res = await api('/platform/whatsapp/test', {
            method: 'POST',
            body: { phone },
          });
          state.statusMsg = res.message;
          state.error = '';
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });

      dlg.querySelector('#wa-validate-meta')?.addEventListener('click', () => void checkConnectionStatus());
      dlg.querySelector('#wa-open-qr-btn')?.addEventListener('click', () => void requestQrCode());
      dlg.querySelector('#wa-close-qr-box')?.addEventListener('click', () => {
        state.qrModalOpen = false;
        if (qrPollTimer) {
          clearInterval(qrPollTimer);
          qrPollTimer = null;
        }
        render();
      });
      dlg.querySelector('#wa-disconnect-btn')?.addEventListener('click', async () => {
        try {
          await api('/platform/whatsapp/instance/logout', { method: 'POST' });
          state.connectionState = 'close';
          state.statusMsg = 'Aparelho desconectado com sucesso.';
          render();
        } catch (err) {
          state.error = err.message;
          render();
        }
      });

      dlg.querySelector('#wa-sector-select')?.addEventListener('change', (ev) => {
        state.sector = ev.currentTarget.value;
        state.group = '';
        state.lastResult = null;
        void fetchRecipients(false);
      });

      dlg.querySelector('#wa-group-select')?.addEventListener('change', (ev) => {
        state.group = ev.currentTarget.value;
        state.lastResult = null;
        void fetchRecipients(false);
      });

      dlg.querySelector('#wa-search-input')?.addEventListener('input', (ev) => {
        state.search = ev.currentTarget.value;
        const pos = ev.currentTarget.selectionStart;
        render();
        const input = dlg.querySelector('#wa-search-input');
        if (input) {
          input.focus();
          try {
            input.setSelectionRange(pos, pos);
          } catch {}
        }
      });

      dlg.querySelector('#wa-select-all')?.addEventListener('click', () => {
        for (const r of filteredRecipients()) state.selectedKeys.add(r.key);
        render();
      });

      dlg.querySelector('#wa-clear-all')?.addEventListener('click', () => {
        for (const r of filteredRecipients()) state.selectedKeys.delete(r.key);
        render();
      });

      dlg.querySelectorAll('[data-wa-recipient]').forEach((cb) =>
        cb.addEventListener('change', () => {
          const k = cb.dataset.waRecipient;
          if (cb.checked) state.selectedKeys.add(k);
          else state.selectedKeys.delete(k);
          render();
        })
      );

      dlg.querySelectorAll('[data-wa-tpl]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const tpl = QUICK_TEMPLATES[Number(btn.dataset.waTpl)];
          if (tpl) {
            state.message = tpl.text;
            render();
          }
        })
      );

      dlg.querySelectorAll('[data-wa-var]').forEach((btn) =>
        btn.addEventListener('click', () => {
          const token = btn.dataset.waVar;
          const area = dlg.querySelector('#wa-message-input');
          if (area) {
            const start = area.selectionStart ?? state.message.length;
            const end = area.selectionEnd ?? state.message.length;
            state.message = state.message.slice(0, start) + token + state.message.slice(end);
            render();
          }
        })
      );

      dlg.querySelector('#wa-message-input')?.addEventListener('input', (ev) => {
        state.message = ev.currentTarget.value;
        const pos = ev.currentTarget.selectionStart;
        render();
        const area = dlg.querySelector('#wa-message-input');
        if (area) {
          area.focus();
          try {
            area.setSelectionRange(pos, pos);
          } catch {}
        }
      });

      dlg.querySelector('#wa-auto-greet')?.addEventListener('change', (ev) => {
        state.autoGreet = ev.currentTarget.checked;
        render();
      });

      dlg.querySelector('#wa-notify-app')?.addEventListener('change', (ev) => {
        state.alsoNotifyApp = ev.currentTarget.checked;
        render();
      });

      dlg.querySelector('#wa-send-form')?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const btn = dlg.querySelector('#wa-submit-btn');
        if (btn) btn.disabled = true;
        state.error = '';
        state.statusMsg = '';
        try {
          const res = await api('/platform/whatsapp/send', {
            method: 'POST',
            body: {
              target_sector: state.sector,
              target_group: state.group,
              recipient_keys: [...state.selectedKeys],
              message: state.message,
              auto_greet: state.autoGreet,
              also_notify_app: state.alsoNotifyApp,
            },
          });
          state.lastResult = res;
          state.statusMsg = res.message;
          render();
        } catch (err) {
          state.error = err.message || 'Falha ao disparar mensagens.';
          if (btn) btn.disabled = false;
          render();
        }
      });
    }

    dlg.showModal();
    void fetchRecipients(false);
    void checkConnectionStatus();
  }

  return { openModal };
}
