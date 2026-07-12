(function () {
  const toggle = document.getElementById("ai-widget-toggle");
  let sessionToken = sessionStorage.getItem("chat_token") || null;
  let online = false;
  // Read-aloud every reply automatically when on (visitor-controlled, header
  // toggle) — remembered for the browser session.
  let autoSpeak = sessionStorage.getItem("chat_autospeak") === "1";

  const panel = document.createElement("div");
  panel.id = "ai-widget-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Live chat with Lisa");
  panel.innerHTML = `
    <div class="p-3 border-bottom d-flex align-items-center gap-2">
      <div class="chat-avatar">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <path d="M12 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>
      </div>
      <div class="flex-grow-1 lh-sm">
        <strong class="chat-title d-block">Prince's Assistant</strong>
        <span class="chat-status small"><span class="status-dot" id="chat-status-dot"></span><span id="chat-status-text">Connecting…</span></span>
      </div>
      <button type="button" class="btn btn-sm btn-link text-decoration-none p-0 me-1" id="ai-widget-autospeak" title="Auto read-aloud"></button>
      <button type="button" class="btn btn-sm btn-link text-decoration-none p-0 me-1" id="ai-widget-menu-btn" title="Menu" aria-label="Show menu"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></button>
      <button type="button" class="btn-close" id="ai-widget-close" aria-label="Close"></button>
    </div>
    <div id="ai-widget-messages" role="log" aria-live="polite" aria-label="Conversation with Lisa"></div>
    <div id="ai-widget-menu" class="ai-menu"></div>
    <form id="leave-msg-form" class="d-none p-2 border-top">
      <input type="text" class="form-control form-control-sm mb-2" id="lm-name" placeholder="Your name" required>
      <input type="email" class="form-control form-control-sm mb-2" id="lm-email" placeholder="Your email" required>
      <input type="tel" class="form-control form-control-sm mb-2" id="lm-phone" placeholder="Phone number (optional)">
      <textarea class="form-control form-control-sm mb-2" id="lm-message" rows="3" placeholder="What can Prince help you with?" required></textarea>
      <button type="submit" class="btn-brand btn-sm w-100" id="lm-submit">Send message</button>
    </form>
    <form id="ai-widget-form" class="d-flex gap-2 p-2 border-top">
      <input type="text" class="form-control form-control-sm" id="ai-widget-input" placeholder="e.g. a booking site for my salon" autocomplete="off" required>
      <button type="button" class="ai-input-mic" id="ai-widget-mic" title="Speak your message" aria-label="Speak your message"></button>
      <button type="submit" class="btn btn-brand btn-sm">Send</button>
    </form>
  `;
  document.body.appendChild(panel);

  // ---- voice + notification tone ---------------------------------------------
  //
  // Whenever Lisa posts a text reply we play a short chime (Web Audio) and hang
  // a mic button off the message that reads *that exact text* aloud on demand
  // (Web Speech API). Both are progressive enhancements — if the browser lacks
  // the API the chat still works, just without sound. Placeholder bubbles
  // ("Typing…", "One sec…") are skipped; they're decorated once the real reply
  // lands via resolveBotMessage().

  const PLACEHOLDERS = new Set(["Typing…", "One sec…"]);
  // Speaker = Lisa reading a reply aloud (playback). Muted variant = auto
  // read-aloud turned off.
  const SPEAKER_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
  const SPEAKER_MUTE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  // Mic = visitor dictating their message (speech-to-text input).
  const MIC_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>';

  let audioCtx = null;
  function playTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch (_) { /* audio unsupported or blocked until a user gesture */ }
  }

  // Admin-configured voice (Site Content → Live Chat), delivered by
  // /api/v1/chat/status. The browser owns the actual voices, so these are
  // preferences we match against whatever the visitor's device offers.
  let voiceConfig = { gender: "female", accent: "en-GB", rate: 1, pitch: 1 };
  // Admin-configured assistant name/persona, also from /api/v1/chat/status.
  // Drives the header title and the "…is typing" accessibility label so the
  // widget matches whatever name the bot introduces itself with server-side.
  let assistantName = "Lisa";
  const FEMALE_RE = /(female|zira|susan|hazel|linda|samantha|karen|moira|tessa|fiona|serena|catherine|aria|jenny|sonia|libby|amy|joanna|salli|kimberly|google uk english female)/i;
  const MALE_RE = /(\bmale\b|david|mark|george|guy|ryan|thomas|daniel|alex|fred|oliver|james|brian|matthew|arthur|google uk english male)/i;

  // Some browsers populate voices asynchronously — nudge them to load early so
  // the first mic click already has the full list to choose from.
  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener &&
      window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
  }

  // Pick the closest match to the admin's gender + accent preference, degrading
  // gracefully: accent+gender → gender (any accent) → accent (any gender) →
  // any English → whatever exists. Never returns the *opposite* gender while a
  // same-gender option is still available.
  function pickVoice(voices, cfg) {
    if (!voices.length) return null;
    const accent = cfg.accent && cfg.accent !== "auto" ? cfg.accent.toLowerCase() : null;
    const wantRe = cfg.gender === "male" ? MALE_RE : cfg.gender === "female" ? FEMALE_RE : null;
    const notRe = cfg.gender === "male" ? FEMALE_RE : cfg.gender === "female" ? MALE_RE : null;

    const en = voices.filter((v) => /^en/i.test(v.lang));
    const byAccent = accent ? en.filter((v) => v.lang.toLowerCase().startsWith(accent)) : en;

    const tiers = [];
    if (wantRe) {
      tiers.push(byAccent.filter((v) => wantRe.test(v.name) && !notRe.test(v.name)));
      tiers.push(byAccent.filter((v) => wantRe.test(v.name)));
      tiers.push(en.filter((v) => wantRe.test(v.name) && !notRe.test(v.name)));
      tiers.push(en.filter((v) => wantRe.test(v.name)));
    }
    tiers.push(byAccent, en, voices);
    for (const tier of tiers) {
      if (tier && tier.length) return tier[0];
    }
    return null;
  }

  let speakingBtn = null;
  function setSpeaking(btn, on) {
    if (on) {
      if (speakingBtn && speakingBtn !== btn) speakingBtn.classList.remove("speaking");
      speakingBtn = btn;
      btn.classList.add("speaking");
    } else {
      btn.classList.remove("speaking");
      if (speakingBtn === btn) speakingBtn = null;
    }
  }

  // Strip emoji (and their modifiers/joiners) before speaking so the voice
  // reads the words only — otherwise many TTS engines announce emoji names
  // aloud ("waving hand", "rocket"). The on-screen message keeps its emoji;
  // only the spoken copy is cleaned.
  function stripForSpeech(text) {
    return text
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function speak(text, btn) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    // Clicking the mic of a message that's already talking stops it.
    if (speakingBtn === btn) { synth.cancel(); return; }
    synth.cancel();
    const spoken = stripForSpeech(text);
    if (!spoken) return; // nothing but emoji — no words to read
    const u = new SpeechSynthesisUtterance(spoken);
    u.rate = Math.min(2, Math.max(0.5, Number(voiceConfig.rate) || 1));
    u.pitch = Math.min(2, Math.max(0, Number(voiceConfig.pitch) || 1));
    const voice = pickVoice(synth.getVoices(), voiceConfig);
    if (voice) {
      u.voice = voice;
      if (voice.lang) u.lang = voice.lang;
    }
    u.onstart = () => setSpeaking(btn, true);
    u.onend = () => setSpeaking(btn, false);
    u.onerror = () => setSpeaking(btn, false);
    synth.speak(u);
  }

  // Build the read-aloud speaker button for a finished reply and return it so
  // the caller can auto-speak. Null when the browser has no speech synthesis.
  function addSpeakButton(el, text) {
    if (!("speechSynthesis" in window)) return null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ai-speak-btn";
    btn.title = "Read aloud";
    btn.setAttribute("aria-label", "Read this message aloud");
    btn.innerHTML = SPEAKER_SVG;
    btn.addEventListener("click", () => speak(text, btn));
    el.appendChild(document.createTextNode(" "));
    el.appendChild(btn);
    return btn;
  }

  // Instant decoration for boot/menu bubbles (no typewriter).
  function decorateBotMessage(el, text) {
    el.textContent = text;
    const btn = addSpeakButton(el, text);
    if (btn && autoSpeak) speak(text, btn);
  }

  // Reveal Lisa's reply word-by-word for a natural, "alive" feel. Honors
  // prefers-reduced-motion and skips very short strings. NOTE: this animates an
  // already-received reply — it does not change how long the model takes; the
  // animated typing indicator (see appendMessage) covers that actual wait.
  function typewriterReveal(el, text, onDone) {
    const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tokens = text.split(/(\s+)/); // words + whitespace, preserved
    if (reduced || tokens.length <= 3) {
      el.textContent = text;
      onDone && onDone();
      return;
    }
    const messages = document.getElementById("ai-widget-messages");
    const stuckToBottom = () => messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
    el.textContent = "";
    let i = 0;
    const step = () => {
      const stick = stuckToBottom();
      el.textContent += (tokens[i] || "") + (tokens[i + 1] || "");
      i += 2;
      if (stick) el.scrollIntoView({ block: "end" });
      if (i < tokens.length) {
        setTimeout(step, 26);
      } else {
        el.textContent = text; // guarantee exact final text
        onDone && onDone();
      }
    };
    step();
  }

  // Turn the placeholder "typing" bubble into the finished reply: chime,
  // animated reveal, then the speaker button (and auto read-aloud if enabled).
  // aria-busy holds the screen-reader announcement until the full text lands,
  // so the live region announces it once rather than token-by-token.
  function resolveBotMessage(el, text) {
    el.classList.remove("ai-typing");
    playTone();
    const messages = document.getElementById("ai-widget-messages");
    messages.setAttribute("aria-busy", "true");
    typewriterReveal(el, text, () => {
      const btn = addSpeakButton(el, text);
      if (btn && autoSpeak) speak(text, btn);
      messages.setAttribute("aria-busy", "false");
      el.scrollIntoView({ block: "end" });
    });
    return el;
  }

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `ai-msg ${role}`;
    if (role === "bot" && PLACEHOLDERS.has(text)) {
      // Animated typing indicator while we wait for the model's reply.
      el.classList.add("ai-typing");
      el.innerHTML = '<span class="ai-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
      el.setAttribute("aria-label", `${assistantName} is typing`);
    } else if (role === "bot") {
      decorateBotMessage(el, text);
      playTone();
    } else {
      el.textContent = text;
    }
    document.getElementById("ai-widget-messages").appendChild(el);
    el.scrollIntoView({ block: "end" });
    return el;
  }

  function setStatus(isOnline) {
    online = isOnline;
    document.getElementById("chat-status-dot").classList.toggle("online", isOnline);
    document.getElementById("chat-status-text").textContent = isOnline ? "Online" : "Offline";
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

  function clearMessages() {
    document.getElementById("ai-widget-messages").innerHTML = "";
  }

  // Buttons vanish the instant one is clicked (before its handler runs), so a
  // slow handler (e.g. projectLead's network call) can't be double-fired and
  // stale buttons from a previous step never linger once the user moves on.
  // The visible transcript also clears on every click — each menu step is a
  // fresh decision point, not something to keep scrolling back through, and
  // it's what makes the opening greeting disappear once the visitor engages.
  // (Free-text AI replies, which don't go through this function, still
  // accumulate normally — that conversation is worth scrolling back through.)
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
        clearMessages();
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
        resolveBotMessage(pending, "A few things I've built recently:");
        top.forEach((p) => {
          const link = document.createElement("a");
          link.href = `/project.html?slug=${encodeURIComponent(p.slug)}`;
          link.textContent = `→ ${p.title}`;
          link.className = "d-block small mt-1";
          document.getElementById("ai-widget-messages").appendChild(link);
        });
      } else {
        resolveBotMessage(pending, "Take a look at the full portfolio — new work gets added regularly.");
      }
    } catch (_) {
      resolveBotMessage(pending, "Couldn't load the portfolio right now — take a look at the full page instead.");
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
    if (status.voice) voiceConfig = Object.assign({}, voiceConfig, status.voice);
    if (status.assistant_name) {
      assistantName = status.assistant_name;
      const titleEl = panel.querySelector(".chat-title");
      if (titleEl) titleEl.textContent = assistantName;
      const log = document.getElementById("ai-widget-messages");
      if (log) log.setAttribute("aria-label", `Conversation with ${assistantName}`);
      panel.setAttribute("aria-label", `Live chat with ${assistantName}`);
    }

    // Resume an existing conversation instead of starting over — the
    // session token survives a page refresh or navigating to a different
    // page (sessionStorage lasts until the tab/browser closes), but until
    // now nothing re-fetched the saved transcript, so the widget looked
    // reset even though the server still had the whole conversation.
    if (sessionToken) {
      try {
        const session = await api.get(`/api/v1/chat/session/${encodeURIComponent(sessionToken)}`);
        const transcript = session.transcript || [];
        if (transcript.length) {
          transcript.forEach((turn) => appendMessage(turn.role === "user" ? "user" : "bot", turn.text));
          if (status.online) {
            document.getElementById("ai-widget-form").classList.remove("d-none");
          } else {
            showMessageForm();
          }
          return;
        }
      } catch (_) {
        // Token expired or the session no longer exists — clear it and fall
        // through to a fresh start below rather than showing an empty panel.
        sessionToken = null;
        sessionStorage.removeItem("chat_token");
      }
    }

    appendMessage("bot", status.greeting || "Hi there! 👋 Welcome to our development hub. We build high-performance web and mobile applications designed to scale.");
    if (status.online) {
      appendMessage("bot", status.intro || "Pick an option below, or describe the website or app you have in mind and I'll help however I can.");
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
      resolveBotMessage(pending, res.reply);
      // Temporary debug aid — remove once the OpenRouter fallback is confirmed working in production.
      console.log(`[chat debug] mode=${res.mode} provider=${res.provider || "keyword fallback"}`);
    } catch (err) {
      resolveBotMessage(pending, err.message || "Sorry, something went wrong. Please leave a message below instead.");
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

  // ---- auto read-aloud toggle -------------------------------------------------
  (function initAutoSpeak() {
    const btn = document.getElementById("ai-widget-autospeak");
    if (!btn) return;
    if (!("speechSynthesis" in window)) { btn.style.display = "none"; return; }
    const render = () => {
      btn.innerHTML = autoSpeak ? SPEAKER_SVG : SPEAKER_MUTE_SVG;
      btn.classList.toggle("on", autoSpeak);
      btn.title = autoSpeak ? "Auto read-aloud: on" : "Auto read-aloud: off";
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("aria-pressed", autoSpeak ? "true" : "false");
    };
    render();
    btn.addEventListener("click", () => {
      autoSpeak = !autoSpeak;
      sessionStorage.setItem("chat_autospeak", autoSpeak ? "1" : "0");
      render();
      if (!autoSpeak && window.speechSynthesis) window.speechSynthesis.cancel();
    });
  })();

  // ---- voice input (speech-to-text) ------------------------------------------
  // Lets a visitor dictate their message. Feature-detected: browsers without
  // the Web Speech recognition API just don't see the mic button.
  (function initVoiceInput() {
    const micBtn = document.getElementById("ai-widget-mic");
    if (!micBtn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.display = "none"; return; }
    micBtn.innerHTML = MIC_SVG;
    const input = document.getElementById("ai-widget-input");
    let rec = null;
    let listening = false;

    const stop = () => {
      listening = false;
      micBtn.classList.remove("listening");
      micBtn.title = "Speak your message";
      input.focus();
    };

    micBtn.addEventListener("click", () => {
      if (listening) { rec && rec.stop(); return; }
      rec = new SR();
      // Match the admin-chosen accent so recognition and playback agree.
      rec.lang = voiceConfig.accent && voiceConfig.accent !== "auto" ? voiceConfig.accent : "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      // Append to whatever's already typed rather than clobbering it.
      let finalText = input.value ? input.value.trim() + " " : "";
      rec.onstart = () => {
        listening = true;
        micBtn.classList.add("listening");
        micBtn.title = "Listening… tap to stop";
      };
      rec.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += t;
          else interim += t;
        }
        input.value = (finalText + interim).replace(/\s{2,}/g, " ").trimStart();
      };
      rec.onerror = stop;
      rec.onend = stop;
      try { rec.start(); } catch (_) { stop(); }
    });
  })();

  // ---- shell ------------------------------------------------------------------

  document.getElementById("ai-widget-menu-btn").addEventListener("click", () => {
    const lmForm = document.getElementById("leave-msg-form");
    if (!lmForm.classList.contains("d-none")) {
      lmForm.classList.add("d-none");
      if (online) {
        document.getElementById("ai-widget-form").classList.remove("d-none");
      }
    }
    clearMessages();
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
