const CACHE_NAME = 'nfc-app-v1';
const URLS_TO_CACHE = [
  '/',
  '/resource/css/fonts.css',
  '/resource/placeholder.png',
  '/resource/logo.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => {
      if (k !== CACHE_NAME) return caches.delete(k);
    })))
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        return caches.open(CACHE_NAME).then((cache) => {
          try { cache.put(event.request, resp.clone()); } catch (e) { /* ignore opaque responses */ }
          return resp;
        });
      });
    }).catch(() => caches.match('/resource/placeholder.png'))
  );
});
