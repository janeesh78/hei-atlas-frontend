/* Hei Atlas service worker
 *
 * Responsibilities:
 *   1. Cache the app shell (HTML + JS chunks + CSS + Inter font) for offline boot.
 *   2. Network-first for navigation (bounded 3s wait) so a reload picks up
 *      the latest deploy, falling back to the cached shell offline.
 *   3. Network-only for API calls (we never want to serve cached PHI or
 *      cached responses to /notes/generate, /transcription/, /cds/*).
 *   4. Background Sync — when the browser fires the 'recording-upload' tag,
 *      notify open clients to drain the IndexedDB queue.
 */

// Bump on any SW logic change OR when a same-URL static asset (globe.png,
// world.jpg) changes bytes — this triggers cache purge in the activate handler.
const CACHE = 'hei-atlas-shell-v8';

// Files we want available offline. We don't enumerate Next.js chunks here
// because their hashed names are unstable across builds — those are cached
// at runtime via the stale-while-revalidate handler.
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  // Atomic install: if the precache fails (flaky network), let the install
  // FAIL rather than swallow it — the browser keeps the previous SW + its
  // cache and retries later. Swallowing here + the activate purge below used
  // to destroy the working offline shell on a bad-network deploy.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only purge old caches once the NEW cache actually holds the shell —
      // never leave the client with no cached '/' to boot from offline.
      const shell = await caches.match('/', { cacheName: CACHE });
      if (shell) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      }
      await self.clients.claim();
    })()
  );
});

// Helper: classify request
function isApiRequest(url) {
  const u = new URL(url);
  // Cross-origin requests always go to the backend — network-only, no caching.
  // Covers production (frontend on vercel.app, backend on fly.dev) and any
  // preview URL that talks to the same API host.
  if (u.origin !== self.location.origin) return true;
  // Next.js build output is ALWAYS a static asset, never an API call. Check
  // this first: the API keyword regex below would otherwise match route
  // chunks like /_next/static/chunks/app/admin/page-<hash>.js (the '/admin'
  // segment) and exclude them from caching, breaking that route offline.
  if (u.pathname.startsWith('/_next/')) return false;
  // Same-origin dev fallback (local uvicorn on :8000).
  if (u.port === '8000') return true;
  // Same-origin proxy relay (next.config.js rewrite) — everything under
  // /backend/ is an API response and must never be cached.
  if (u.pathname === '/backend' || u.pathname.startsWith('/backend/')) return true;
  // API routes match as the FIRST path segment (anchored) so a route named
  // like an API prefix (/admin page) isn't misread as an API call.
  return /^\/(transcription|notes|cds|sync|debug|audit|fhir|diagnosis|health|stats|auth|encounters|preferences|admin|activity|location|feedback|contact)\b/.test(u.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache POST/PUT/DELETE
  if (isApiRequest(request.url)) return; // network-only for API

  // Navigation: network-first with a bounded wait, cached-shell fallback.
  // Serving the cached shell FIRST (the old stale-while-revalidate) meant a
  // reload after a deploy still booted the previous bundle — a tab could run
  // pre-deploy JS indefinitely. Network-first picks deploys up on the first
  // reload; flaky/offline clinics fall back to the cached shell after 3s
  // instead of hanging.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match('/');
        const network = fetch(request).then((res) => {
          // Refresh the shell key only from the real landing document —
          // route HTML (/app/ambient etc.) must not overwrite it.
          if (res && res.status === 200 && new URL(request.url).pathname === '/') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/', copy)).catch(() => undefined);
          }
          return res;
        });
        network.catch(() => undefined); // late failure after fallback is not unhandled
        try {
          if (!cached) return await network;
          return await Promise.race([
            network,
            new Promise((_, reject) => setTimeout(() => reject(new Error('nav-timeout')), 3000)),
          ]);
        } catch {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Static assets (JS/CSS/fonts/images): cache-first with background refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type !== 'opaque') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// ─── Background Sync ──────────────────────────────────────────────────────
//
// The page-side recording queue calls `registration.sync.register('recording-upload')`
// every time it enqueues. Browsers that support Background Sync (Chrome on
// Android / desktop) will fire this event when the network returns — even
// if the tab is closed. We delegate the actual draining to any live client
// via a BroadcastChannel; if no client is alive, we wake the tab.
self.addEventListener('sync', (event) => {
  if (event.tag !== 'recording-upload') return;
  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
      if (clientsList.length > 0) {
        for (const c of clientsList) c.postMessage({ type: 'drain-queue' });
        return;
      }
      // No client alive — try to wake one if possible (best-effort).
      try {
        await self.clients.openWindow('/');
      } catch {
        /* swallow — Background Sync silently completes */
      }
    })()
  );
});

// Allow the page to ask us to skip waiting (e.g., after deploy)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
