// PWA installation only. Business APIs and financial documents always use the network.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('cash-squirrel-')) await caches.delete(key);
  await self.clients.claim();
})()));
