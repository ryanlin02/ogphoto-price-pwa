const STATIC_CACHE = 'ogphoto-static-v5';
const DATA_CACHE = 'ogphoto-data-v1';
const STATIC_FILES = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(
    keys.filter((key) => ![STATIC_CACHE, DATA_CACHE].includes(key)).map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== 'GET') return;
  if (url.pathname.includes('/data/')) {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone();
      caches.open(DATA_CACHE).then((cache) => cache.put(request, copy));
      return response;
    }).catch(() => caches.match(request).then((response) => response || caches.match(url.pathname))));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
