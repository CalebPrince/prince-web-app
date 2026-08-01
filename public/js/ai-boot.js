// Tiny, always-loaded bootstrap for the Live Chat widget. The widget JS is
// loaded on demand, the first time the visitor actually clicks the bubble, // it never pops open on its own. Instead the bubble shows a small "1 unread"
// badge (dismissed for the rest of the session once clicked) as the hint to
// come talk to Lisa.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("ai-widget-toggle");
  if (!toggle) return;

  const badge = document.getElementById("ai-widget-badge");
  if (badge && sessionStorage.getItem("chat_badge_seen")) {
    badge.classList.add("d-none");
  }

  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    if (badge) badge.classList.add("d-none");
    sessionStorage.setItem("chat_badge_seen", "1");
    // agent-face.js first (Lisa's header avatar), ai-widget.js checks for
    // window.AgentFace at load time, so it must finish before ai-widget.js runs.
    const face = document.createElement("script");
    face.src = "/js/agent-face.js?v=20260731-scout-face";
    face.onload = () => {
      if (window.ElevenLabsTTS) {
        const widget = document.createElement("script");
        widget.src = "/js/ai-widget.js?v=20260728-elevenlabs-consistent";
        document.body.appendChild(widget);
        return;
      }
      const naturalVoice = document.createElement("script");
      naturalVoice.src = "/js/elevenlabs-tts.js?v=20260731-length-fallback-fix";
      naturalVoice.onload = naturalVoice.onerror = () => {
        const widget = document.createElement("script");
        widget.src = "/js/ai-widget.js?v=20260728-elevenlabs-consistent";
        document.body.appendChild(widget);
      };
      document.body.appendChild(naturalVoice);
    };
    document.body.appendChild(face);
  };

  toggle.addEventListener("click", load, { once: true });
});
