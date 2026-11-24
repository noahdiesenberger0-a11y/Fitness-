/* Service Worker: macht Pulse offline nutzbar. Bei Änderungen VERSION erhöhen. */
const VERSION = 'pulse-v10';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './models.js', './exercises.js', './coach.js',
  './workout.js', './splits.js', './progress.js', './cloud.js', './social.js', './vendor/supabase-2.119.0.js', './vendor/qrcode-generator-1.4.4.js', './manifest.json',
  './manifest-blau.json', './manifest-hellblau.json',
  ...['blau', 'hellblau'].flatMap((c) => ['icon-192.png', 'apple-touch-icon.png', 'favicon-32.png'].map((f) => `./icons/${c}/${f}`)),
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/barlow-latin-400-normal.woff2', './fonts/barlow-latin-500-normal.woff2', './fonts/barlow-latin-600-normal.woff2',
  './fonts/barlow-semi-condensed-latin-600-normal.woff2', './fonts/barlow-semi-condensed-latin-700-normal.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first (immer aktuelle Version, wenn online), Cache als Offline-Fallback */
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
