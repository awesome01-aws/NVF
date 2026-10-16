const CACHE_NAME = '__NVF_CACHE_NAME__';
const PRECACHE_ASSETS = [];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const index = await fetch('/index.html', { cache: 'reload' });
    if (!index.ok) throw new Error('Could not cache the app shell');
    const html = await index.clone().text();
    await cache.put('/index.html', index);
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(match => match[1]);
    await cache.addAll([...new Set([...assets, ...PRECACHE_ASSETS, '/manifest.json'])]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Open the screen the reminder belongs to.
  const section = event.notification.data?.section;
  const path = section === 'rabbits' ? '/?farm=rabbits' : section === 'incubator' ? '/?tab=incubator' : section === 'eggs' ? '/?farm=egg_collection' : '/';
  event.waitUntil((async () => {
    const target = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          event.waitUntil(cache.put('/index.html', response.clone()));
        }
        return response;
      } catch (_) {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    } catch (_) {
      return (await caches.match(request)) || Response.error();
    }
  })());
});
