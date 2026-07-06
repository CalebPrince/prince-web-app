// First-party, minimal page-view beacon: path + referrer only, no cookies,
// no visitor ID. Fire-and-forget — never blocks or affects the page.
(function () {
  fetch("/api/v1/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer || "",
    }),
    keepalive: true,
  }).catch(() => {});
})();
