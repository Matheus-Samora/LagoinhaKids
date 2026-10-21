/**
 * Lagoinha Systems & Kids — Real-Time Reactive Client (SSE)
 *
 * Microservice-grade live reactive stream over Server-Sent Events.
 * Zero manual page refresh required. Seamless reconnects with backoff.
 */

let audioCtx = null;

function playRealtimeChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.36);
  } catch {}
}

export function showRealtimeToast({ title, message, url, onClick }) {
  let container = document.getElementById('lagoinha-realtime-toasts');
  if (!container) {
    container = document.createElement('div');
    container.id = 'lagoinha-realtime-toasts';
    container.className = 'realtime-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('article');
  toast.className = 'realtime-toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="realtime-toast-head">
      <span class="realtime-toast-badge">Aviso</span>
      <button type="button" class="realtime-toast-close" aria-label="Fechar aviso">×</button>
    </div>
    <strong class="realtime-toast-title"></strong>
    <p class="realtime-toast-msg"></p>
    <div class="realtime-toast-progress"><div class="realtime-toast-bar"></div></div>
  `;

  toast.querySelector('.realtime-toast-title').textContent = title || 'Novo aviso';
  toast.querySelector('.realtime-toast-msg').textContent = message || '';

  const removeToast = () => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 250);
  };

  toast.querySelector('.realtime-toast-close').addEventListener('click', ev => {
    ev.stopPropagation();
    removeToast();
  });

  if (url || onClick) {
    toast.classList.add('is-clickable');
    toast.addEventListener('click', () => {
      removeToast();
      if (onClick) onClick();
      else if (url) {
        if (url.startsWith('#')) location.hash = url;
        else location.href = url;
      }
    });
  }

  container.prepend(toast);
  playRealtimeChime();

  const timer = setTimeout(removeToast, 6000);
  toast.addEventListener('mouseenter', () => clearTimeout(timer), { once: true });
}

export class RealtimeClient {
  constructor() {
    this.es = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.token = '';
    this.apiOrigin = '';
    this._listeners = new Map();
    this.lastEventTime = Date.now();

    window.addEventListener('online', () => {
      if (!this.connected) this.connect(this.token, this.apiOrigin);
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (!this.connected || (Date.now() - this.lastEventTime > 45000))) {
        this.reconnect();
      }
    });
  }

  connect(token = '', apiOrigin = '') {
    if (token) this.token = token;
    if (apiOrigin) this.apiOrigin = apiOrigin.replace(/\/$/, '');
    this.disconnect();

    const base = this.apiOrigin || '';
    const qs = this.token ? `?token=${encodeURIComponent(this.token)}` : '';
    const url = `${base}/api/realtime/stream${qs}`;

    try {
      this.es = new EventSource(url, { withCredentials: true });
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.lastEventTime = Date.now();
    this._startWatchdog();

    this.es.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this._updateStatusDOM(true);
    };

    this.es.onerror = () => {
      this.connected = false;
      this._updateStatusDOM(false);
      this._scheduleReconnect();
    };

    const registeredEvents = [
      'connected',
      'notification:new',
      'notification:count',
      'hall:post',
      'hall:comment',
      'hall:comment_removed',
      'hall:reaction',
      'ministries:schedule',
      'ministries:my_schedule',
      'kids:attendance',
      'kids:paging',
      'kids:sync',
      'announcement:new',
      'announcement:archived',
      'profile:updated',
      'test:ping'
    ];

    registeredEvents.forEach(eventType => {
      this.es.addEventListener(eventType, ev => {
        this.lastEventTime = Date.now();
        let parsed = null;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          parsed = ev.data;
        }

        if (eventType === 'connected') {
          this.connected = true;
          this.reconnectAttempts = 0;
          this._updateStatusDOM(true);
        }

        this._dispatch(eventType, parsed);
      });
    });
  }

  _dispatch(eventType, data) {
    const detail = { type: eventType, data };
    window.dispatchEvent(new CustomEvent('lagoinha:realtime', { detail }));
    window.dispatchEvent(new CustomEvent(`lagoinha:realtime:${eventType}`, { detail: data }));

    const callbacks = this._listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(fn => {
        try { fn(data); } catch (err) { console.error('Realtime handler error:', err); }
      });
    }
  }

  on(eventType, callback) {
    if (!this._listeners.has(eventType)) this._listeners.set(eventType, new Set());
    this._listeners.get(eventType).add(callback);
    return () => this.off(eventType, callback);
  }

  off(eventType, callback) {
    const set = this._listeners.get(eventType);
    if (set) set.delete(callback);
  }

  _scheduleReconnect() {
    this.disconnect();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(15000, 1000 * Math.pow(1.5, this.reconnectAttempts++)) + Math.random() * 500;
    this.reconnectTimer = setTimeout(() => {
      this.connect(this.token, this.apiOrigin);
    }, delay);
  }

  _startWatchdog() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.connected && (Date.now() - this.lastEventTime > 40000)) {
        this.reconnect();
      }
    }, 15000);
  }

  reconnect() {
    this.disconnect();
    this.connect(this.token, this.apiOrigin);
  }

  disconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.connected = false;
    this._updateStatusDOM(false);
  }

  _updateStatusDOM(isConnected) {
    document.querySelectorAll('[data-realtime-status]').forEach(el => {
      el.classList.toggle('is-connected', isConnected);
      el.setAttribute('title', isConnected ? 'Tempo real ativo (ao vivo)' : 'Reconectando em tempo real...');
      const text = el.querySelector('.realtime-text');
      if (text) text.textContent = isConnected ? 'Ao vivo' : 'Conectando…';
    });
  }
}

export const realtime = new RealtimeClient();
