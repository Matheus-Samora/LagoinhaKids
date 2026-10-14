import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

// Generates 100% compliant, standard scannable QR Code SVG
export function generateQR(code) {
  try {
    const text = String(code || '').trim();
    if (!text) return '';
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (qr.modules.get(r, c)) {
          rects += `<rect x="${c * 8}" y="${r * 8}" width="8" height="8" fill="#09090b"/>`;
        }
      }
    }
    const total = size * 8;
    return `<svg class="qr-code-svg" viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;padding:8px;border-radius:10px;width:180px;height:180px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">${rects}</svg>`;
  } catch (err) {
    console.error('QR generation error:', err);
    return `<div style="padding:20px;color:#ef4444;font-size:12px;">Erro ao gerar QR Code</div>`;
  }
}

// Crisp, friendly Web Audio API beep for instant physical confirmation
export function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1174.66, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } else if (type === 'checkin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.07);
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.28);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch (e) {
    // Audio muted or not allowed
  }
}

export function findChildByCode(S, codeStr) {
  if (!codeStr) return null;
  const clean = String(codeStr).trim().toUpperCase();

  // 1. Try LK-0007, LK0007, LK-7 pattern
  const m = clean.match(/^LK-?0*(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    const ch = S.children.find(c => c.id === id);
    if (ch) return ch;
  }

  // 2. Try raw ID number (e.g. "7")
  if (/^\d+$/.test(clean)) {
    const id = Number(clean);
    const ch = S.children.find(c => c.id === id);
    if (ch) return ch;
  }

  // 3. Try matching current claim_code (4 characters like A1B2)
  const byClaim = S.children.find(c => c.claim_code && c.claim_code.toUpperCase() === clean);
  if (byClaim) return byClaim;

  // 4. Try matching full or partial name
  const byName = S.children.find(c => c.name.toUpperCase().includes(clean));
  if (byName) return byName;

  return null;
}

let activeScanner = null;
let currentCameraMode = 'environment';
let isAutoCheckin = true;
let isProcessing = false;

export async function stopScanner() {
  if (activeScanner) {
    try {
      if (activeScanner.isScanning) {
        await activeScanner.stop();
      }
      activeScanner.clear();
    } catch (e) {
      console.warn('Scanner stop error:', e);
    }
    activeScanner = null;
  }
}

export function initUSBScannerListener(S, onChildResolved) {
  let keyBuffer = '';
  let lastKeyTime = 0;

  window.addEventListener('keydown', e => {
    // Do not interfere if user is typing in regular text inputs, unless it's a dedicated scanner field
    const target = e.target;
    const isDedicated = target && (target.id === 'scanner-usb-input' || target.id === 'desk-barcode-input');
    const isRegularInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    if (isRegularInput && !isDedicated) return;

    const now = Date.now();
    if (now - lastKeyTime > 150) {
      keyBuffer = '';
    }
    lastKeyTime = now;

    if (e.key === 'Enter') {
      const code = keyBuffer.trim();
      keyBuffer = '';
      if (code.length >= 2) {
        const child = findChildByCode(S, code);
        if (child) {
          e.preventDefault();
          playBeep('success');
          onChildResolved(child, code);
        }
      }
      return;
    }

    if (e.key && e.key.length === 1) {
      keyBuffer += e.key;
    }
  });
}

export function openScannerModal({ S, api, load, toast, showModal, modal, escape: e, icon, age }) {
  void stopScanner();
  isProcessing = false;

  const html = `
    <div class="scanner-modal-body">
      <div class="scanner-toolbar-row">
        <label class="scanner-toggle-label">
          <input type="checkbox" id="scanner-auto-toggle" ${isAutoCheckin ? 'checked' : ''}/>
          <span><strong>Check-in Automático (1 bip)</strong><br><small>Ao ler a carteirinha, registra a entrada na salinha imediatamente.</small></span>
        </label>
        <button type="button" class="mini-button" id="scanner-flip-btn" title="Alternar entre câmera frontal e traseira">
          ${icon('settings', 14)} Inverter Câmera
        </button>
      </div>

      <div class="scanner-viewport-wrap">
        <div id="qr-camera-viewport"></div>
        <div class="scanner-aim-frame">
          <div class="scanner-aim-corner tl"></div>
          <div class="scanner-aim-corner tr"></div>
          <div class="scanner-aim-corner bl"></div>
          <div class="scanner-aim-corner br"></div>
          <div class="scanner-laser-line"></div>
        </div>
        <div id="scanner-camera-status" class="scanner-status-pill">Iniciando câmera...</div>
      </div>

      <div class="scanner-usb-bar">
        <span class="scanner-usb-icon">⚡</span>
        <input id="scanner-usb-input" type="text" placeholder="Bipe com leitor USB ou digite código (ex: LK-0007)..." autocomplete="off" autofocus />
        <button type="button" class="btn primary" id="scanner-usb-submit">Buscar</button>
      </div>

      <div id="scanner-result-slot" class="scanner-result-slot"></div>

      <button type="button" class="btn secondary full" data-action="close" style="margin-top:14px;">Fechar Leitor</button>
    </div>
  `;

  showModal('📷 Leitor QR & Check-in', 'Aponte a câmera para a carteirinha da criança ou bipe com leitor USB.', html);

  // Hook close button and dialog close to stop camera
  modal.addEventListener('close', () => {
    void stopScanner();
  }, { once: true });

  const autoToggle = document.getElementById('scanner-auto-toggle');
  if (autoToggle) {
    autoToggle.addEventListener('change', () => {
      isAutoCheckin = autoToggle.checked;
    });
  }

  const flipBtn = document.getElementById('scanner-flip-btn');
  if (flipBtn) {
    flipBtn.addEventListener('click', async () => {
      currentCameraMode = currentCameraMode === 'environment' ? 'user' : 'environment';
      await startCamera();
    });
  }

  const usbInput = document.getElementById('scanner-usb-input');
  const usbSubmit = document.getElementById('scanner-usb-submit');
  const handleUsbLookup = () => {
    if (!usbInput) return;
    const val = usbInput.value.trim();
    if (!val) return;
    usbInput.value = '';
    const ch = findChildByCode(S, val);
    if (ch) {
      playBeep('success');
      handleScannedChild(ch, val);
    } else {
      playBeep('alert');
      showResult(`
        <div class="scanner-error-card">
          <strong>Aluno não encontrado</strong>
          <p>Nenhuma criança cadastrada com o código ou nome "<strong>${e(val)}</strong>". Confira o cadastro em Meus Alunos.</p>
        </div>
      `);
    }
  };

  if (usbSubmit) usbSubmit.addEventListener('click', handleUsbLookup);
  if (usbInput) {
    usbInput.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        handleUsbLookup();
      }
    });
    setTimeout(() => usbInput.focus(), 300);
  }

  async function startCamera() {
    await stopScanner();
    const statusPill = document.getElementById('scanner-camera-status');
    const viewport = document.getElementById('qr-camera-viewport');
    if (!viewport) return;

    try {
      if (statusPill) statusPill.textContent = 'Acessando câmera...';
      activeScanner = new Html5Qrcode('qr-camera-viewport');
      const config = {
        fps: 12,
        qrbox: (viewWidth, viewHeight) => {
          const edge = Math.min(viewWidth, viewHeight) * 0.72;
          return { width: Math.round(edge), height: Math.round(edge) };
        },
        aspectRatio: 1.0,
      };

      await activeScanner.start(
        { facingMode: currentCameraMode },
        config,
        async (decodedText) => {
          if (isProcessing) return;
          isProcessing = true;
          try {
            playBeep('success');
            const ch = findChildByCode(S, decodedText);
            if (ch) {
              await handleScannedChild(ch, decodedText);
            } else {
              playBeep('alert');
              showResult(`
                <div class="scanner-error-card">
                  <strong>Código não reconhecido</strong>
                  <p>QR Code lido: <code>${e(decodedText)}</code>. Não corresponde a nenhum aluno cadastrado.</p>
                </div>
              `);
            }
          } finally {
            // Pause 2s before accepting next camera scan
            setTimeout(() => { isProcessing = false; }, 2000);
          }
        },
        () => {
          // Frame read without QR match, ignore
        }
      );

      if (statusPill) {
        statusPill.textContent = '🟢 Câmera Ativa';
        statusPill.classList.add('active');
      }
    } catch (err) {
      console.warn('Camera error:', err);
      if (statusPill) {
        statusPill.textContent = '🟡 Câmera indisponível (Use o leitor USB)';
        statusPill.classList.add('warn');
      }
      if (viewport) {
        viewport.innerHTML = `
          <div class="scanner-no-camera">
            <span style="font-size:32px;">⚡</span>
            <strong>Câmera não detectada ou permissão negada</strong>
            <p>Você pode usar normalmente o <strong>leitor USB conectado ao computador</strong> ou digitar o código abaixo.</p>
          </div>
        `;
      }
    }
  }

  void startCamera();

  function showResult(innerHtml) {
    const slot = document.getElementById('scanner-result-slot');
    if (slot) {
      slot.innerHTML = innerHtml;
      slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  async function handleScannedChild(ch, rawCode) {
    const room = S.rooms.find(r => r.id === ch.room_id)?.name || 'Salinha';
    const isPresent = ch.status === 'present';
    const parent = S.users.find(u => u.id === ch.parent_id);
    const parentName = parent ? parent.name : (ch.parent_name || 'Responsável não vinculado');

    // Auto Check-in flow for absent kids
    if (!isPresent && isAutoCheckin) {
      if (!ch.parent_id) {
        showResult(`
          <div class="scanner-error-card">
            <strong>Vincule o Responsável</strong>
            <p>${e(ch.name)} ainda não tem responsável vinculado. Vincule o responsável antes de dar entrada.</p>
          </div>
        `);
        playBeep('alert');
        return;
      }

      try {
        const attRes = await api(`/children/${ch.id}/attendance`, {
          method: 'POST',
          body: {
            action: 'in',
            guardian_confirmed: true,
            guardian_id: ch.parent_id,
            lesson_id: S.page === 'attendance' ? (S.selectedLesson || null) : null
          }
        });

        playBeep('checkin');
        await load();
        toast(`Entrada confirmada: ${ch.name}!`);

        showResult(`
          <div class="scanner-success-card">
            <div class="scanner-success-badge">✓ ENTRADA CONFIRMADA!</div>
            <h3>${e(ch.name)} · ${age(ch.birthday)} anos</h3>
            <p class="scanner-room-pill">${e(room)} · Resp.: ${e(parentName)}</p>
            ${ch.allergies ? `<div class="scanner-allergy-alert">⚠️ <strong>ALERGIA:</strong> ${e(ch.allergies)}</div>` : ''}
            <div class="scanner-claim-tag-box">
              <span>Etiqueta de Segurança Emitida (TAG):</span>
              <strong>${e(attRes.claim_code || 'CONFIRMADO')}</strong>
              <small>Informe este código ao responsável no momento da entrega.</small>
            </div>
            <p style="font-size:12px;color:#71717a;margin-top:8px;">Pronto para ler a próxima carteirinha...</p>
          </div>
        `);
        return;
      } catch (err) {
        playBeep('alert');
        showResult(`
          <div class="scanner-error-card">
            <strong>Falha ao registrar entrada</strong>
            <p>${e(err.message || 'Erro na requisição')}</p>
          </div>
        `);
        return;
      }
    }

    // Manual action view (or checkout when already present)
    showResult(`
      <div class="scanner-child-card ${isPresent ? 'present' : 'absent'}">
        <div class="scanner-child-header">
          <div>
            <span class="scanner-status-tag ${isPresent ? 'present' : 'absent'}">${isPresent ? 'Na Salinha' : 'Aguardando Entrada'}</span>
            <h3>${e(ch.name)}</h3>
            <p>${age(ch.birthday)} anos · Nasc. ${ch.birthday.slice(0, 10)} · ${e(room)}</p>
            <small style="color:#71717a;">Responsável: <strong>${e(parentName)}</strong></small>
          </div>
        </div>

        ${ch.allergies ? `<div class="scanner-allergy-alert">⚠️ <strong>ALERGIAS / CUIDADOS:</strong> ${e(ch.allergies)}</div>` : ''}
        ${ch.medical_conditions ? `<div class="scanner-allergy-alert" style="background:#27272a;color:#f4f4f5;border-color:#3f3f46;">🩺 <strong>CONDIÇÃO:</strong> ${e(ch.medical_conditions)}</div>` : ''}

        ${!isPresent ? `
          <button type="button" class="btn primary full" id="scanner-confirm-in-btn" style="margin-top:12px;">
            Confirmar Entrada na Salinha ✓
          </button>
        ` : `
          <div class="scanner-checkout-box" style="margin-top:12px;">
            <p style="font-size:12px;color:#a1a1aa;margin-bottom:6px;">Código da Etiqueta de Segurança do Aluno: <strong style="color:#ffffff;">${e(ch.claim_code || '—')}</strong></p>
            <div style="display:flex;gap:8px;">
              <input id="scanner-out-claim" type="text" maxlength="4" placeholder="Código do Pai" style="text-transform:uppercase;font-size:16px;font-weight:700;text-align:center;max-width:140px;" />
              <button type="button" class="btn danger" id="scanner-confirm-out-btn" style="flex:1;">
                Registrar Saída
              </button>
            </div>
          </div>
        `}
      </div>
    `);

    const inBtn = document.getElementById('scanner-confirm-in-btn');
    if (inBtn) {
      inBtn.addEventListener('click', async () => {
        if (!ch.parent_id) return toast('Vincule o responsável antes de dar entrada.', true);
        try {
          inBtn.disabled = true;
          const attRes = await api(`/children/${ch.id}/attendance`, {
            method: 'POST',
            body: {
              action: 'in',
              guardian_confirmed: true,
              guardian_id: ch.parent_id,
              lesson_id: S.page === 'attendance' ? (S.selectedLesson || null) : null
            }
          });
          playBeep('checkin');
          await load();
          toast(`Entrada confirmada: ${ch.name}!`);
          handleScannedChild(S.children.find(c => c.id === ch.id) || ch, rawCode);
        } catch (err) {
          playBeep('alert');
          toast(err.message, true);
        }
      });
    }

    const outBtn = document.getElementById('scanner-confirm-out-btn');
    if (outBtn) {
      outBtn.addEventListener('click', async () => {
        const inp = document.getElementById('scanner-out-claim');
        const codeVal = inp ? inp.value.trim().toUpperCase() : '';
        try {
          outBtn.disabled = true;
          await api(`/children/${ch.id}/attendance`, {
            method: 'POST',
            body: {
              action: 'out',
              guardian_confirmed: true,
              guardian_id: ch.parent_id,
              claim_code: codeVal,
              lesson_id: S.page === 'attendance' ? (S.selectedLesson || null) : null
            }
          });
          playBeep('checkin');
          await load();
          toast(`Saída registrada: ${ch.name}! Criança entregue aos pais.`);
          handleScannedChild(S.children.find(c => c.id === ch.id) || ch, rawCode);
        } catch (err) {
          playBeep('alert');
          toast(err.message, true);
          if (outBtn) outBtn.disabled = false;
        }
      });
    }
  }
}
