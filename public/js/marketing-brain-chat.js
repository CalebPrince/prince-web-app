(function () {
  const logEl = document.getElementById("sage-chat-log");
  const formEl = document.getElementById("sage-chat-form");
  const inputEl = document.getElementById("sage-chat-input");
  const sendBtn = document.getElementById("sage-chat-send");
  const msgEl = document.getElementById("sage-chat-msg");
  const nameEls = [document.getElementById("sage-chat-name"), document.getElementById("sage-chat-header-name")].filter(Boolean);
  if (!logEl || !formEl || !inputEl || !sendBtn) return;

  let transcript = []; // [{role: 'user'|'agent', text}]
  let assistantName = "Sage";

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
    msgEl.classList.add("d-none");
    sendBtn.disabled = true;
    inputEl.disabled = true;
    const typing = addTypingBubble();

    try {
      const res = await api.post("/api/v1/agents/sage/chat", { message: text, transcript });
      typing.remove();
      addBubble("agent", res.reply);
      transcript.push({ role: "agent", text: res.reply });
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
    addBubble("agent", "I'm " + assistantName + ". Bring me a real marketing problem, an offer that isn't converting, a channel you're unsure about, a headline, a funnel that's stuck, and I'll work it through with you.");
  })();
})();
