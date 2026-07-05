const api = {
  async request(path, options = {}) {
    const res = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
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
