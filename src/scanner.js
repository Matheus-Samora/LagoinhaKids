import QRCode from 'qrcode';


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
function oscCleanup(ctx){setTimeout(()=>void ctx.close(),600);}
export function playBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    oscCleanup(ctx);
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
  const matches = S.children.filter(c => c.name.toUpperCase().includes(clean));
  if (matches.length===1) return matches[0];

  return null;
}

let activeScanner = null;
let currentCameraMode = 'environment';
let isAutoCheckin = false;
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

export function openScannerModal({ S, api, load, toast, showModal, modal, escape: e, icon, age, attendanceModal }) {
  void stopScanner();
  isProcessing = false;

  const html = `
    <div class="scanner-modal-body">
      <div class="scanner-toolbar-row">
        <label class="scanner-toggle-label">
          <input disabled type="checkbox" id="scanner-auto-toggle" ${isAutoCheckin ? 'checked' : ''}/>
          <span><strong>Conferência presencial obrigatória</strong><br><small>Leia a carteirinha e confirme o responsável antes de registrar.</small></span>
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
        <input id="scanner-usb-input" aria-label="Código da carteirinha" type="text" placeholder="Bipe com leitor USB ou digite código (ex: LK-0007)..." autocomplete="off" autofocus />
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
    const {Html5Qrcode}=await import('html5-qrcode');
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
    await stopScanner();
    modal.close();
    await attendanceModal(ch);
  }
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)void stopScanner();});
