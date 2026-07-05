const api = {
  async request(path, options = {}, isRetry = false) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });

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
      const message = body && (body.error || (body.errors && body.errors.join(" "))) || res.statusText;
      throw new Error(message);
    }
    return body;
  },
  get(path) {
    return this.request(path);
  },
  post(path, data) {
    return this.request(path, { method: "POST", body: JSON.stringify(data || {}) });
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
