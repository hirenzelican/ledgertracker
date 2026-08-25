/*
 * Service worker for Mother's Money.
 *
 * Deliberately conservative: it caches the application shell so the app opens instantly
 * and shows a proper offline screen, but it NEVER caches Supabase responses. Financial
 * data always comes from the network, so the balance on screen is either live or the app
 * says it could not load - it is never a stale number pretending to be current.
 */

const CACHE_VERSION = 'mothers-money-v1';
const SHELL_URLS = [
  '/',
  '/login/',
  '/transactions/',
  '/settings/',
  '/statement/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individually, so one missing URL cannot fail the whole install.
      .then((cache) => Promise.all(SHELL_URLS.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Anything not served from this origin (Supabase above all) goes straight to the
  // network and is never stored.
  if (url.origin !== self.location.origin) return;

  // Navigations: try the network first so a new deploy is picked up, fall back to the
  // cached shell, then to the offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('/') || caches.match('/offline.html')),
        ),
    );
    return;
  }

  // Build assets are content-hashed, so cache-first is safe and fast.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
