// Shared "face" avatar for the AI agents (Lisa, Beacon, Dossier, Nurturer, Proposal) —
// a small gradient orb with drawn eyes + a mouth that actually flaps while
// the agent talks (plus an idle blink), so a conversation reads as talking
// with a face rather than typing into a box. Colors match the original
// AgentAvatar mockup Caleb designed; the face itself replaces that mockup's
// static emoji with something that visibly speaks. Plain global — this
// project has no bundler, everything under /js is a script tag — used by
// ai-widget.js (Lisa's widget header) and admin-agent-chat.js (the
// Beacon/Dossier/Nurturer/Proposal admin console).
(function () {
  const AGENT_KEYS = ["lisa", "beacon", "dossier", "nurturer", "proposal", "content", "arch"];

  /**
   * @param {'lisa'|'beacon'|'dossier'|'nurturer'|'proposal'|'content'} agentKey
   * @param {'sm'|'md'|'lg'} [size]
   * @returns {{el: HTMLElement, setThinking: (on: boolean) => void, setSpeaking: (on: boolean) => void}}
   */
  function create(agentKey, size) {
    const key = AGENT_KEYS.includes(agentKey) ? agentKey : "lisa";
    const el = document.createElement("div");
    el.className = "agent-face agent-face--" + key + (size ? " agent-face--" + size : "");
    el.innerHTML =
      '<span class="agent-face-core">'
      + '<span class="agent-face-sheen" aria-hidden="true"></span>'
      + '<span class="agent-face-eyes" aria-hidden="true">'
      +   '<span class="agent-face-eye"></span>'
      +   '<span class="agent-face-eye"></span>'
      + "</span>"
      + '<span class="agent-face-mouth" aria-hidden="true"></span>'
      + '<span class="agent-face-dot" aria-hidden="true"></span>'
      + "</span>"
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
