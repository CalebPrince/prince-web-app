(function () {
  function send(message, extra) {
    try {
      var payload = Object.assign({
        message: String(message || 'Unknown error').slice(0, 500),
        source: window.location.href,
      }, extra || {});
      fetch('/api/v1/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Never let error reporting itself throw.
    }
  }

  window.addEventListener('error', function (event) {
    // Only real JS runtime errors carry an Error object here — plain
    // resource load failures (an image/script 404ing) fire 'error' too but
    // have no .error and aren't useful noise for this log.
    if (!event.error) return;
    send(event.message, {
      line: event.lineno,
      col: event.colno,
      stack: event.error && event.error.stack ? String(event.error.stack) : undefined,
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message = reason && reason.message ? reason.message : String(reason);
    send(message, { stack: reason && reason.stack ? String(reason.stack) : undefined });
  });
})();
