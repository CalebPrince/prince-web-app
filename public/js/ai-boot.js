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

  if (!sessionStorage.getItem("chat_auto_shown")) {
    sessionStorage.setItem("chat_auto_shown", "1");
    // Re-checked at fire time (not now) so content.js has had a chance to
    // hide the button first if Live Chat has been turned off in Settings.
    setTimeout(() => {
      if (!toggle.classList.contains("d-none")) load();
    }, 1500);
  }
});
