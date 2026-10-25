// Service worker: app shell offline, network-first API data, cached images
// and the OCR engine cached after its first download.

const VERSION = 'kk-v1.0.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const IMAGES = 'kk-images';
const LIBS = 'kk-libs';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './js/app.js',
  './js/actions.js',
  './js/api.js',
  './js/format.js',
  './js/grading.js',
  './js/icons.js',
  './js/ocr.js',
  './js/ocr-parse.js',
  './js/prices.js',
  './js/router.js',
  './js/scanner.js',
  './js/session.js',
  './js/store.js',
  './js/ui.js',
  './js/vision.js',
  './js/components/card-tile.js',
  './js/components/centering-editor.js',
  './js/components/chart.js',
  './js/components/holo.js',
  './js/components/item-sheet.js',
  './js/components/slab.js',
  './js/views/card.js',
  './js/views/grade.js',
  './js/views/home.js',
  './js/views/library.js',
  './js/views/more.js',
  './js/views/scan.js',
  './js/views/search.js',
  './js/views/set.js',
];

const API_HOSTS = ['api.pokemontcg.io', 'api.tcgdex.net', 'api.frankfurter.dev', 'api.frankfurter.app', 'open.er-api.com'];
const IMAGE_HOSTS = ['images.pokemontcg.io', 'assets.tcgdex.net'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kk-v') && !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((res) => {
      if (res.ok || res.type === 'opaque') {
        cache.put(request, res.clone());
        trim(cacheName, max);
      }
      return res;
    })
    .catch(() => hit);
  return hit ?? fresh;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
      return;
    }
    // Serve the cached shell instantly and refresh it in the background, so a
    // new deploy shows up on the next start without breaking offline use.
    event.respondWith(staleWhileRevalidate(request, SHELL, 200));
    return;
  }
  if (API_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (IMAGE_HOSTS.includes(url.hostname) && !url.searchParams.has('cors')) {
    event.respondWith(staleWhileRevalidate(request, IMAGES, 600));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, LIBS));
  }
});
