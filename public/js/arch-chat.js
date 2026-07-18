// Arch — client-side conversation + build flow for the AI website builder.
// Talks to /api/v1/arch/chat.php (one question at a time, returns a running
// structured brief + a "Step X of 5" signal) and /api/v1/arch/generate.php
// (builds the site and returns a preview + download). Vanilla JS, no framework,
// matching the rest of the public site.

(function () {
  "use strict";

  var STEP_NAMES = ["Your business", "Look & feel", "Pages", "Features", "Your content"];
  var TOTAL_STEPS = 5;

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
        addMessage("arch", data.reply);
        transcript.push({ role: "assistant", text: data.reply });
        setProgress(data.step || 1);
        renderSuggestions(data.step || 1);
        if (ready) {
          buildBtn.classList.remove("d-none");
        }
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
        showResult(data);
      })
      .catch(function (err) {
        clearInterval(ticker);
        buildingEl.classList.add("d-none");
        stageEl.classList.remove("d-none");
        showError(err.message || "Build failed. Please try again.");
        setBusy(false);
      });
  }

  function showResult(data) {
    buildingEl.classList.add("d-none");
    resultEl.classList.remove("d-none");

    document.getElementById("arch-frame").src = data.preview_url;
    document.getElementById("arch-open-link").href = data.preview_url;
    document.getElementById("arch-download-link").href = data.download_url;

    if (data.has_cms && data.admin_password) {
      var box = document.getElementById("arch-cms-box");
      box.classList.remove("d-none");
      document.getElementById("arch-admin-link").href = data.admin_url || data.preview_url + "admin/";
      document.getElementById("arch-admin-pass").textContent = data.admin_password;
    }
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
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

  // Kick off with Arch's greeting (no server round-trip needed for the opener).
  setProgress(1);
  addMessage(
    "arch",
    "Hi, I'm Arch — your AI website builder. I'll ask a few quick questions and then build you a complete, ready-to-launch website. Let's start: what's the name of your business, and what type is it (restaurant, shop, church, portfolio, and so on)?"
  );
  transcript.push({
    role: "assistant",
    text: "Hi, I'm Arch. What's the name of your business, and what type is it?",
  });
  input.focus();
})();
