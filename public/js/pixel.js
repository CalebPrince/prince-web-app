// Embeddable analytics pixel for client portfolio sites. Reports back to
// princecaleb.dev's /api/v1/analytics/track (the same table + endpoint the
// main site's own beacon uses — see analytics.js — just with a `site` key so
// rows land against the right project). Embed with:
//   <script async src="https://princecaleb.dev/js/pixel.js" data-site="YOUR_TRACKING_KEY"></script>
(function () {
  var scriptEl = document.currentScript;
  var site = scriptEl ? scriptEl.getAttribute("data-site") : null;
  if (!site) return;

  var ENDPOINT = "https://princecaleb.dev/api/v1/analytics/track";

  function randomId() {
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2)
    ).slice(0, 32);
  }

  // Long-lived per-browser id (distinct "visitors") vs. per-tab-session id
  // (distinct "sessions", bounce rate) — same distinction any analytics tool
  // draws, just stored first-party with no cookie.
  function getOrSet(storage, key) {
    try {
      var existing = storage.getItem(key);
      if (existing) return existing;
      var fresh = randomId();
      storage.setItem(key, fresh);
      return fresh;
    } catch (e) {
      return randomId(); // storage blocked (private mode etc.) — degrade to one-off id
    }
  }

  var visitorId = getOrSet(window.localStorage, "pc_visitor_id");
  var sessionId = getOrSet(window.sessionStorage, "pc_session_id");

  function send(path) {
    var payload = JSON.stringify({
      site: site,
      path: path,
      referrer: document.referrer || "",
      visitor_id: visitorId,
      session_id: sessionId,
    });

    // sendBeacon (default text/plain body) keeps this a CORS-free "simple
    // request" and survives page unload; fetch+no-cors is the fallback for
    // browsers without it. Either way the response is never read.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      fetch(ENDPOINT, { method: "POST", mode: "no-cors", body: payload, keepalive: true }).catch(function () {});
    }
  }

  send(window.location.pathname);

  window.pcTrack = function (name) {
    var safeName = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, "_")
      .slice(0, 80);
    if (!safeName) return;
    send("/__event/" + safeName);
  };
})();
