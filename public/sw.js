// Private API responses and photographs are never cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(
        () =>
          new Response(
            '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width"><title>Lagoinha Kids</title><body style="font-family:system-ui;padding:32px"><h1>Você está sem conexão</h1><p>Conecte-se à internet para consultar ou salvar informações.</p><button onclick="location.reload()">Tentar novamente</button></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
          )
      )
    );
  }
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {}

  const isUrgent = Boolean(data.urgent || data.kind === 'urgent_call');
  const title = isUrgent
    ? `🚨 CHAMADO NO TELÃO: ${data.child_name || 'Seu Filho(a)'}!`
    : (data.title || 'Lagoinha Kids');

  const body = isUrgent ? 'A equipe precisa falar com você. Abra o aplicativo.' : 'Você recebeu um novo aviso. Abra o aplicativo para conferir.';

  const options = {
    body: body,
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || (isUrgent ? `urgent-call-${data.child_id || Date.now()}` : `notice-${data.id || Date.now()}`),
    renotify: true,
    requireInteraction: isUrgent, // Permanece fixo na tela até o responsável tocar
    vibrate: isUrgent ? [1000, 300, 1000, 300, 1000, 300, 1500] : [200, 100, 200],
    silent: false,
    data: {
      url: data.url || (isUrgent ? '/#overview' : '/#notifications'),
      id: data.id || null,
      kind: data.kind || (isUrgent ? 'urgent_call' : 'general'),
      urgent: isUrgent,
      child_id: data.child_id || null,
      child_name: data.child_name || null,
      room_name: data.room_name || null,
      claim_code: data.claim_code || null,
      reason: data.reason || null,
      paging_id: data.paging_id || null
    }
  };

  if (isUrgent) {
    options.actions = [
      { action: 'on_my_way', title: '🏃 ESTOU A CAMINHO' },
      { action: 'open_call', title: '📲 ATENDER / ABRIR' }
    ];
  }

  event.waitUntil(
    Promise.all([
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
        for (const client of windows) {
          client.postMessage({ type: 'NEW_NOTICE', payload: data });
          if (isUrgent) {
            client.postMessage({ type: 'URGENT_INCOMING_CALL', payload: data });
          }
        }
      }),
      self.registration.showNotification(title, options)
    ])
  );
});

self.addEventListener('notificationclick', event => {
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};

  notification.close();

  // Acknowledgement requires an authenticated app session and CSRF protection.
  // Open the app so the parent can review and confirm the actual call.
  // 2. Abrir / Focar o aplicativo diretamente no chamado:
  event.waitUntil(
    (async () => {
      const targetUrl = '/#notifications';
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin) {
          if (data.urgent) {
            client.postMessage({ type: 'TRIGGER_CALL_MODAL', payload: data });
          }
          client.postMessage({ type: 'NAVIGATE_PAGE', page: data.urgent ? 'overview' : 'notifications' });
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })()
  );
});
