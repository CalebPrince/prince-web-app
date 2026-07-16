(function () {
  const AGENTS = {
    beacon: { label: "Beacon", nameKey: "beacon_assistant_name", genderKey: "beacon_voice_gender", accentKey: "beacon_voice_accent", fallbackName: "Beacon" },
    nurturer: { label: "Nurturer", nameKey: "nurturer_assistant_name", genderKey: "nurturer_voice_gender", accentKey: "nurturer_voice_accent", fallbackName: "Nurturer" },
  };

  const logEl = document.getElementById("agent-chat-log");
  const msgEl = document.getElementById("agent-chat-msg");
  const formEl = document.getElementById("agent-chat-form");
  const inputEl = document.getElementById("agent-chat-input");
  const sendBtn = document.getElementById("agent-chat-send");
  const micBtn = document.getElementById("agent-mic-btn");
  const beaconLeadsCard = document.getElementById("beacon-leads-card");
  const beaconLeadsList = document.getElementById("beacon-leads-list");
  const beaconLeadsEmpty = document.getElementById("beacon-leads-empty");
  const beaconDiscoveryCard = document.getElementById("beacon-discovery-card");
  const beaconDiscoveryEnabled = document.getElementById("beacon-discovery-enabled");
  const beaconDiscoveryFrequency = document.getElementById("beacon-discovery-frequency");
  const beaconDiscoveryRecency = document.getElementById("beacon-discovery-recency");
  const beaconDiscoveryKeywords = document.getElementById("beacon-discovery-keywords");
  const beaconDiscoveryMsg = document.getElementById("beacon-discovery-msg");
  const beaconDiscoverySave = document.getElementById("beacon-discovery-save");
  const beaconSpendCard = document.getElementById("beacon-spend-card");
  const beaconSpendBody = document.getElementById("beacon-spend-body");
  const faceSlot = document.getElementById("agent-chat-face");
  const faceNameEl = document.getElementById("agent-chat-face-name");

  let activeAgent = "beacon";
  let transcript = []; // [{role: 'user'|'agent', text}]
  let agentSettings = {}; // populated from /api/v1/content
  let face = null; // current agent's animated avatar (public/js/agent-face.js)

  // Swaps the header avatar for the active agent — recreated rather than
  // relabeled since each agent has its own icon.
  function renderFace() {
    if (!window.AgentFace || !faceSlot) return;
    faceSlot.innerHTML = "";
    face = window.AgentFace.create(activeAgent);
    faceSlot.appendChild(face.el);
    if (faceNameEl) faceNameEl.textContent = agentDisplayName();
  }

  // ---- voice matching + speech synthesis (adapted from public/js/ai-widget.js) ----
  const FEMALE_RE = /(female|zira|susan|hazel|linda|samantha|karen|moira|tessa|fiona|serena|catherine|aria|jenny|sonia|libby|amy|joanna|salli|kimberly|google uk english female)/i;
  const MALE_RE = /(\bmale\b|david|mark|george|guy|ryan|thomas|daniel|alex|fred|oliver|james|brian|matthew|arthur|google uk english male)/i;

  if ("speechSynthesis" in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener &&
      window.speechSynthesis.addEventListener("voiceschanged", () => window.speechSynthesis.getVoices());
  }

  // Match the admin's gender + accent preference, degrading gracefully:
  // accent+gender -> gender (any accent) -> accent (any gender) -> any
  // English -> whatever exists. Mirrors public/js/ai-widget.js's pickVoice.
  // No rate/pitch settings for these two agents (unlike Lisa) — accent +
  // gender only.
  function pickVoice(voices, gender, accent) {
    if (!voices.length) return null;
    const acc = accent && accent !== "auto" ? accent.toLowerCase() : null;
    const wantRe = gender === "male" ? MALE_RE : gender === "female" ? FEMALE_RE : null;
    const notRe = gender === "male" ? FEMALE_RE : gender === "female" ? MALE_RE : null;

    const en = voices.filter((v) => /^en/i.test(v.lang));
    const byAccent = acc ? en.filter((v) => v.lang.toLowerCase().startsWith(acc)) : en;

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

  function stripForSpeech(text) {
    return text
      .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
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
    if (face) face.setSpeaking(on);
  }

  function speak(text, btn) {
    const synth = window.speechSynthesis;
    if (!synth || !text) return;
    if (speakingBtn === btn) { synth.cancel(); return; }
    synth.cancel();
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    const u = new SpeechSynthesisUtterance(spoken);
    const gender = (agentSettings[AGENTS[activeAgent].genderKey] || "auto");
    const accent = (agentSettings[AGENTS[activeAgent].accentKey] || "auto");
    const voice = pickVoice(synth.getVoices(), gender, accent);
    if (voice) {
      u.voice = voice;
      if (voice.lang) u.lang = voice.lang;
    }
    u.onstart = () => setSpeaking(btn, true);
    u.onend = () => setSpeaking(btn, false);
    u.onerror = () => setSpeaking(btn, false);
    synth.speak(u);
  }

  // ---- chat log rendering ----
  function agentDisplayName() {
    const cfg = AGENTS[activeAgent];
    return agentSettings[cfg.nameKey] || cfg.fallbackName;
  }

  function addBubble(role, text) {
    const bubble = document.createElement("div");
    bubble.className = "agent-bubble " + (role === "user" ? "user" : "agent");
    bubble.textContent = text;

    if (role === "agent" && "speechSynthesis" in window) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "speak-btn";
      btn.title = "Read aloud";
      btn.setAttribute("aria-label", "Read this message aloud");
      btn.innerHTML = '<i class="bi bi-volume-up"></i>';
      btn.addEventListener("click", () => speak(text, btn));
      bubble.appendChild(btn);
    }

    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    return bubble;
  }

  function resetConversation() {
    transcript = [];
    logEl.innerHTML = "";
    addBubble("agent", "Hey, it's " + agentDisplayName() + ". What do you want to talk through?");
  }

  // ---- Beacon's "Recent qualified leads" panel ----
  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Mirrors beacon_social_leads.source — keep in step with the CHECK in schema.sql.
  const LEAD_SOURCE_LABEL = {
    chat: "logged in chat",
    cron: "found by discovery",
    draft: "from draft()",
  };

  async function loadBeaconLeads() {
    try {
      const leads = await api.get("/api/v1/admin/beacon-leads");
      beaconLeadsList.innerHTML = "";
      beaconLeadsEmpty.classList.toggle("d-none", leads.length > 0);
      leads.forEach((lead) => {
        const card = document.createElement("div");
        card.className = "border rounded p-3";
        const sourceBadge = LEAD_SOURCE_LABEL[lead.source] || escapeHtml(lead.source);
        const link = lead.post_url
          ? ' — <a href="' + escapeHtml(lead.post_url) + '" target="_blank" rel="noopener">view post</a>'
          : "";
        // Age is the fastest way to spot a lead that isn't one — an old post
        // reads exactly like a fresh one otherwise. Not every result carries it.
        const age = lead.post_age
          ? ' · <span class="fst-italic">' + escapeHtml(lead.post_age) + "</span>"
          : "";
        card.innerHTML =
          '<div class="d-flex justify-content-between small text-muted-custom mb-1">'
          + '<span>' + escapeHtml(lead.platform) + " · @" + escapeHtml(lead.username) + link + "</span>"
          + '<span>' + lead.confidence_score + "% · " + sourceBadge + age + "</span>"
          + "</div>"
          + '<div class="small mb-2">' + escapeHtml(lead.reasoning) + "</div>"
          + '<div class="small fst-italic mb-2">' + escapeHtml(lead.drafted_reply) + "</div>"
          + '<button type="button" class="btn btn-sm btn-outline-secondary copy-reply-btn">Copy reply</button>'
          + '<button type="button" class="btn btn-sm btn-outline-danger ms-1 delete-lead-btn">Delete</button>';

        // Copy the raw reply, not the escaped markup above — this is pasted
        // straight into the platform's own reply box.
        const copyBtn = card.querySelector(".copy-reply-btn");
        copyBtn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(lead.drafted_reply);
            copyBtn.textContent = "Copied";
          } catch (_) {
            copyBtn.textContent = "Copy failed";
          }
          setTimeout(() => { copyBtn.textContent = "Copy reply"; }, 2000);
        });

        const deleteBtn = card.querySelector(".delete-lead-btn");
        deleteBtn.addEventListener("click", async () => {
          if (!confirm("Delete this lead? The post won't be scored again, so it won't come back.")) return;
          deleteBtn.disabled = true;
          try {
            await api.delete("/api/v1/admin/beacon-leads/" + lead.id);
            card.remove();
            beaconLeadsEmpty.classList.toggle("d-none", beaconLeadsList.children.length > 0);
          } catch (err) {
            alert(err.message);
            deleteBtn.disabled = false;
          }
        });

        beaconLeadsList.appendChild(card);
      });
    } catch (_) {
      // Quiet failure — this panel is a convenience, not the primary flow.
    }
  }

  const RUN_OUTCOME_LABEL = {
    ok: "completed",
    capped: "hit the cap",
    search_failed: "search failed",
    scoring_gave_up: "providers down",
  };

  async function loadBeaconSpend() {
    try {
      const s = await api.get("/api/v1/admin/beacon-spend");
      const line = (label, w) =>
        "<div><strong>" + label + ":</strong> " + w.runs + " run(s) · "
        + w.searches + " Serper credit(s) · "
        + (w.scored + w.score_failures) + " AI call(s)"
        + (w.score_failures ? " (" + w.score_failures + " failed)" : "")
        + " · " + w.qualified + " qualified</div>";

      const runs = s.recent_runs.length
        ? '<table class="table table-sm mb-0 mt-3"><thead><tr><th class="ps-0">Run</th><th>Searches</th><th>Scored</th><th>Qualified</th><th>Outcome</th></tr></thead><tbody>'
          + s.recent_runs.map(r =>
            "<tr><td class='ps-0'>" + new Date(r.ran_at + "Z").toLocaleString() + "</td>"
            + "<td>" + r.searches_run + "</td>"
            + "<td>" + r.results_scanned + (r.score_failures ? " <span class='text-danger'>+" + r.score_failures + " failed</span>" : "") + "</td>"
            + "<td>" + r.qualified + "</td>"
            + "<td>" + (RUN_OUTCOME_LABEL[r.outcome] || escapeHtml(r.outcome)) + "</td></tr>").join("")
          + "</tbody></table>"
        : "<div class='mt-2'>No runs recorded yet — the cron logs one each time it searches.</div>";

      beaconSpendBody.innerHTML = line("Last 7 days", s.last_7_days) + line("Last 30 days", s.last_30_days) + runs;
    } catch (_) {
      beaconSpendBody.textContent = "Couldn't load spend figures.";
    }
  }

  function updateLeadsPanelVisibility() {
    const isBeacon = activeAgent === "beacon";
    beaconLeadsCard.classList.toggle("d-none", !isBeacon);
    beaconDiscoveryCard.classList.toggle("d-none", !isBeacon);
    beaconSpendCard.classList.toggle("d-none", !isBeacon);
    if (isBeacon) {
      loadBeaconLeads();
      loadBeaconSpend();
    }
  }

  // ---- Beacon's discovery settings (admin-only Settings, not the public content endpoint) ----
  let discoverySettingsLoaded = false;
  async function loadBeaconDiscoverySettings() {
    if (discoverySettingsLoaded) return;
    try {
      const settings = await api.get("/api/v1/admin/settings");
      beaconDiscoveryEnabled.checked = settings.beacon_discovery_enabled === "1";
      beaconDiscoveryFrequency.value = settings.beacon_discovery_frequency || "daily";
      beaconDiscoveryRecency.value = settings.beacon_discovery_recency || "qdr:m";
      beaconDiscoveryKeywords.value = settings.beacon_discovery_keywords || "";
      discoverySettingsLoaded = true;
    } catch (_) {
      // Quiet failure — admin can still retype and save.
    }
  }

  beaconDiscoverySave.addEventListener("click", async () => {
    beaconDiscoveryMsg.classList.add("d-none");
    beaconDiscoverySave.disabled = true;
    try {
      await api.put("/api/v1/admin/settings", {
        beacon_discovery_enabled: beaconDiscoveryEnabled.checked ? "1" : "0",
        beacon_discovery_frequency: beaconDiscoveryFrequency.value,
        beacon_discovery_recency: beaconDiscoveryRecency.value,
        beacon_discovery_keywords: beaconDiscoveryKeywords.value,
      });
      beaconDiscoveryMsg.className = "alert alert-success py-2 small mt-3";
      beaconDiscoveryMsg.textContent = "Saved.";
      beaconDiscoveryMsg.classList.remove("d-none");
    } catch (err) {
      beaconDiscoveryMsg.className = "alert alert-danger py-2 small mt-3";
      beaconDiscoveryMsg.textContent = err.message;
      beaconDiscoveryMsg.classList.remove("d-none");
    } finally {
      beaconDiscoverySave.disabled = false;
    }
  });

  // ---- sending messages ----
  // Reuses .ai-typing-dots from app.css — same indicator Lisa's widget shows,
  // so the agents behave the same way wherever you talk to them (and it already
  // honours prefers-reduced-motion). The wait is real: a reply is an
  // AiAgentEngine round-trip, up to two tool rounds, and can fall through
  // Gemini -> OpenRouter -> Groq.
  function addTypingBubble() {
    const bubble = document.createElement("div");
    bubble.className = "agent-bubble agent";
    bubble.innerHTML = '<span class="ai-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
    bubble.setAttribute("aria-label", agentDisplayName() + " is typing");
    logEl.appendChild(bubble);
    logEl.scrollTop = logEl.scrollHeight;
    if (face) face.setThinking(true);
    return bubble;
  }

  async function sendMessage(text) {
    addBubble("user", text);
    transcript.push({ role: "user", text });
    msgEl.classList.add("d-none");
    sendBtn.disabled = true;
    const typing = addTypingBubble();

    try {
      const res = await api.post("/api/v1/admin/agents/" + activeAgent + "/chat", { message: text, transcript });
      addBubble("agent", res.reply);
      transcript.push({ role: "agent", text: res.reply });
      // A reply may have logged a new lead via the log_qualified_lead tool.
      if (activeAgent === "beacon") loadBeaconLeads();
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.classList.remove("d-none");
    } finally {
      typing.remove();   // in finally: an error must not leave it dotting forever
      if (face) face.setThinking(false);
      sendBtn.disabled = false;
    }
  }

  formEl.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    sendMessage(text);
  });

  // ---- agent tab switching ----
  document.querySelectorAll(".agent-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.agent === activeAgent) return;
      document.querySelectorAll(".agent-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeAgent = tab.dataset.agent;
      renderFace();
      resetConversation();
      updateLeadsPanelVisibility();
      if (activeAgent === "beacon") loadBeaconDiscoverySettings();
    });
  });

  // ---- mic input (adapted from public/js/ai-widget.js initVoiceInput) ----
  (function initVoiceInput() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // stays hidden — no Web Speech support in this browser
    micBtn.style.display = "";
    let rec = null;
    let listening = false;

    const stop = () => {
      listening = false;
      micBtn.classList.remove("listening");
      micBtn.title = "Speak your message";
      inputEl.focus();
    };

    micBtn.addEventListener("click", () => {
      if (listening) { rec && rec.stop(); return; }
      rec = new SR();
      rec.lang = navigator.language || "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = inputEl.value ? inputEl.value.trim() + " " : "";
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
        inputEl.value = (finalText + interim).replace(/\s{2,}/g, " ").trimStart();
      };
      rec.onerror = stop;
      rec.onend = stop;
      try { rec.start(); } catch (_) { stop(); }
    });
  })();

  // ---- boot ----
  (async function init() {
    try {
      agentSettings = await api.get("/api/v1/content");
    } catch (_) {
      agentSettings = {};
    }
    document.getElementById("tab-beacon").innerHTML =
      '<i class="bi bi-binoculars me-1"></i>' + (agentSettings.beacon_assistant_name || "Beacon");
    document.getElementById("tab-nurturer").innerHTML =
      '<i class="bi bi-envelope-heart me-1"></i>' + (agentSettings.nurturer_assistant_name || "Nurturer");
    renderFace();
    resetConversation();
    updateLeadsPanelVisibility();
    if (activeAgent === "beacon") loadBeaconDiscoverySettings();
  })();
})();
