// Retires the service worker the previous SevenThirty app installed at this address.
// Browsers that still have it check this file, install this version, which deletes
// every cache it made, unregisters itself and reloads open tabs so they get the
// current site and today's prices straight from the network.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.map((k) => caches.delete(k)))
    await self.registration.unregister()
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach((client) => client.navigate(client.url))
  })())
})
