(function () {
  const toggle = document.getElementById("ai-widget-toggle");
  let sessionToken = sessionStorage.getItem("chat_token") || null;
  let online = false;
  let canPrototype = false;

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
      <button type="button" class="btn btn-sm btn-link text-decoration-none p-0 me-1" id="ai-widget-menu-btn" title="Menu" aria-label="Show menu">☰</button>
      <button type="button" class="btn-close" id="ai-widget-close" aria-label="Close"></button>
    </div>
    <div id="ai-widget-messages"></div>
    <div id="ai-widget-menu" class="ai-menu"></div>
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

  // ---- quick-reply menu -------------------------------------------------------
  //
  // A lightweight decision tree layered on top of the existing free-text chat.
  // Leaf options either hand off into the real AI conversation (projectLead —
  // exactly as if the visitor had typed the summary themselves, so tool-calling,
  // context, and prototype-building all keep working unchanged), or resolve
  // locally with no AI call at all (techInfo, portfolio, supportForm,
  // humanHandoff) since that content doesn't need a model to generate it.

  const MENU = {
    main: {
      prompt: "How can I help you today?",
      options: [
        { label: "🚀 Start a Project / Get a Quote", to: "startProject" },
        { label: "⚡ Tech Stack & Capabilities", to: "techStack" },
        { label: "💼 View Portfolio & Case Studies", action: "portfolio" },
        { label: "📞 Existing Client Support", to: "support" },
        { label: "💬 Talk to a Human", action: "humanHandoff" },
      ],
    },
    startProject: {
      prompt: "What kind of project are you thinking about?",
      back: "main",
      options: [
        { label: "📱 Mobile App Development", to: "mobileApp" },
        { label: "💻 Custom Web Application", to: "webApp" },
        { label: "🌐 Website & E-commerce", to: "website" },
        { label: "🤖 AI or Automation Integration", to: "aiAutomation" },
      ],
    },
    mobileApp: {
      prompt: "Mobile app — which platform?",
      back: "startProject",
      options: [
        { label: "🍎 iOS", action: "projectLead", text: "I'm interested in a mobile app for iOS." },
        { label: "🤖 Android", action: "projectLead", text: "I'm interested in a mobile app for Android." },
        { label: "🔀 Cross-Platform (Hybrid)", action: "projectLead", text: "I'm interested in a cross-platform (hybrid) mobile app." },
      ],
    },
    webApp: {
      prompt: "Custom web application — what shape is it?",
      back: "startProject",
      options: [
        { label: "🖥️ Frontend/Backend Build", action: "projectLead", text: "I need a custom web application — a frontend and backend build." },
        { label: "📊 SaaS Platform", action: "projectLead", text: "I want to build a SaaS platform." },
        { label: "🔐 Client/Admin Portal", action: "projectLead", text: "I need a custom client or admin portal." },
      ],
    },
    website: {
      prompt: "Website & e-commerce — what do you need?",
      back: "startProject",
      options: [
        { label: "🐘 Custom PHP/Bootstrap Site", action: "projectLead", text: "I need a custom PHP/Bootstrap website." },
        { label: "🛒 E-commerce Storefront", action: "projectLead", text: "I want an e-commerce storefront." },
        { label: "🏢 Corporate Site", action: "projectLead", text: "I need a corporate website." },
      ],
    },
    aiAutomation: {
      prompt: "AI or automation — what are you picturing?",
      back: "startProject",
      options: [
        { label: "🤖 Chatbot", action: "projectLead", text: "I'm interested in building a chatbot." },
        { label: "⚙️ Workflow Automation", action: "projectLead", text: "I'm interested in workflow automation." },
        { label: "🔌 Custom API Integration", action: "projectLead", text: "I need a custom API integration." },
      ],
    },
    techStack: {
      prompt: "What would you like to know about?",
      back: "main",
      options: [
        { label: "⚡ Frontend Technologies", action: "techInfo", key: "frontend" },
        { label: "⚙️ Backend & APIs", action: "techInfo", key: "backend" },
        { label: "🗄️ Database & Cloud", action: "techInfo", key: "database" },
        { label: "🛠️ CMS & Platforms", action: "techInfo", key: "cms" },
      ],
    },
    support: {
      prompt: "What do you need help with?",
      back: "main",
      options: [
        { label: "🐛 Report a Bug / Technical Issue", action: "supportForm", tag: "Bug Report" },
        { label: "📈 Request a Feature/Update", action: "supportForm", tag: "Feature Request" },
        { label: "💳 Billing & Invoicing Query", action: "supportForm", tag: "Billing Query" },
        { label: "🧑‍💻 Talk to my Project Manager", action: "supportForm", tag: "Talk to PM" },
      ],
    },
  };

  const TECH_INFO = {
    frontend: "⚡ On the frontend: plain HTML/CSS/JS or React when a build needs real interactivity, Bootstrap 5 or Tailwind for layout, and React Native for cross-platform mobile — no framework or build-step overhead unless the project actually calls for it.",
    backend: "⚙️ On the backend: PHP, Node.js, and Python/FastAPI, all built around clean REST APIs — picked per project, not a one-size-fits-all stack.",
    database: "🗄️ For data: MySQL, PostgreSQL, and SQLite for anything relational, NoSQL when the shape of the data calls for it, plus cloud object storage/CDNs for media-heavy features.",
    cms: "🛠️ For content: tailored WordPress builds, headless CMS setups, or a fully custom lightweight admin panel — whichever keeps day-to-day editing easy without dragging in more than you need.",
  };

  function clearMenu() {
    document.getElementById("ai-widget-menu").innerHTML = "";
  }

  // Buttons vanish the instant one is clicked (before its handler runs), so a
  // slow handler (e.g. projectLead's network call) can't be double-fired and
  // stale buttons from a previous step never linger once the user moves on.
  function renderButtonRow(buttons) {
    const container = document.getElementById("ai-widget-menu");
    container.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "ai-menu-hint";
    hint.textContent = "Tap an option below to reply:";
    container.appendChild(hint);
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-menu-btn" + (b.variant === "back" ? " ai-menu-back" : "");
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        container.innerHTML = "";
        b.onClick();
      });
      container.appendChild(btn);
    });
  }

  // skipPrompt lets a caller that just showed its own equivalent line (e.g.
  // boot()'s admin-configured intro, which often already asks "what can I
  // help with") drop straight to buttons instead of restating the question.
  function renderMenu(nodeId, { skipPrompt = false } = {}) {
    const node = MENU[nodeId];
    if (!skipPrompt) {
      appendMessage("bot", node.prompt);
    }
    const buttons = node.options.map((opt) => ({ label: opt.label, onClick: () => handleOption(opt) }));
    if (node.back) {
      buttons.push({ label: "⬅ Back", variant: "back", onClick: () => renderMenu(node.back) });
    }
    renderButtonRow(buttons);
  }

  function handleOption(opt) {
    if (opt.to) {
      renderMenu(opt.to);
      return;
    }
    switch (opt.action) {
      case "projectLead":
        sendChatMessage(opt.text);
        break;
      case "techInfo":
        appendMessage("bot", TECH_INFO[opt.key]);
        renderMenu("techStack");
        break;
      case "portfolio":
        showPortfolio();
        break;
      case "supportForm":
        startSupportForm(opt.tag);
        break;
      case "humanHandoff":
        showMessageForm();
        renderButtonRow([{ label: "⬅ Back to menu", variant: "back", onClick: backToMenuFromForm }]);
        break;
    }
  }

  async function showPortfolio() {
    const pending = appendMessage("bot", "One sec…");
    try {
      const projects = await api.get("/api/v1/projects");
      const top = projects.slice(0, 3);
      if (top.length) {
        pending.textContent = "A few things I've built recently:";
        top.forEach((p) => {
          const link = document.createElement("a");
          link.href = `/project.html?slug=${encodeURIComponent(p.slug)}`;
          link.textContent = `→ ${p.title}`;
          link.className = "d-block small mt-1";
          document.getElementById("ai-widget-messages").appendChild(link);
        });
      } else {
        pending.textContent = "Take a look at the full portfolio — new work gets added regularly.";
      }
    } catch (_) {
      pending.textContent = "Couldn't load the portfolio right now — take a look at the full page instead.";
    }
    renderButtonRow([
      { label: "📄 See all projects →", onClick: () => { window.location.href = "/projects.html"; } },
      { label: "⬅ Back to menu", variant: "back", onClick: () => renderMenu("main") },
    ]);
  }

  function startSupportForm(tag) {
    showMessageForm();
    const messageField = document.getElementById("lm-message");
    messageField.value = `[${tag}] `;
    messageField.focus();
    renderButtonRow([{ label: "⬅ Back to menu", variant: "back", onClick: backToMenuFromForm }]);
  }

  function backToMenuFromForm() {
    document.getElementById("leave-msg-form").classList.add("d-none");
    document.getElementById("leave-msg-form").reset();
    if (online) {
      document.getElementById("ai-widget-form").classList.remove("d-none");
    }
    renderMenu("main");
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
      renderMenu("main", { skipPrompt: true });
    } else {
      appendMessage("bot", status.offline_message || "We're offline at the moment, but your message won't be missed — leave your name, email and a few words below and Prince will get back to you shortly.");
      showMessageForm();
    }
  })();

  // ---- chat -----------------------------------------------------------------

  async function sendChatMessage(text) {
    appendMessage("user", text);
    const pending = appendMessage("bot", "Typing…");

    try {
      const res = await api.post("/api/v1/chat/message", { message: text, token: sessionToken }, { timeoutMs: 98000 });
      sessionToken = res.token;
      sessionStorage.setItem("chat_token", sessionToken);
      canPrototype = !!res.can_prototype;
      pending.textContent = res.reply;
      // Temporary debug aid — remove once the OpenRouter fallback is confirmed working in production.
      console.log(`[chat debug] mode=${res.mode} provider=${res.provider || "keyword fallback"}`);
      showPrototypeButton();
    } catch (err) {
      pending.textContent = err.message || "Sorry, something went wrong. Please leave a message below instead.";
      showMessageForm();
    }
  }

  document.getElementById("ai-widget-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("ai-widget-input");
    const message = input.value.trim();
    if (!message) return;
    input.value = "";
    clearMenu();
    await sendChatMessage(message);
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
      clearMenu();
      if (online) {
        document.getElementById("ai-widget-form").classList.remove("d-none");
        renderMenu("main");
      }
    } catch (err) {
      appendMessage("bot", err.message || "Could not send your message — please try again.");
    }
    btn.disabled = false;
  });

  // ---- prototype ------------------------------------------------------------

  // Building and reviewing the prototype happens in the full two-column
  // workspace page (more room for the preview) — this just hands off the
  // same session token so the conversation continues right where it left off.
  document.getElementById("build-prototype-btn").addEventListener("click", () => {
    window.location.href = "/chat.html?token=" + encodeURIComponent(sessionToken);
  });

  // ---- shell ------------------------------------------------------------------

  document.getElementById("ai-widget-menu-btn").addEventListener("click", () => {
    const lmForm = document.getElementById("leave-msg-form");
    if (!lmForm.classList.contains("d-none")) {
      lmForm.classList.add("d-none");
      if (online) {
        document.getElementById("ai-widget-form").classList.remove("d-none");
      }
    }
    renderMenu("main");
  });

  document.getElementById("ai-widget-close").addEventListener("click", () => {
    panel.style.display = "none";
  });
  toggle.addEventListener("click", () => {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });
  panel.style.display = "flex";
})();
