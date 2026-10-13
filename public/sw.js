// Lagoinha Kids Service Worker - Live Server Real-Time Updates
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
