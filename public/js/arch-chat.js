// Arch — client-side conversation + build flow for the AI website builder.
// Talks to /api/v1/arch/chat.php (one question at a time, returns a running
// structured brief + a "Step X of 5" signal) and /api/v1/arch/generate.php
// (builds the site and returns a preview + download). Vanilla JS, no framework,
// matching the rest of the public site.

(function () {
  "use strict";

  var STEP_NAMES = ["Your business", "Look & feel", "Pages", "Features", "Your content"];
  var TOTAL_STEPS = 5;
  var SESSION_KEY = "arch-chat-session-v1";

  var thread = document.getElementById("arch-thread");
  var form = document.getElementById("arch-form");
  var input = document.getElementById("arch-input");
  var sendBtn = document.getElementById("arch-send");
  var buildBtn = document.getElementById("arch-build-btn");
  var errorBox = document.getElementById("arch-error");
  var suggestions = document.getElementById("arch-suggestions");

  var progressWrap = document.getElementById("arch-progress");
  var progressBar = document.getElementById("arch-progress-bar");
  var stepLabel = document.getElementById("arch-step-label");
  var stepName = document.getElementById("arch-step-name");

  var stageEl = document.getElementById("arch-stage");
  var buildingEl = document.getElementById("arch-building");
  var buildingSteps = document.getElementById("arch-building-steps");
  var resultEl = document.getElementById("arch-result");

  // Conversation state.
  var transcript = []; // [{role, text}]
  var brief = {};
  var ready = false;
  var busy = false;
  var currentStep = 1;
  var currentSite = null;

  // ---- helpers ----------------------------------------------------------

  function scrollThread() {
    thread.scrollIntoView({ block: "end" });
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function addMessage(role, text) {
    var el = document.createElement("div");
    el.className = "arch-msg " + (role === "user" ? "user" : "arch");
    el.textContent = text;
    thread.appendChild(el);
    scrollThread();
    return el;
  }

  function showTyping() {
    var el = document.createElement("div");
    el.className = "arch-typing";
    el.id = "arch-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    thread.appendChild(el);
    scrollThread();
  }

  function hideTyping() {
    var el = document.getElementById("arch-typing");
    if (el) el.remove();
  }

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.classList.remove("d-none");
  }

  function clearError() {
    errorBox.classList.add("d-none");
  }

  function setProgress(step) {
    var s = Math.max(1, Math.min(TOTAL_STEPS, step || 1));
    currentStep = s;
    progressWrap.setAttribute("aria-hidden", "false");
    stepLabel.textContent = "Step " + s + " of " + TOTAL_STEPS;
    stepName.textContent = STEP_NAMES[s - 1] || "";
    progressBar.style.width = Math.round((s / TOTAL_STEPS) * 100) + "%";
  }

  function setBusy(state) {
    busy = state;
    sendBtn.disabled = state;
    input.disabled = state;
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        transcript: transcript,
        brief: brief,
        ready: ready,
        step: currentStep,
        site: currentSite,
      }));
    } catch (e) {
      // Storage can be unavailable in strict privacy modes; chat still works.
    }
  }

  function restoreSession() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (!saved || !Array.isArray(saved.transcript) || !saved.transcript.length) return false;
      transcript = saved.transcript.filter(function (turn) {
        return turn && (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string";
      });
      if (!transcript.length) return false;
      brief = saved.brief && typeof saved.brief === "object" ? saved.brief : {};
      ready = !!saved.ready;
      transcript.forEach(function (turn) {
        addMessage(turn.role === "user" ? "user" : "arch", turn.text);
      });
      setProgress(saved.step || 1);
      renderSuggestions(saved.step || 1);
      if (ready) buildBtn.classList.remove("d-none");
      if (saved.site && saved.site.slug && saved.site.revision_token) showResult(saved.site, false);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Defense in depth: the API already rejects internal model artifacts, but
  // never render them if a stale deployment or upstream provider emits one.
  function safeReply(reply, step) {
    var text = typeof reply === "string" ? reply.trim() : "";
    if (text && !/(^|\n)\s*(tool\s*code|toolcode|thought|analysis)\s*:?\s*(\n|$)|<\/?think>|defaultapi\.|update_?brief\s*\(/i.test(text)) {
      return text;
    }
    var fallbacks = {
      1: "Let's start with the basics — what's the name of your business, and what type is it?",
      2: "Great. What colors and overall style are you after, and would you prefer a light or dark look?",
      3: "Which pages do you need? Common ones are Home, About, Services, Contact, Gallery, Blog, and Shop.",
      4: "Any key features you'd like, such as a contact form, WhatsApp, maps, payments, a gallery, or booking?",
      5: "Last step — tell me your tagline, business description, services, and contact details.",
    };
    return fallbacks[step] || fallbacks[1];
  }

  // Contextual quick-reply chips per step, to make answering faster.
  function renderSuggestions(step) {
    var chips = [];
    if (step === 2) chips = ["Modern", "Classic", "Minimal", "Bold"];
    else if (step === 3) chips = ["Home, About, Services, Contact", "Add a Gallery", "Add a Blog", "Add a Shop"];
    else if (step === 4) chips = ["Contact form + WhatsApp", "Add Google Maps", "Photo gallery", "No extra features"];
    suggestions.innerHTML = "";
    chips.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "arch-chip";
      b.textContent = c;
      b.addEventListener("click", function () {
        input.value = c;
        input.focus();
        autoGrow();
      });
      suggestions.appendChild(b);
    });
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 160) + "px";
  }

  // ---- chat turn --------------------------------------------------------

  function sendMessage(text) {
    if (busy) return;
    text = (text || "").trim();
    if (!text) return;

    clearError();
    addMessage("user", text);
    transcript.push({ role: "user", text: text });
    saveSession();
    input.value = "";
    autoGrow();
    suggestions.innerHTML = "";
    setBusy(true);
    showTyping();

    fetch("/api/v1/arch/chat.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, transcript: transcript.slice(0, -1), brief: brief }),
    })
      .then(parseJson)
      .then(function (data) {
        hideTyping();
        brief = data.brief || brief;
        ready = !!data.ready;
        var reply = safeReply(data.reply, data.step || 1);
        addMessage("arch", reply);
        transcript.push({ role: "assistant", text: reply });
        setProgress(data.step || 1);
        renderSuggestions(data.step || 1);
        if (ready) {
          buildBtn.classList.remove("d-none");
        }
        saveSession();
      })
      .catch(function (err) {
        hideTyping();
        showError(err.message || "Something went wrong. Please try again.");
      })
      .finally(function () {
        setBusy(false);
        input.focus();
      });
  }

  function parseJson(res) {
    return res
      .json()
      .catch(function () {
        return {};
      })
      .then(function (body) {
        if (!res.ok) {
          throw new Error(body.error || "The builder is unavailable right now (HTTP " + res.status + ").");
        }
        return body;
      });
  }

  // ---- build ------------------------------------------------------------

  var BUILD_MESSAGES = [
    "Laying the foundations…",
    "Designing your layout…",
    "Writing your content…",
    "Styling it to match your brand…",
    "Adding the finishing touches…",
  ];

  function startBuild() {
    if (busy) return;
    setBusy(true);
    clearError();
    stageEl.classList.add("d-none");
    resultEl.classList.add("d-none");
    buildingEl.classList.remove("d-none");

    var i = 0;
    buildingSteps.textContent = BUILD_MESSAGES[0];
    var ticker = setInterval(function () {
      i = (i + 1) % BUILD_MESSAGES.length;
      buildingSteps.textContent = BUILD_MESSAGES[i];
    }, 2500);

    fetch("/api/v1/arch/generate.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: brief }),
    })
      .then(parseJson)
      .then(function (data) {
        clearInterval(ticker);
        showResult(data, true);
      })
      .catch(function (err) {
        clearInterval(ticker);
        buildingEl.classList.add("d-none");
        stageEl.classList.remove("d-none");
        showError(err.message || "Build failed. Please try again.");
        setBusy(false);
      });
  }

  function showResult(data, addHistory) {
    currentSite = data;
    stageEl.classList.add("d-none");
    buildingEl.classList.add("d-none");
    resultEl.classList.remove("d-none");

    document.getElementById("arch-frame").src = data.preview_url;
    document.getElementById("arch-open-link").href = data.preview_url;
    var handoffLink = document.getElementById("arch-download-link");
    handoffLink.href = data.download_url || "/contact.html";
    handoffLink.textContent = data.download_url ? "Download site (.zip)" : "Discuss the final build";
    updateRevisionLimit(data.revisions_remaining);

    if (data.has_cms && data.admin_password) {
      var box = document.getElementById("arch-cms-box");
      box.classList.remove("d-none");
      document.getElementById("arch-admin-link").href = data.admin_url || data.preview_url + "admin/";
      document.getElementById("arch-admin-pass").textContent = data.admin_password;
    }
    saveSession();
    if (addHistory && window.location.hash !== "#preview") {
      history.pushState({ archView: "preview" }, "", "#preview");
    }
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateRevisionLimit(remaining) {
    var count = Number.isFinite(Number(remaining)) ? Math.max(0, Number(remaining)) : 2;
    var reviewBtn = document.getElementById("arch-review-btn");
    document.getElementById("arch-review-limit").textContent = count + " revision" + (count === 1 ? "" : "s") + " remaining";
    reviewBtn.disabled = count === 0;
    if (count === 0) reviewBtn.textContent = "Revision limit reached";
  }

  function returnToChat(updateHistory) {
    currentSite = null;
    resultEl.classList.add("d-none");
    buildingEl.classList.add("d-none");
    stageEl.classList.remove("d-none");
    saveSession();
    if (updateHistory && window.location.hash === "#preview") {
      history.back();
    } else if (window.location.hash === "#preview") {
      history.replaceState({ archView: "chat" }, "", window.location.pathname + window.location.search);
    }
    thread.scrollIntoView({ behavior: "smooth", block: "end" });
    input.focus();
  }

  function submitRevision(event) {
    event.preventDefault();
    var reviewInput = document.getElementById("arch-review-input");
    var reviewBtn = document.getElementById("arch-review-btn");
    var reviewStatus = document.getElementById("arch-review-status");
    var feedback = (reviewInput.value || "").trim();
    if (!feedback || !currentSite || !currentSite.slug || !currentSite.revision_token) return;

    reviewBtn.disabled = true;
    reviewStatus.textContent = "Arch is applying your changes…";
    clearError();
    fetch("/api/v1/arch/revise.php", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: currentSite.slug,
        revision_token: currentSite.revision_token,
        feedback: feedback,
      }),
    })
      .then(parseJson)
      .then(function (data) {
        brief = data.brief || brief;
        var cacheBuster = (data.preview_url.indexOf("?") === -1 ? "?" : "&") + "revision=" + Date.now();
        document.getElementById("arch-frame").src = data.preview_url + cacheBuster;
        document.getElementById("arch-open-link").href = data.preview_url;
        document.getElementById("arch-download-link").href = data.download_url || "/contact.html";
        currentSite.preview_url = data.preview_url;
        currentSite.download_url = data.download_url;
        currentSite.revisions_remaining = data.revisions_remaining;
        updateRevisionLimit(data.revisions_remaining);
        reviewInput.value = "";
        reviewStatus.textContent = data.message || "Changes applied. Review the refreshed preview.";
        saveSession();
      })
      .catch(function (err) {
        reviewStatus.textContent = "";
        showError(err.message || "The changes could not be applied. Please try again.");
      })
      .finally(function () {
        reviewBtn.disabled = Number(currentSite.revisions_remaining) === 0;
      });
  }

  // ---- wiring -----------------------------------------------------------

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (e) {
    // Enter sends; Shift+Enter makes a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value);
    }
  });

  buildBtn.addEventListener("click", startBuild);
  document.getElementById("arch-review-form").addEventListener("submit", submitRevision);
  document.getElementById("arch-back-to-chat").addEventListener("click", function () {
    returnToChat(true);
  });
  window.addEventListener("popstate", function () {
    if (currentSite && window.location.hash !== "#preview") returnToChat(false);
  });
  var newBuildLink = document.getElementById("arch-new-build");
  if (newBuildLink) {
    newBuildLink.addEventListener("click", function () {
      try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    });
  }

  // Kick off with Arch's greeting (no server round-trip needed for the opener).
  // The agent's name is admin-configurable (Site Content → Arch), so read it
  // from the public content endpoint — same source Lisa's widget uses — and
  // fall back to "Arch" if unset or the fetch fails.
  function greet(name) {
    var avatar = document.querySelector(".arch-avatar");
    if (avatar && name) avatar.textContent = name.trim().charAt(0).toUpperCase();
    setProgress(1);
    var greeting = "Hi, I'm " + name + " — your AI website builder. I'll ask a few quick questions and then build you a complete, ready-to-launch website. Let's start: what's the name of your business, and what type is it (restaurant, shop, church, portfolio, and so on)?";
    addMessage("arch", greeting);
    transcript.push({
      role: "assistant",
      text: greeting,
    });
    saveSession();
    input.focus();
  }

  fetch("/api/v1/content", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : {}; })
    .catch(function () { return {}; })
    .then(function (c) {
      var name = (c && c.arch_assistant_name) || "Arch";
      var avatar = document.querySelector(".arch-avatar");
      if (avatar && name) avatar.textContent = name.trim().charAt(0).toUpperCase();
      if (!restoreSession()) greet(name);
      input.focus();
    });
})();
