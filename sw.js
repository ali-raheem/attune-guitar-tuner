// The generated build stamp also versions the offline cache. New releases
// activate after existing app windows close.
importScripts('./version.js');
const VERSION = globalThis.ATTUNE_BUILD.cacheVersion;
const BASE = new URL('./', self.location.href);
const PREFIX = `attune:${BASE.pathname}:`;
const CACHE = `${PREFIX}${VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'pitch.js', 'confirmation.js', 'keep-awake.js', 'version.js', 'pwa.js',
  'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/dm-sans.ttf', 'fonts/manrope.ttf'
];
const ASSETS = new Set(FILES.map(file => new URL(file, BASE).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache =>
    cache.addAll([...ASSETS].map(url => new Request(url, { cache: 'reload' })))
  ));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin) return;
  // Only the app's own pages/assets are handled, even when mounted at /at/.
  // Navigation query parameters don't create separate copies of the app shell.
  if (event.request.mode === 'navigate') url.search = '';
  if (!ASSETS.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(url.href) || fetch(event.request);
  })());
});
