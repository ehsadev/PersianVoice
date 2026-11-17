const SHELL = 'ava-shell-v3';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const root = new URL('./', self.registration.scope);
    const page = await fetch(root);
    await cache.put(root, page.clone());
    const html = await page.text();
    const assets = [...html.matchAll(/(?:src|href)="(\.\/|\/assets\/)[^"]+"/g)].map(match => new URL(match[0].match(/"([^"]+)"/)?.[1] || '', root));
    await Promise.allSettled(assets.map(url => cache.add(url)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => (key.startsWith('ava-shell-') && key !== SHELL) || key === 'ava-models-v1').map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) (await caches.open(SHELL)).put(event.request, response.clone());
      return response;
    })());
  }
});
