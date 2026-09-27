/**
 * Aught2 Pickleball — Progressive Web App (PWA) Service Worker
 *
 * Safe caching strategy:
 * - App shell & static assets: Precached & Stale-While-Revalidate
 * - Navigation (HTML pages): Network-first with offline.html fallback
 * - API requests & Dynamic data: STRICT NETWORK ONLY (NEVER CACHED)
 *   Ensures zero caching of private user data, tokens, auth state, or live match scores.
 */

const CACHE_NAME = 'aught2-shell-v1';

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

// ─── 1. Install Event ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        // Tolerant precache: if any single optional asset fails, continue
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
          .map((cacheName) => caches.delete(cacheName))
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
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // If valid response received from network, return it
          if (networkResponse && networkResponse.status === 200) {
            return networkResponse;
          }
          // Otherwise try cache or fallback
          return caches.match(request).then((cached) => cached || caches.match('/offline.html'));
        })
        .catch(async () => {
          // Network failed (offline) — return cached page if available, else offline.html
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        })
    );
    return;
  }

  // ─── C. Static Assets (JS bundles, CSS, fonts, static images, icons) ─────
  const isStaticAsset =
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/_expo/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    // Stale-While-Revalidate: Return cached response immediately while fetching update in background
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
          .catch(() => cachedResponse); // If network fails, fallback to cachedResponse

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
