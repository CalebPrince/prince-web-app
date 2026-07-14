// Prototype generator (chat.html) — a Claude-style "describe it, get it built"
// page. Standalone: no live chat conversation required first. Uses its own
// sessionStorage key (not "chat_token") so it never collides with the
// separate live-chat bubble session on the same site.
(function () {
  const params = new URLSearchParams(window.location.search);
  let sessionToken = params.get("token") || sessionStorage.getItem("prototype_token") || null;

  const heroEl = document.getElementById("generator-hero");
  const resultEl = document.getElementById("generator-result");
  const frame = document.getElementById("ws-prototype-frame");
  const fullscreenLink = document.getElementById("ws-fullscreen-link");
  const downloadLink = document.getElementById("ws-download-link");

  function cacheBusted(url) {
    return url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  }

  let currentUrl = null;

  function showResult(url) {
    currentUrl = url;
    heroEl.classList.add("d-none");
    resultEl.classList.remove("d-none");
    frame.src = cacheBusted(url);
    fullscreenLink.href = url;
    downloadLink.href = url;
  }

  function setToken(token) {
    sessionToken = token;
    sessionStorage.setItem("prototype_token", token);
    const url = new URL(window.location.href);
    url.searchParams.set("token", token);
    history.replaceState(null, "", url);
  }

  function forgetToken() {
    sessionToken = null;
    sessionStorage.removeItem("prototype_token");
  }

  // ---- boot: rehydrate an existing prototype, if the token still resolves ----

  if (sessionToken) {
    api.get(`/api/v1/chat/session/${encodeURIComponent(sessionToken)}`)
      .then((session) => {
        if (session.has_prototype && session.prototype_url) {
          setToken(session.token);
          showResult(session.prototype_url);
        } else {
          forgetToken();
        }
      })
      .catch(forgetToken);
  }

  // ---- shared generate/regenerate call ---------------------------------------

  async function generate(description) {
    const res = await api.post(
      "/api/v1/chat/prototype",
      { description, token: sessionToken },
      { timeoutMs: 105000 }
    );
    setToken(res.token);
    showResult(res.url);
  }

  // ---- hero form: first generation --------------------------------------------

  const briefForm = document.getElementById("brief-form");
  const briefInput = document.getElementById("brief-input");
  const briefBtn = document.getElementById("brief-submit");
  const briefError = document.getElementById("brief-error");
  const briefStatus = document.getElementById("brief-status");

  // ---- animated placeholder ---------------------------------------------------
  //
  // Cycles through example prompts, typewriter-style, instead of one static
  // placeholder — purely cosmetic, so it pauses once the field actually has a
  // value and is skipped entirely under prefers-reduced-motion.

  const PLACEHOLDER_EXAMPLES = [
    "A booking site for my hair salon, with online payments and appointment reminders…",
    "A portfolio site for a photographer, with a gallery and contact form…",
    "An online store for handmade jewelry, with a Stripe checkout…",
    "A booking app for a fitness studio, with class schedules and memberships…",
  ];

  (function typewriterPlaceholder() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      briefInput.placeholder = PLACEHOLDER_EXAMPLES[0];
      return;
    }
    let phrase = 0;
    let char = 0;
    let deleting = false;

    function tick() {
      if (briefInput.value) {
        setTimeout(tick, 400); // paused while the visitor is typing their own text
        return;
      }
      const text = PLACEHOLDER_EXAMPLES[phrase];
      if (!deleting) {
        char++;
        briefInput.placeholder = text.slice(0, char);
        if (char === text.length) {
          deleting = true;
          setTimeout(tick, 1800);
          return;
        }
        setTimeout(tick, 35);
      } else {
        char--;
        briefInput.placeholder = text.slice(0, char);
        if (char === 0) {
          deleting = false;
          phrase = (phrase + 1) % PLACEHOLDER_EXAMPLES.length;
          setTimeout(tick, 400);
          return;
        }
        setTimeout(tick, 18);
      }
    }
    tick();
  })();

  // ---- voice input (dictate your idea) ----------------------------------------
  //
  // Speech-to-text straight into the brief textarea, mirroring the live-chat
  // bubble's mic. Feature-detected: browsers without the Web Speech API just
  // never see the button. Appends to whatever's already typed.

  (function initVoiceInput() {
    const micBtn = document.getElementById("brief-mic-btn");
    if (!micBtn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { micBtn.style.display = "none"; return; }
    let rec = null;
    let listening = false;

    const stop = () => {
      listening = false;
      micBtn.classList.remove("listening");
      micBtn.title = "Dictate your idea";
      briefInput.focus();
    };

    micBtn.addEventListener("click", () => {
      if (listening) { rec && rec.stop(); return; }
      rec = new SR();
      rec.lang = "en-US";
      rec.interimResults = true;
      rec.continuous = false;
      let finalText = briefInput.value ? briefInput.value.trim() + " " : "";
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
        briefInput.value = (finalText + interim).replace(/\s{2,}/g, " ").trimStart();
      };
      rec.onerror = stop;
      rec.onend = stop;
      try { rec.start(); } catch (_) { stop(); }
    });
  })();

  // ---- attach a text/code file --------------------------------------------------
  //
  // Shown as a filename chip, not dumped into the textarea — the visitor's own
  // typed text stays clean. The file's content is only combined in behind the
  // scenes, at submit time.

  const MAX_DESCRIPTION_CHARS = 8000;
  const MAX_FILE_BYTES = 100 * 1024; // 100 KB — plenty for pasted code/text/notes
  const fileInput = document.getElementById("brief-file-input");
  const attachmentsWrap = document.getElementById("brief-attachments");
  const fileChipName = document.getElementById("brief-file-chip-name");
  let attachedFile = null; // { name, content } | null

  function clearAttachedFile() {
    attachedFile = null;
    attachmentsWrap.classList.add("d-none");
    fileChipName.textContent = "";
  }

  document.getElementById("brief-attach-btn").addEventListener("click", () => fileInput.click());
  document.getElementById("brief-file-remove").addEventListener("click", clearAttachedFile);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = ""; // allow re-selecting the same file later
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) {
      briefError.textContent = `"${file.name}" is too large (max 100 KB) — try a smaller file or paste a snippet instead.`;
      briefError.classList.remove("d-none");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      attachedFile = { name: file.name, content: String(reader.result || "") };
      fileChipName.textContent = file.name;
      attachmentsWrap.classList.remove("d-none");
      briefError.classList.add("d-none");
    };
    reader.onerror = () => {
      briefError.textContent = `Could not read "${file.name}" — please try again.`;
      briefError.classList.remove("d-none");
    };
    reader.readAsText(file);
  });

  // Combine the visitor's own text with the attached file's content (fenced,
  // labeled with its filename) — truncating the file portion, never the
  // visitor's own words, if the total would exceed the backend's limit.
  function buildDescription() {
    const typed = briefInput.value.trim();
    if (!attachedFile) return typed;
    const budget = MAX_DESCRIPTION_CHARS - typed.length - attachedFile.name.length - 20;
    const content = attachedFile.content.length > budget
      ? attachedFile.content.slice(0, Math.max(budget, 0))
      : attachedFile.content;
    const block = `${attachedFile.name}:\n\`\`\`\n${content}\n\`\`\``;
    return typed ? `${typed}\n\n${block}` : block;
  }

  briefForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const description = buildDescription();
    if (!description) return;
    briefBtn.disabled = true;
    briefInput.disabled = true;
    briefError.classList.add("d-none");
    briefStatus.classList.remove("d-none");
    try {
      await generate(description);
      clearAttachedFile();
    } catch (err) {
      briefError.textContent = err.message || "Prototype generation failed — please try again.";
      briefError.classList.remove("d-none");
    } finally {
      briefBtn.disabled = false;
      briefInput.disabled = false;
      briefStatus.classList.add("d-none");
    }
  });

  document.querySelectorAll(".generator-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      briefInput.value = chip.textContent;
      briefInput.focus();
    });
  });

  // ---- refine bar: follow-up regeneration on the same thread ------------------

  const refineForm = document.getElementById("refine-form");
  const refineInput = document.getElementById("refine-input");
  const refineBtn = refineForm.querySelector(".ai-send-btn");
  const refineStatus = document.getElementById("refine-status");
  const refineError = document.getElementById("refine-error");

  refineForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const description = refineInput.value.trim();
    if (!description) return;
    refineBtn.disabled = true;
    refineInput.disabled = true;
    refineError.classList.add("d-none");
    refineStatus.classList.remove("d-none");
    try {
      await generate(description);
      refineInput.value = "";
    } catch (err) {
      refineError.classList.remove("alert-success");
      refineError.classList.add("alert-danger");
      refineError.textContent = err.message || "Regeneration failed — please try again.";
      refineError.classList.remove("d-none");
    } finally {
      refineBtn.disabled = false;
      refineInput.disabled = false;
      refineStatus.classList.add("d-none");
    }
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

  // ---- copy shareable link ------------------------------------------------------

  const copyBtn = document.getElementById("ws-copy-link");
  const copyLabel = copyBtn.querySelector(".ws-tool-label");
  let copyResetTimer = null;

  copyBtn.addEventListener("click", async () => {
    if (!currentUrl) return;
    const absolute = new URL(currentUrl, window.location.origin).href;
    try {
      await navigator.clipboard.writeText(absolute);
    } catch (_) {
      // Clipboard API can be blocked (insecure context / permissions) — fall
      // back to a hidden textarea + execCommand so the button still works.
      const ta = document.createElement("textarea");
      ta.value = absolute;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (__) {}
      document.body.removeChild(ta);
    }
    copyBtn.classList.add("copied");
    if (copyLabel) copyLabel.textContent = "Copied!";
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(() => {
      copyBtn.classList.remove("copied");
      if (copyLabel) copyLabel.textContent = "Copy link";
    }, 2000);
  });

  // ---- approve / request changes ------------------------------------------------
  //
  // The refine bar above handles live AI iteration; this is the human hand-off —
  // it notifies Prince (approval or change notes) so he follows up personally.

  let decision = null;
  const verdict = document.getElementById("ws-verdict");
  const feedbackForm = document.getElementById("ws-feedback-form");
  const fbComment = document.getElementById("ws-comment");
  const fbName = document.getElementById("ws-fb-name");
  const fbEmail = document.getElementById("ws-fb-email");
  const fbError = document.getElementById("ws-fb-error");
  const fbSubmit = document.getElementById("ws-fb-submit");
  const thanks = document.getElementById("ws-thanks");
  const thanksMsg = document.getElementById("ws-thanks-msg");

  function openFeedback(kind) {
    decision = kind;
    fbError.classList.add("d-none");
    feedbackForm.classList.remove("d-none");
    if (kind === "approved") {
      fbComment.placeholder = "Anything to add? (optional)";
      fbName.focus();
    } else {
      fbComment.placeholder = "What should be different? (required)";
      fbComment.focus();
    }
  }

  document.getElementById("ws-approve").addEventListener("click", () => openFeedback("approved"));
  document.getElementById("ws-changes").addEventListener("click", () => openFeedback("changes_requested"));

  document.getElementById("ws-fb-cancel").addEventListener("click", () => {
    feedbackForm.classList.add("d-none");
    feedbackForm.reset();
    fbError.classList.add("d-none");
  });

  feedbackForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    fbError.classList.add("d-none");
    // Change requests need the actual notes, or Prince has nothing to act on.
    if (decision === "changes_requested" && !fbComment.value.trim()) {
      fbError.textContent = "Please tell Prince what you'd like changed.";
      fbError.classList.remove("d-none");
      fbComment.focus();
      return;
    }
    fbSubmit.disabled = true;
    fbSubmit.textContent = "Sending…";
    try {
      await api.post("/api/v1/chat/feedback", {
        token: sessionToken,
        decision,
        comment: fbComment.value.trim(),
        name: fbName.value.trim(),
        email: fbEmail.value.trim(),
      });
      verdict.classList.add("d-none");
      thanks.classList.remove("d-none");
      thanksMsg.textContent = decision === "approved"
        ? "Thank you! Prince has been notified and will email you shortly."
        : "Got it — your change notes are with Prince. He'll be in touch by email.";
    } catch (err) {
      fbError.textContent = err.message || "Could not send your feedback — please try again.";
      fbError.classList.remove("d-none");
    } finally {
      fbSubmit.disabled = false;
      fbSubmit.textContent = "Send to Prince";
    }
  });

  // "Keep refining" from the thank-you state → back to the refine bar up top.
  document.getElementById("ws-thanks-again").addEventListener("click", () => {
    thanks.classList.add("d-none");
    verdict.classList.remove("d-none");
    feedbackForm.classList.add("d-none");
    feedbackForm.reset();
    refineInput.focus();
    refineInput.scrollIntoView({ behavior: "smooth", block: "center" });
  });
})();
