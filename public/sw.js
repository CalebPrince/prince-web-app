// Minimal service worker: makes the site installable and keeps static assets
// available offline. Deliberately does NOT cache /api/* or /admin/* — this
// site's content changes often (blog, projects, pricing), and serving stale
// JSON or admin data offline would be worse than just failing normally.
//
// CSS/JS use network-first (like navigation), not cache-first: this site is
// under active, frequent deployment, and cache-first previously meant a
// returning visitor's browser could keep serving pre-deploy CSS/JS for a
// while after a push. Only genuinely static binary assets (icons) are
// cache-first. Bump CACHE_VERSION on any change here to force old caches
// to be dropped on next activate.
const CACHE_VERSION = "v3";
const CACHE_NAME = `princecaleb-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "/css/app.css",
  "/js/api.js",
  "/js/theme.js",
  "/js/utility-dock.js",
  "/js/content.js",
  "/js/animations.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API calls or the admin panel — always hit the network.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin/")) {
    return;
  }

  if (event.request.mode === "navigate" || url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/")) {
    // Pages, CSS, and JS: network-first so a fresh deploy is visible
    // immediately; cache is purely an offline fallback, never the primary
    // source while online.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || (event.request.mode === "navigate" ? caches.match("/") : undefined)))
    );
    return;
  }

  // Everything else (icons, uploads, fonts): cache-first, refresh in the background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
