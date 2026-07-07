// First-party, minimal analytics beacon: path + referrer only, no cookies,
// no visitor ID. Fire-and-forget — never blocks or affects the page.
(function () {
  function send(path, referrer) {
    fetch("/api/v1/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        referrer,
      }),
      keepalive: true,
    }).catch(() => {});
  }

  // Track normal page views.
  send(window.location.pathname, document.referrer || "");

  // Lightweight event helper that reuses the same endpoint and storage.
  window.trackUiEvent = function (name) {
    const safeName = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_\-]/g, "_").slice(0, 80);
    if (!safeName) return;
    send(`/__event/${safeName}`, window.location.pathname);
  };
})();
