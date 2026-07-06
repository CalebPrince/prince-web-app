(function () {
  const toggle = document.getElementById("ai-widget-toggle");
  let sessionToken = sessionStorage.getItem("chat_token") || null;
  let online = false;
  let canPrototype = false;
  let prototypeUrl = null;

  const panel = document.createElement("div");
  panel.id = "ai-widget-panel";
  panel.innerHTML = `
    <div class="p-3 border-bottom d-flex align-items-center gap-2">
      <div class="chat-avatar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>
      </div>
      <div class="flex-grow-1 lh-sm">
        <strong class="small d-block">Prince's Assistant</strong>
        <span class="chat-status small"><span class="status-dot" id="chat-status-dot"></span><span id="chat-status-text">Connecting…</span></span>
      </div>
      <button type="button" class="btn-close" id="ai-widget-close" aria-label="Close"></button>
    </div>
    <div id="ai-widget-messages"></div>
    <div id="ai-widget-actions" class="px-2 pb-2 d-none">
      <button type="button" class="btn-brand btn-sm w-100" id="build-prototype-btn">⚡ Build my prototype</button>
    </div>
    <form id="leave-msg-form" class="d-none p-2 border-top">
      <input type="text" class="form-control form-control-sm mb-2" id="lm-name" placeholder="Your name" required>
      <input type="email" class="form-control form-control-sm mb-2" id="lm-email" placeholder="Your email" required>
      <input type="tel" class="form-control form-control-sm mb-2" id="lm-phone" placeholder="Phone number (optional)">
      <textarea class="form-control form-control-sm mb-2" id="lm-message" rows="3" placeholder="What can Prince help you with?" required></textarea>
      <button type="submit" class="btn-brand btn-sm w-100" id="lm-submit">Send message</button>
    </form>
    <form id="ai-widget-form" class="d-flex gap-2 p-2 border-top">
      <input type="text" class="form-control form-control-sm" id="ai-widget-input" placeholder="e.g. a booking site for my salon" autocomplete="off" required>
      <button type="submit" class="btn btn-brand btn-sm">Send</button>
    </form>
  `;
  document.body.appendChild(panel);

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    el.textContent = text;
    document.getElementById("ai-widget-messages").appendChild(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  function setStatus(isOnline) {
    online = isOnline;
    document.getElementById("chat-status-dot").classList.toggle("online", isOnline);
    document.getElementById("chat-status-text").textContent = isOnline ? "Online" : "Offline";
  }

  function showPrototypeButton() {
    document.getElementById("ai-widget-actions").classList.toggle("d-none", !canPrototype);
  }

  // Online visitors get the chat input; offline (or a hard chat failure) gets
  // the leave-a-message form. There's no manual toggle between the two.
  function showMessageForm() {
    document.getElementById("leave-msg-form").classList.remove("d-none");
    document.getElementById("ai-widget-form").classList.add("d-none");
    document.getElementById("lm-name").focus();
  }

  // ---- opening state ---------------------------------------------------------

  (async function boot() {
    let status = { online: false };
    try {
      status = await api.get("/api/v1/chat/status");
    } catch (_) { /* offline defaults */ }
    setStatus(!!status.online);

    appendMessage("bot", status.greeting || "Hi there! 👋 Welcome.");
    if (status.online) {
      appendMessage("bot", status.intro || "Describe the website or app you have in mind — I'll ask a couple of questions, then build you a live concept prototype you can react to.");
    } else {
      appendMessage("bot", status.offline_message || "We're offline at the moment, but your message won't be missed — leave your name, email and a few words below and Prince will get back to you shortly.");
      showMessageForm();
    }
  })();

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
      pending.textContent = "Sorry, something went wrong. Please leave a message below instead.";
      showMessageForm();
    }
  });

  // ---- leave a message -------------------------------------------------------

  document.getElementById("leave-msg-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("lm-submit");
    btn.disabled = true;
    try {
      await api.post("/api/v1/chat/inquiry", {
        token: sessionToken,
        name: document.getElementById("lm-name").value.trim(),
        email: document.getElementById("lm-email").value.trim(),
        phone: document.getElementById("lm-phone").value.trim(),
        message: document.getElementById("lm-message").value.trim(),
      });
      const email = document.getElementById("lm-email").value.trim();
      document.getElementById("leave-msg-form").reset();
      document.getElementById("leave-msg-form").classList.add("d-none");
      appendMessage("bot", `Thanks! Your message is on its way — Prince will reply to you at ${email} soon. 📬`);
    } catch (err) {
      appendMessage("bot", err.message || "Could not send your message — please try again.");
    }
    btn.disabled = false;
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
          <textarea class="form-control form-control-sm mb-2" id="proto-comment" rows="2" placeholder="Any comments?"></textarea>
          <input type="text" class="form-control form-control-sm mb-2" id="proto-name" placeholder="Your name" required>
          <input type="email" class="form-control form-control-sm mb-2" id="proto-email" placeholder="Your email" required>
          <button type="submit" class="btn-brand btn-sm w-100" id="proto-submit">Send to Prince</button>
        </form>
      </div>
    `;
    document.getElementById("ai-widget-actions").classList.add("d-none");
    panel.insertBefore(view, document.getElementById("leave-msg-form"));

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
