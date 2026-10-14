// Lagoinha Kids Service Worker - Live Server Real-Time Updates & External Notifications
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Do not intercept network requests - always load live server assets directly
self.addEventListener('fetch', (event) => {
  return;
});

// Push notification received from server (Web Push / FCM)
self.addEventListener('push', (event) => {
  let data = {
    title: 'Lagoinha Kids',
    body: 'Você recebeu um novo aviso do ministério infantil.',
    tag: 'lagoinha-kids-notification',
    url: '/?page=notifications',
    kind: 'general'
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  const isUrgent = data.kind === 'urgent_call' || data.isPaging === true;

  const options = {
    body: data.body || data.message || 'Abra o app para conferir os detalhes.',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: data.tag || (isUrgent ? 'urgent-call-' + (data.child_id || Date.now()) : 'lagoinha-notice-' + Date.now()),
    renotify: true,
    requireInteraction: isUrgent, // Stays pinned on Android/Desktop until responded!
    data: {
      url: data.url || (isUrgent ? '/?page=overview' : '/?page=notifications'),
      id: data.id || null,
      child_id: data.child_id || null,
      paging_id: data.paging_id || null,
      kind: data.kind || 'general',
      isPaging: isUrgent
    },
    vibrate: isUrgent ? [300, 150, 300, 150, 300, 150, 400] : [200, 100, 200]
  };

  if (isUrgent) {
    options.actions = [
      { action: 'on_my_way', title: '🏃 Estou a caminho' },
      { action: 'open_app', title: 'Ver detalhes' }
    ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Lagoinha Kids', options)
  );
});

// Handle clicking notifications on OS lock screen / notification center
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};
  const targetUrl = notifData.url || '/?page=notifications';

  if (event.action === 'on_my_way') {
    // Parent clicked "Estou a caminho" directly from the OS notification bar!
    const ackPromise = fetch('/api/paging/on-my-way', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        child_id: notifData.child_id,
        paging_id: notifData.paging_id
      }),
      credentials: 'include'
    })
      .then(() => {
        return self.registration.showNotification('Lagoinha Kids · Resposta Confirmada', {
          body: 'A salinha e os professores já foram avisados que você está a caminho!',
          icon: '/logo.png',
          badge: '/logo.png',
          tag: 'ack-confirmed',
          data: { url: '/?page=overview' }
        });
      })
      .catch((err) => {
        console.error('Falha ao registrar estou a caminho no Service Worker:', err);
      });

    event.waitUntil(
      ackPromise.then(() => focusOrOpen(targetUrl))
    );
    return;
  }

  event.waitUntil(focusOrOpen(targetUrl));
});

function focusOrOpen(targetUrl) {
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if ('focus' in client) {
        client.postMessage({ type: 'NAVIGATE_PAGE', page: targetUrl.includes('overview') ? 'overview' : 'notifications' });
        return client.focus();
      }
    }
    if (clients.openWindow) {
      return clients.openWindow(targetUrl);
    }
  });
}
