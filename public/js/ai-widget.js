(function () {
  const toggle = document.getElementById("ai-widget-toggle");

  const panel = document.createElement("div");
  panel.id = "ai-widget-panel";
  panel.innerHTML = `
    <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
      <strong class="small">Ask about my work</strong>
      <button type="button" class="btn-close" id="ai-widget-close" aria-label="Close"></button>
    </div>
    <div id="ai-widget-messages">
      <div class="ai-msg bot">Hi! Tell me what you're trying to build and I'll point you to the most relevant case study.</div>
    </div>
    <form id="ai-widget-form" class="d-flex gap-2 p-2 border-top">
      <input type="text" class="form-control form-control-sm" id="ai-widget-input" placeholder="e.g. a booking app" autocomplete="off" required>
      <button type="submit" class="btn btn-brand btn-sm">Ask</button>
    </form>
  `;
  document.body.appendChild(panel);

  document.getElementById("ai-widget-close").addEventListener("click", () => {
    panel.style.display = "none";
  });

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    el.textContent = text;
    document.getElementById("ai-widget-messages").appendChild(el);
    el.scrollIntoView({ block: "end" });
  }

  document.getElementById("ai-widget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("ai-widget-input");
    const message = input.value.trim();
    if (!message) return;
    appendMessage("user", message);
    input.value = "";
    appendMessage("bot", "Thinking…");

    try {
      const res = await api.post("/api/v1/ai/chat", { message });
      document.querySelectorAll("#ai-widget-messages .ai-msg.bot").forEach((el, i, arr) => {
        if (i === arr.length - 1) el.textContent = res.reply;
      });
    } catch (err) {
      document.querySelectorAll("#ai-widget-messages .ai-msg.bot").forEach((el, i, arr) => {
        if (i === arr.length - 1) el.textContent = "Sorry, something went wrong. Please use the contact form instead.";
      });
    }
  });

  toggle.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });
  panel.style.display = "flex";
})();
