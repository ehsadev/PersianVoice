// Retire the old app-shell cache. Model weights live in separate Cache API stores.
// The prior fetch handler could serve stale JavaScript/WASM runtime files after a build.
self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('ava-shell-')).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
