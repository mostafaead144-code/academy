/* V22: no offline caching while new data-connected UI is being tested. */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('academy-')||k.includes('egtaz'))await caches.delete(k);await self.clients.claim();await self.registration.unregister()})()));
self.addEventListener('fetch', ()=>{});
