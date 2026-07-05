// Tiny, always-loaded bootstrap: defers the real widget JS until the visitor
// actually wants it, so the AI feature never costs anything on first paint.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("ai-widget-toggle");
  if (!toggle) return;

  toggle.addEventListener(
    "click",
    () => {
      const script = document.createElement("script");
      script.src = "/js/ai-widget.js";
      document.body.appendChild(script);
    },
    { once: true }
  );
});
