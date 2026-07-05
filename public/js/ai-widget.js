(function () {
  const toggle = document.getElementById("ai-widget-toggle");
  let sessionToken = sessionStorage.getItem("chat_token") || null;
  let canPrototype = false;
  let prototypeUrl = null;

  const panel = document.createElement("div");
  panel.id = "ai-widget-panel";
  panel.innerHTML = `
    <div class="p-3 border-bottom d-flex justify-content-between align-items-center">
      <strong class="small">Live Chat — tell me what you need</strong>
      <button type="button" class="btn-close" id="ai-widget-close" aria-label="Close"></button>
    </div>
    <div id="ai-widget-messages">
      <div class="ai-msg bot">Hi! Describe the website or app you have in mind — I'll ask a couple of questions, then build you a live concept prototype you can react to.</div>
    </div>
    <div id="ai-widget-actions" class="px-2 pb-2 d-none">
      <button type="button" class="btn-brand btn-sm w-100" id="build-prototype-btn">⚡ Build my prototype</button>
    </div>
    <form id="ai-widget-form" class="d-flex gap-2 p-2 border-top">
      <input type="text" class="form-control form-control-sm" id="ai-widget-input" placeholder="e.g. a booking site for my salon" autocomplete="off" required>
      <button type="submit" class="btn btn-brand btn-sm">Send</button>
    </form>
  `;
  document.body.appendChild(panel);

  const messagesBox = () => document.getElementById("ai-widget-messages");

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    el.textContent = text;
    messagesBox().appendChild(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  function showPrototypeButton() {
    document.getElementById("ai-widget-actions").classList.toggle("d-none", !canPrototype);
  }

  // ---- chat -----------------------------------------------------------------

  document.getElementById("ai-widget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("ai-widget-input");
    const message = input.value.trim();
    if (!message) return;
    appendMessage("user", message);
    input.value = "";
    const pending = appendMessage("bot", "Typing…");

    try {
      const res = await api.post("/api/v1/chat/message", { message, token: sessionToken });
      sessionToken = res.token;
      sessionStorage.setItem("chat_token", sessionToken);
      canPrototype = !!res.can_prototype;
      pending.textContent = res.reply;
      showPrototypeButton();
    } catch (err) {
      pending.textContent = "Sorry, something went wrong. Please use the contact form instead.";
    }
  });

  // ---- prototype ------------------------------------------------------------

  document.getElementById("build-prototype-btn").addEventListener("click", async () => {
    const btn = document.getElementById("build-prototype-btn");
    btn.disabled = true;
    btn.textContent = "Building your prototype… (up to a minute)";

    try {
      const res = await api.post("/api/v1/chat/prototype", { token: sessionToken });
      prototypeUrl = res.url;
      showPrototypeView();
    } catch (err) {
      appendMessage("bot", err.message || "Prototype generation failed — please try again.");
      btn.disabled = false;
      btn.textContent = "⚡ Build my prototype";
    }
  });

  function showPrototypeView() {
    const view = document.createElement("div");
    view.id = "prototype-view";
    view.innerHTML = `
      <div class="p-2 border-top">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong class="small">Your concept prototype</strong>
          <a href="${prototypeUrl}" target="_blank" rel="noopener" class="small">Open full screen ↗</a>
        </div>
        <iframe id="prototype-frame" src="${prototypeUrl}" sandbox=""></iframe>
        <div class="d-flex gap-2 mt-2">
          <button type="button" class="btn btn-sm btn-success flex-fill" id="proto-approve">✓ I love it</button>
          <button type="button" class="btn btn-sm btn-outline-secondary flex-fill" id="proto-changes">Request changes</button>
        </div>
        <form id="proto-feedback-form" class="d-none mt-2">
          <textarea class="form-control form-control-sm mb-2" id="proto-comment" rows="2" placeholder="Any comments? (optional for approval)"></textarea>
          <input type="text" class="form-control form-control-sm mb-2" id="proto-name" placeholder="Your name" required>
          <input type="email" class="form-control form-control-sm mb-2" id="proto-email" placeholder="Your email" required>
          <button type="submit" class="btn-brand btn-sm w-100" id="proto-submit">Send to Prince</button>
        </form>
      </div>
    `;
    document.getElementById("ai-widget-actions").classList.add("d-none");
    panel.insertBefore(view, document.getElementById("ai-widget-form"));

    let decision = null;
    const form = document.getElementById("proto-feedback-form");

    document.getElementById("proto-approve").addEventListener("click", () => {
      decision = "approved";
      form.classList.remove("d-none");
      document.getElementById("proto-comment").placeholder = "Anything to add? (optional)";
      document.getElementById("proto-name").focus();
    });
    document.getElementById("proto-changes").addEventListener("click", () => {
      decision = "changes_requested";
      form.classList.remove("d-none");
      document.getElementById("proto-comment").placeholder = "What should be different?";
      document.getElementById("proto-comment").focus();
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("proto-submit");
      submitBtn.disabled = true;
      try {
        await api.post("/api/v1/chat/feedback", {
          token: sessionToken,
          decision,
          comment: document.getElementById("proto-comment").value.trim(),
          name: document.getElementById("proto-name").value.trim(),
          email: document.getElementById("proto-email").value.trim(),
        });
        view.remove();
        appendMessage("bot", decision === "approved"
          ? "Amazing — thank you! Prince has been notified and will email you shortly to take it from here. 🎉"
          : "Got it — your change requests are with Prince. He'll follow up by email. You can keep chatting to refine the idea, then build a new version.");
        canPrototype = decision !== "approved";
        showPrototypeButton();
        if (canPrototype) {
          document.getElementById("build-prototype-btn").disabled = false;
          document.getElementById("build-prototype-btn").textContent = "⚡ Build a new version";
        }
      } catch (err) {
        submitBtn.disabled = false;
        appendMessage("bot", err.message || "Could not send your feedback — please try again.");
      }
    });
  }

  // ---- shell ------------------------------------------------------------------

  document.getElementById("ai-widget-close").addEventListener("click", () => {
    panel.style.display = "none";
  });
  toggle.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });
  panel.style.display = "flex";
})();
