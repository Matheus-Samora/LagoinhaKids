/**
 * Emergency Paging Call Overlay & Ringtone Module
 * Operates across both Lagoinha Kids and Lagoinha Systems (Membro / Platform).
 */

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

import {presentNativeCall} from './native-call-alerts.js';
export class EmergencyRingtone {
  constructor() {
    this.ctx = null;
    this.isPlaying = false;
    this.timer = null;

    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }
  }

  start() {
    if (this.isPlaying) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.ctx) this.ctx = new AudioCtx();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.isPlaying = true;

      const playPattern = () => {
        if (!this.isPlaying || !this.ctx) return;
        try {
          if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
          }
          const now = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(780, now);
          osc.frequency.exponentialRampToValueAtTime(1040, now + 0.25);
          osc.frequency.exponentialRampToValueAtTime(780, now + 0.5);

          g.gain.setValueAtTime(0.22, now);
          g.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

          osc.connect(g);
          g.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 0.55);
        } catch {}
      };

      playPattern();
      this.timer = setInterval(playPattern, 1200);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([600, 250, 600, 250, 1000]);
        } catch {}
      }
    } catch {}
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {}
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}

export const emergencyRingtone = new EmergencyRingtone();

export function showIncomingCallOverlay(call, onMyWayCb) {
  if (!call) return;
  if(presentNativeCall(call)||document.hidden)return;
  if (document.getElementById('emergency-call-overlay')) return;

  emergencyRingtone.start();

  const childName = call.child_name || 'Seu Filho(a)';
  const roomName = call.room_name || 'Salinha';
  const reason = call.reason || 'Acolhimento da família necessário';
  const claimCode = call.claim_code || '';
  const childId = call.child_id || '';
  const pagingId = call.id || call.paging_id || '';
  const childAvatar = call.avatar_url || call.child_avatar_url || '';

  const overlay = document.createElement('div');
  overlay.id = 'emergency-call-overlay';
  overlay.className = 'incoming-call-overlay phone-call-screen';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Chamada da Salinha — Lagoinha Kids');

  overlay.innerHTML = `
    <div class="phone-call-container">
      <div class="phone-call-header">
        <span class="phone-call-type">CHAMADA DA SALINHA</span>
        <span class="phone-call-status-pulse">
          <span class="phone-status-dot"></span> Aguardando sua resposta...
        </span>
      </div>

      <div class="phone-call-avatar-stage">
        <div class="phone-call-pulse-ring ring-1"></div>
        <div class="phone-call-pulse-ring ring-2"></div>
        <div class="phone-call-pulse-ring ring-3"></div>
        <div class="phone-call-avatar-circle">
          ${childAvatar ? `
            <img src="${escapeHtml(childAvatar)}" alt="${escapeHtml(childName)}" class="phone-call-avatar-img"/>
          ` : `
            <svg class="phone-call-avatar-placeholder" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          `}
        </div>
      </div>

      <div class="phone-call-details">
        <h1 class="phone-call-child-name">${escapeHtml(childName)}</h1>
        <p class="phone-call-room-line">
          <span>🏠 ${escapeHtml(roomName)}</span>
        </p>
        <p class="phone-call-reason-badge">
          <span>⚠️ Motivo: ${escapeHtml(reason)}</span>
        </p>
        ${claimCode ? `
          <div class="phone-call-code-chip">
            <small>CÓDIGO NO TELÃO DO AUDITÓRIO</small>
            <strong>${escapeHtml(claimCode)}</strong>
          </div>
        ` : ''}
      </div>

      <div class="phone-call-action-dock">
        <!-- Silence / Decline -->
        <div class="phone-call-btn-wrapper">
          <button type="button" class="phone-call-btn decline" id="silence-call-btn" aria-label="Silenciar chamada">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C2.87 9.17 7.18 7.5 12 7.5s9.13 1.67 11.71 4.17c.39.39.39 1.02 0 1.41l-2.48 2.48c-.18.18-.43.29-.71.29s-.52-.1-.7-.28c-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
            </svg>
          </button>
          <span class="phone-call-btn-text">Silenciar</span>
        </div>

        <!-- Accept / Estou a caminho -->
        <div class="phone-call-btn-wrapper">
          <button type="button" class="phone-call-btn accept" id="call-on-my-way-btn" aria-label="Atender e avisar que estou a caminho">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-2.2 2.2a15.045 15.045 0 0 1-6.59-6.59l2.2-2.21a.96.96 0 0 0 .25-1A11.36 11.36 0 0 1 8.5 3.97c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1 0 9.39 7.61 17 17 17 .55 0 1-.45 1-1v-3.59c0-.55-.45-1-.99-1z"/>
            </svg>
          </button>
          <span class="phone-call-btn-text">Estou a caminho</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#silence-call-btn')?.addEventListener('click', () => {
    emergencyRingtone.stop();
    const btn = overlay.querySelector('#silence-call-btn');
    if (btn) btn.innerHTML = '🔕 Silenciado';
  });

  overlay.querySelector('#call-on-my-way-btn')?.addEventListener('click', async () => {
    dismissIncomingCallOverlay();
    if (onMyWayCb) {
      await onMyWayCb({ child_id: Number(childId), paging_id: Number(pagingId) });
    }
  });
}

export function dismissIncomingCallOverlay() {
  emergencyRingtone.stop();
  const el = document.getElementById('emergency-call-overlay');
  if (el) el.remove();
}
