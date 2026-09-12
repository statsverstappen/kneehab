/* Kneehab · service worker
   Cache-first for the app shell so a session works with no signal at the gym,
   with a background refresh so a deploy is picked up on the next load. */

const CACHE = 'kneehab-v2-2';
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './protocol.js',
  './engine.js',
  './garmin.js',
  './fit.js',
  './sync.js',
  './manifest.json',
  './icon-192.png',
  './icon-180.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let fonts go to the network

  ev.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || network;
    })
  );
});
