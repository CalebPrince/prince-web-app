// Minimal service worker: makes the site installable and keeps static assets
// available offline. Deliberately does NOT cache /api/* or /admin/* — this
// site's content changes often (blog, projects, pricing), and serving stale
// JSON or admin data offline would be worse than just failing normally.
const CACHE_VERSION = "v1";
const CACHE_NAME = `princecaleb-shell-${CACHE_VERSION}`;

const APP_SHELL = [
  "/css/app.css",
  "/js/api.js",
  "/js/theme.js",
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

  if (event.request.mode === "navigate") {
    // Pages: try the network first so content stays current; fall back to
    // cache only when genuinely offline.
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Static assets (css/js/icons/uploads): cache-first, refresh in the background.
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
