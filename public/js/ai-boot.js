// Tiny, always-loaded bootstrap for the Live Chat widget. The widget JS is
// loaded on demand, the first time the visitor actually clicks the bubble, // it never pops open on its own. Instead the bubble shows a small "1 unread"
// badge (dismissed for the rest of the session once clicked) as the hint to
// come talk to Lisa.
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("ai-widget-toggle");
  if (!toggle) return;

  const oldIcon = toggle.querySelector(".ai-toggle-icon");
  if (oldIcon) {
    oldIcon.outerHTML = '<svg class="ai-toggle-icon lisa-profile-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="24" cy="24" r="18"/><path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34"/><path d="M18 37c3.8 2.1 8.2 2.1 12 0"/></svg>';
  }
  toggle.classList.add("lisa-chat-toggle");

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
    face.src = "/js/agent-face.js?v=20260804-lisa-pulse";
    face.onload = () => {
      if (window.ElevenLabsTTS) {
        const widget = document.createElement("script");
        widget.src = "/js/ai-widget.js?v=20260803-lisa-pulse-mark";
        document.body.appendChild(widget);
        return;
      }
      const naturalVoice = document.createElement("script");
      naturalVoice.src = "/js/elevenlabs-tts.js?v=20260731-length-fallback-fix";
      naturalVoice.onload = naturalVoice.onerror = () => {
        const widget = document.createElement("script");
        widget.src = "/js/ai-widget.js?v=20260803-lisa-pulse-mark";
        document.body.appendChild(widget);
      };
      document.body.appendChild(naturalVoice);
    };
    document.body.appendChild(face);
  };

  toggle.addEventListener("click", load, { once: true });
});
