/* Ashar Control service worker — hand-rolled, no dependencies.
 * Strategy:
 *  - App shell (/, /notes, /admin, manifest, icons) is precached on install.
 *  - Navigations and same-origin static assets: cache-first, network fallback.
 *  - /api/* : ALWAYS network. Never cached — the app's own localStorage
 *    offline layer handles data when the network fails.
 *  - Only GET requests are touched.
 */
const CACHE = "ashar-control-v1";
const SHELL = [
  "/",
  "/notes",
  "/admin",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* precache best-effort: a failed asset must not block the worker */
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: always network, never cached.
  if (isApi(url)) {
    event.respondWith(fetch(request));
    return;
  }

  const isNav = request.mode === "navigate";

  // Cache-first for navigations and static assets, network fallback.
  if (isNav || isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Stale-while-revalidate: keep the shell fresh without blocking.
          event.waitUntil(
            fetch(request)
              .then((res) => {
                if (res && res.ok) {
                  caches.open(CACHE).then((cache) => cache.put(request, res.clone()));
                }
              })
              .catch(() => {})
          );
          return cached;
        }
        return fetch(request).then((res) => {
          if (res && res.ok && (isNav || isStaticAsset(url))) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else (page data, chunks, fonts): network-first, cache fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
