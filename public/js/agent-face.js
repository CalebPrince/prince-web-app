// Shared "face" avatar for the AI agents (Lisa, Beacon, Nurturer) — a small
// circular avatar that visibly thinks (radar rings) and speaks (a breathing
// pulse), layered onto the existing text chat so a conversation reads as
// talking with someone rather than just typing into a box. Plain global —
// this project has no bundler, everything under /js is a script tag — used
// by ai-widget.js (Lisa's widget header) and admin-agent-chat.js (the
// Beacon/Nurturer admin console).
(function () {
  // Icon per agent. Lisa keeps the exact fill-style silhouette the widget
  // already used (established look, unchanged); Beacon/Nurturer get
  // stroke-style icons matching the mic/speaker icon language elsewhere in
  // ai-widget.js. Beacon's is a broadcast/radar mark (scouting, matches the
  // "Beacon" name); Nurturer's is a mail icon (matches her bi-envelope-heart
  // admin tab).
  const ICONS = {
    lisa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M12 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>',
    beacon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.25a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>',
    nurturer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg>',
  };

  /**
   * @param {'lisa'|'beacon'|'nurturer'} agentKey
   * @param {'sm'|'md'|'lg'} [size]
   * @returns {{el: HTMLElement, setThinking: (on: boolean) => void, setSpeaking: (on: boolean) => void}}
   */
  function create(agentKey, size) {
    const el = document.createElement("div");
    el.className = "agent-face" + (size ? " agent-face--" + size : "");
    el.innerHTML =
      '<span class="agent-face-core">' + (ICONS[agentKey] || ICONS.lisa) + "</span>"
      + '<span class="agent-face-ring" aria-hidden="true"></span>'
      + '<span class="agent-face-ring" aria-hidden="true"></span>';

    return {
      el,
      setThinking(on) { el.classList.toggle("is-thinking", !!on); },
      setSpeaking(on) { el.classList.toggle("is-speaking", !!on); },
    };
  }

  window.AgentFace = { create };
})();
