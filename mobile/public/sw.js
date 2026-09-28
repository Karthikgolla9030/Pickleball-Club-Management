/**
 * Aught2 Pickleball — Progressive Web App (PWA) Service Worker
 *
 * Safe caching strategy:
 * - App shell & static assets: Precached & Stale-While-Revalidate
 * - Navigation (HTML pages): Network-first with offline.html fallback
 * - API requests & Dynamic data: STRICT NETWORK ONLY (NEVER CACHED)
 *   Ensures zero caching of private user data, tokens, auth state, or live match scores.
 */

const CACHE_NAME = 'aught2-shell-v2';

// Essential app shell and static resources precached during install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
  '/icons/apple-touch-icon.png',
];

// ─── Message Event ─────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── 1. Install Event ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache asset fetch notice:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── 2. Activate Event ──────────────────────────────────────────────────────
// Cleans up legacy / obsolete cache versions and immediately claims clients.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('[SW] Purging outdated cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── 3. Fetch Event ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle HTTP/HTTPS GET requests
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // ─── A. SECURITY RULE: NEVER cache API, auth, websocket, or backend data ──
  const isApiRequest =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/v1/') ||
    url.hostname.includes('render.com') ||
    url.hostname.includes('onrender.com') ||
    url.port === '8000';

  if (isApiRequest) {
    // Pure network request — no caching of sensitive tokens or live scores
    event.respondWith(fetch(request));
    return;
  }

  // ─── B. Navigation Requests (HTML document navigation) ────────────────────
  // STRICT NETWORK-FIRST: Always fetch latest index.html from server to get new bundle hashes
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            return networkResponse;
          }
          return caches.match(request).then((cached) => cached || caches.match('/offline.html'));
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // ─── C. Scripts & JS Bundles ──────────────────────────────────────────────
  // STRICT NETWORK-FIRST: Always load fresh JavaScript chunks so code updates take effect immediately
  const isScript =
    request.destination === 'script' ||
    url.pathname.endsWith('.js') ||
    url.pathname.startsWith('/_expo/');

  if (isScript) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // ─── D. Static Media Assets (CSS, fonts, images, icons) ───────────────────
  const isStaticMedia =
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2');

  if (isStaticMedia) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default fallback: Network with cache fallback
  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
