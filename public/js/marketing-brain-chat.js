(function () {
  const logEl = document.getElementById("sage-chat-log");
  const formEl = document.getElementById("sage-chat-form");
  const inputEl = document.getElementById("sage-chat-input");
  const sendBtn = document.getElementById("sage-chat-send");
  const msgEl = document.getElementById("sage-chat-msg");
  const nameEls = [document.getElementById("sage-chat-name"), document.getElementById("sage-chat-header-name")].filter(Boolean);
  if (!logEl || !formEl || !inputEl || !sendBtn) return;

  // sessionStorage (not localStorage) is deliberate: it survives a reload but
  // clears when the tab/browser actually closes, matching what a visitor
  // expects from a chat that "remembers" mid-visit without persisting forever.
  const STORAGE_KEY = "sage_chat_state";
  let transcript = []; // [{role: 'user'|'agent', text}]
  let token = null;
  let assistantName = "Sage";

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, transcript }));
    } catch (_) {
      // Storage full or unavailable (private browsing) — conversation just
      // won't survive a reload; nothing else to recover from.
    }
  }

  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = "sage-bubble " + (role === "user" ? "user" : "agent");
    bubble.textContent = text;
    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    return bubble;
  }

  function addTypingBubble() {
    const bubble = document.createElement("div");
    bubble.className = "sage-bubble agent";
    bubble.innerHTML = '<span class="ai-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
    bubble.setAttribute("aria-label", assistantName + " is typing");
    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    return bubble;
  }

  async function sendMessage(text) {
    addBubble("user", text);
    transcript.push({ role: "user", text });
    saveState();
    msgEl.classList.add("d-none");
    sendBtn.disabled = true;
    inputEl.disabled = true;
    const typing = addTypingBubble();

    try {
      const res = await api.post("/api/v1/agents/sage/chat", { message: text, transcript, token });
      typing.remove();
      addBubble("agent", res.reply);
      transcript.push({ role: "agent", text: res.reply });
      if (res.token) token = res.token;
      saveState();
    } catch (err) {
      typing.remove();
      msgEl.textContent = err.message;
      msgEl.classList.remove("d-none");
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    sendMessage(text);
  });

  document.querySelectorAll("[data-sage-starter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const text = btn.dataset.sageStarter;
      if (!text) return;
      sendMessage(text);
      logEl.closest(".sage-chat-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  (async function init() {
    try {
      const content = await api.get("/api/v1/content");
      if (content.sage_assistant_name) assistantName = content.sage_assistant_name;
    } catch (_) {
      // Fine to boot with the default name if Site Content can't be reached.
    }
    nameEls.forEach((el) => { el.textContent = assistantName; });

    const stored = loadState();
    if (stored && Array.isArray(stored.transcript) && stored.transcript.length) {
      token = stored.token || null;
      transcript = stored.transcript;
      transcript.forEach((turn) => addBubble(turn.role === "user" ? "user" : "agent", turn.text));
    } else {
      addBubble("agent", "I'm " + assistantName + ". Bring me a real marketing problem, an offer that isn't converting, a channel you're unsure about, a headline, a funnel that's stuck, and I'll work it through with you.");
    }
  })();
})();
