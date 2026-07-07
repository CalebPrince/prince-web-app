(function () {
  const params = new URLSearchParams(window.location.search);
  const sessionToken = params.get("token") || sessionStorage.getItem("chat_token") || null;

  const emptyState = document.getElementById("workspace-empty");
  const mainState = document.getElementById("workspace-main");

  if (!sessionToken) {
    return; // empty state is already visible by default
  }
  sessionStorage.setItem("chat_token", sessionToken);

  let canBuild = false;
  let prototypeUrl = null;

  const messagesEl = document.getElementById("ws-messages");

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  function updateBuildButton() {
    const btn = document.getElementById("ws-build-btn");
    const hint = document.getElementById("ws-build-hint");
    btn.disabled = !canBuild;
    hint.classList.toggle("d-none", canBuild);
  }

  function showPreviewFrame() {
    document.getElementById("ws-preview-empty").classList.add("d-none");
    document.getElementById("ws-preview-frame-wrap").classList.remove("d-none");
    document.getElementById("ws-prototype-frame").src = prototypeUrl;
    document.getElementById("ws-fullscreen-link").href = prototypeUrl;
  }

  // ---- boot: rehydrate the conversation + prototype state ------------------

  (async function boot() {
    try {
      const session = await api.get(`/api/v1/chat/session/${encodeURIComponent(sessionToken)}`);
      emptyState.classList.add("d-none");
      mainState.classList.remove("d-none");

      (session.transcript || []).forEach((turn) => appendMessage(turn.role === "user" ? "user" : "bot", turn.text));
      canBuild = !!session.can_build;
      updateBuildButton();
      if (session.has_prototype && session.prototype_url) {
        prototypeUrl = session.prototype_url;
        showPreviewFrame();
      }
    } catch (err) {
      emptyState.classList.remove("d-none");
      mainState.classList.add("d-none");
      emptyState.querySelector("p").textContent = "This conversation could not be found — it may have expired.";
    }
  })();

  // ---- chat ------------------------------------------------------------------

  document.getElementById("ws-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("ws-input");
    const message = input.value.trim();
    if (!message) return;
    appendMessage("user", message);
    input.value = "";
    const pending = appendMessage("bot", "Typing…");

    try {
      const res = await api.post("/api/v1/chat/message", { message, token: sessionToken }, { timeoutMs: 45000 });
      pending.textContent = res.reply;
      canBuild = !!res.can_prototype;
      updateBuildButton();
      // Temporary debug aid — remove once the OpenRouter fallback is confirmed working in production.
      console.log(`[chat debug] mode=${res.mode} provider=${res.provider || "keyword fallback"}`);
    } catch (err) {
      pending.textContent = err.message || "Sorry, something went wrong — please try again.";
    }
  });

  // ---- build / rebuild ---------------------------------------------------------

  async function buildPrototype(btn) {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Building your prototype… (up to a minute)";
    try {
      const res = await api.post("/api/v1/chat/prototype", { token: sessionToken });
      prototypeUrl = res.url;
      showPreviewFrame();
    } catch (err) {
      appendMessage("bot", err.message || "Prototype generation failed — please try again.");
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.getElementById("ws-build-btn").addEventListener("click", (e) => buildPrototype(e.currentTarget));

  document.getElementById("ws-rebuild-btn").addEventListener("click", () => {
    document.getElementById("ws-preview-frame-wrap").classList.add("d-none");
    document.getElementById("ws-preview-empty").classList.remove("d-none");
    const btn = document.getElementById("ws-build-btn");
    btn.disabled = !canBuild;
    btn.textContent = "⚡ Build a new version";
  });

  // ---- responsive preview width toggle ------------------------------------------

  document.querySelectorAll("[data-width]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-width]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const stage = document.getElementById("ws-frame-stage");
      stage.classList.remove("width-tablet", "width-mobile");
      if (btn.dataset.width === "tablet") stage.classList.add("width-tablet");
      if (btn.dataset.width === "mobile") stage.classList.add("width-mobile");
    });
  });

  // ---- approve / request changes ------------------------------------------------

  let decision = null;
  const feedbackForm = document.getElementById("ws-feedback-form");

  document.getElementById("ws-approve").addEventListener("click", () => {
    decision = "approved";
    feedbackForm.classList.remove("d-none");
    document.getElementById("ws-comment").placeholder = "Anything to add? (optional)";
    document.getElementById("ws-fb-name").focus();
  });

  document.getElementById("ws-changes").addEventListener("click", () => {
    decision = "changes_requested";
    feedbackForm.classList.remove("d-none");
    document.getElementById("ws-comment").placeholder = "What should be different?";
    document.getElementById("ws-comment").focus();
  });

  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("ws-fb-submit");
    submitBtn.disabled = true;
    try {
      await api.post("/api/v1/chat/feedback", {
        token: sessionToken,
        decision,
        comment: document.getElementById("ws-comment").value.trim(),
        name: document.getElementById("ws-fb-name").value.trim(),
        email: document.getElementById("ws-fb-email").value.trim(),
      });
      feedbackForm.classList.add("d-none");
      feedbackForm.reset();
      appendMessage("bot", decision === "approved"
        ? "Amazing — thank you! Prince has been notified and will email you shortly to take it from here. 🎉"
        : "Got it — your change requests are with Prince. He'll follow up by email. Keep chatting to refine the idea, then rebuild.");
    } catch (err) {
      appendMessage("bot", err.message || "Could not send your feedback — please try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
