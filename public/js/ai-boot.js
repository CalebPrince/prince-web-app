// Tiny, always-loaded bootstrap for the Live Chat widget. The widget JS is
// loaded on demand — but it auto-opens once per browser session so visitors
// see the greeting (or the offline message) without having to click.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("ai-widget-toggle");
  if (!toggle) return;

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    const script = document.createElement("script");
    script.src = "/js/ai-widget.js";
    document.body.appendChild(script);
  };

  toggle.addEventListener("click", load, { once: true });

  // Open the widget on the visitor's cursor leaving the top of the viewport
  // (classic exit-intent) — but only if it hasn't auto-shown yet this session,
  // so a fast leaver who bails before the 1.5s timer still sees the greeting,
  // and it never double-fires with the timed open below.
  const openOnce = () => {
    if (sessionStorage.getItem("chat_auto_shown")) return;
    if (toggle.classList.contains("d-none")) return;
    sessionStorage.setItem("chat_auto_shown", "1");
    load();
  };

  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget && e.clientY <= 0) openOnce();
  });

  if (!sessionStorage.getItem("chat_auto_shown")) {
    // Re-checked at fire time (not now) so content.js has had a chance to
    // hide the button first if Live Chat has been turned off in Settings,
    // and so exit-intent may have already claimed the one auto-open.
    setTimeout(() => {
      if (sessionStorage.getItem("chat_auto_shown")) return;
      if (toggle.classList.contains("d-none")) return;
      sessionStorage.setItem("chat_auto_shown", "1");
      load();
    }, 1500);
  }
});
