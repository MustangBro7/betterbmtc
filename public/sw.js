const CACHE = 'betterbmtc-shell-v2';
self.addEventListener('install', (event) => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/', '/icon.svg']))); self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) { const cache = await caches.open(CACHE); await cache.put('/', response.clone()); }
        return response;
      } catch { return (await caches.match('/')) || Response.error(); }
    })());
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request); if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) { const cache = await caches.open(CACHE); await cache.put(event.request, response.clone()); }
      return response;
    })());
  }
});
