const api = {
  async request(path, options = {}, isRetry = false) {
    const { timeoutMs, ...fetchOptions } = options;
    let signal = fetchOptions.signal;
    let timeoutId;
    if (timeoutMs) {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    let res;
    try {
      res = await fetch(path, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(fetchOptions.headers || {}) },
        ...fetchOptions,
        signal,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("That's taking longer than expected — please try again.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Access tokens only live 15 minutes; on a 401, refresh the session once
    // and retry instead of surfacing the error to the page.
    if (res.status === 401 && !isRetry && path !== "/api/v1/auth/refresh" && path !== "/api/v1/auth/login") {
      const refreshed = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
      if (refreshed.ok) {
        return this.request(path, options, true);
      }
    }

    let body = null;
    try {
      body = await res.json();
    } catch (_) {}
    if (!res.ok) {
      // res.statusText is always "" over HTTP/2 — the spec dropped reason
      // phrases — so any error without a JSON body (a 503 from the web server,
      // a PHP fatal, a proxy error page) used to throw an empty message, and
      // the admin rendered a red bar with nothing in it. That reads like "your
      // password is wrong", not "the server is down": during the LSPHP outage
      // it cost real time before we thought to look at the network tab. Always
      // leave the reader something they can act on.
      const message =
        (body && (body.error || (body.errors && body.errors.join(" "))))
        || res.statusText
        || `The server returned HTTP ${res.status} with no error message — it may be down or restarting.`;
      throw new Error(message);
    }
    return body;
  },
  get(path) {
    return this.request(path);
  },
  post(path, data, extra = {}) {
    return this.request(path, { method: "POST", body: JSON.stringify(data || {}), ...extra });
  },
  put(path, data) {
    return this.request(path, { method: "PUT", body: JSON.stringify(data || {}) });
  },
  patch(path, data) {
    return this.request(path, { method: "PATCH", body: JSON.stringify(data || {}) });
  },
  delete(path) {
    return this.request(path, { method: "DELETE" });
  },
};

// Remember the first page and campaign that brought a visitor into this tab.
// It stays in session storage and is sent only when they choose to make contact.
(function captureFirstTouch() {
  const key = "pc_lead_attribution";
  try {
    if (!sessionStorage.getItem(key)) {
      const params = new URLSearchParams(location.search);
      sessionStorage.setItem(key, JSON.stringify({
        landing_path: location.pathname + location.search,
        referrer: document.referrer || "",
        utm_source: params.get("utm_source") || "", utm_medium: params.get("utm_medium") || "",
        utm_campaign: params.get("utm_campaign") || "", utm_content: params.get("utm_content") || "",
        utm_term: params.get("utm_term") || "",
      }));
    }
  } catch (_) {}
  window.getLeadAttribution = function () {
    try { return JSON.parse(sessionStorage.getItem(key) || "{}"); } catch (_) { return {}; }
  };
})();
