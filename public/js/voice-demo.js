(function () {
  const shell = document.querySelector(".hero-call-mockup");
  const startButton = document.getElementById("voice-demo-start");
  if (!shell || !startButton || typeof api === "undefined") return;

  const buttonLabel = startButton.querySelector("span");
  const statusText = document.getElementById("voice-demo-status");
  const stateText = document.getElementById("voice-demo-state");
  const speakerText = document.getElementById("voice-demo-speaker");
  const transcriptText = document.getElementById("voice-demo-transcript");
  const timerText = document.getElementById("voice-demo-timer");
  const wave = document.getElementById("voice-demo-wave");
  const assistantName = document.getElementById("voice-demo-name");
  const avatar = document.getElementById("voice-demo-avatar");
  const form = document.getElementById("voice-demo-form");
  const input = document.getElementById("voice-demo-input");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let recognition = null;
  let listening = false;
  let busy = false;
  let timerId = null;
  let startedAt = 0;
  let token = null;
  let voice = { gender: "female", accent: "en-GB", rate: 1, pitch: 1 };
  let name = "Lisa";

  try { token = sessionStorage.getItem("voice_demo_token"); } catch (_) {}

  function track(event) {
    api.post("/api/v1/voice-demo/event", {
      event: event,
      token: token,
      path: window.location.pathname
    }).catch(function () {});
    if (window.trackUiEvent) window.trackUiEvent("voice_demo_" + event);
  }

  function setMode(mode, label, state) {
    shell.classList.remove("is-listening", "is-thinking", "is-speaking");
    wave.classList.remove("is-idle", "is-thinking");
    if (mode === "idle") wave.classList.add("is-idle");
    if (mode === "thinking") wave.classList.add("is-thinking");
    if (mode !== "idle") shell.classList.add("is-" + mode);
    statusText.textContent = label;
    stateText.textContent = state;
  }

  function startTimer() {
    stopTimer(false);
    startedAt = Date.now();
    timerText.textContent = "00:00";
    timerId = window.setInterval(function () {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      timerText.textContent = String(Math.floor(seconds / 60)).padStart(2, "0")
        + ":" + String(seconds % 60).padStart(2, "0");
    }, 250);
  }

  function stopTimer(reset) {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    if (reset) timerText.textContent = "00:00";
  }

  function cleanForSpeech(text) {
    return String(text || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/[*_#>`~]/g, "")
      .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function pickVoice() {
    const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (!voices.length) return null;
    const accent = voice.accent && voice.accent !== "auto" ? voice.accent.toLowerCase() : "";
    const english = voices.filter(function (candidate) { return /^en/i.test(candidate.lang); });
    return english.find(function (candidate) { return candidate.lang.toLowerCase().startsWith(accent); })
      || english[0]
      || voices[0];
  }

  function speakReply(text) {
    const spoken = cleanForSpeech(text);
    if (!spoken) {
      finish();
      return;
    }
    if (window.ElevenLabsTTS) {
      window.ElevenLabsTTS.stop();
      window.ElevenLabsTTS.play(spoken, {
        onstart: function () {
          setMode("speaking", name + " is speaking", "Speaking");
          buttonLabel.textContent = "Stop audio";
          startButton.disabled = false;
        },
        onend: finish,
        onerror: finish
      }).catch(function (error) {
        if (window.ElevenLabsTTS.shouldFallback(error)) speakWithBrowser(spoken);
        else finish();
      });
      return;
    }
    speakWithBrowser(spoken);
  }

  function speakWithBrowser(spoken) {
    if (!("speechSynthesis" in window)) {
      finish();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.rate = Math.min(1.3, Math.max(0.7, Number(voice.rate) || 1));
    utterance.pitch = Math.min(1.4, Math.max(0.6, Number(voice.pitch) || 1));
    const selected = pickVoice();
    if (selected) {
      utterance.voice = selected;
      utterance.lang = selected.lang;
    }
    utterance.onstart = function () {
      setMode("speaking", name + " is speaking", "Speaking");
      buttonLabel.textContent = "Stop audio";
      startButton.disabled = false;
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }

  function finish() {
    stopTimer(false);
    busy = false;
    listening = false;
    startButton.disabled = false;
    startButton.classList.remove("is-listening");
    buttonLabel.textContent = SR ? "Ask another question" : "Type another question";
    setMode("idle", "Voice demo ready", "Ready");
  }

  function showError(message) {
    speakerText.textContent = "Demo status";
    transcriptText.textContent = message;
    stopTimer(false);
    finish();
  }

  async function sendQuestion(question) {
    const text = String(question || "").trim();
    if (!text || busy) return;
    busy = true;
    startButton.disabled = true;
    buttonLabel.textContent = "Thinking…";
    speakerText.textContent = "You";
    transcriptText.textContent = text;
    setMode("thinking", name + " is thinking", "Thinking");

    try {
      const response = await api.post("/api/v1/voice-demo/message", {
        message: text,
        token: token,
        niche: "clinic"
      }, { timeoutMs: 30000 });
      if (!response || typeof response !== "object") {
        throw new Error("The assistant returned an empty response. Check that the chat API and at least one AI provider are configured.");
      }
      if (typeof response.reply !== "string" || !response.reply.trim()) {
        throw new Error(response.error || "The assistant did not return a reply. Please try again.");
      }
      token = response.token || token;
      try { if (token) sessionStorage.setItem("voice_demo_token", token); } catch (_) {}
      speakerText.textContent = name;
      transcriptText.textContent = response.reply.trim();
      speakReply(response.reply.trim());
    } catch (error) {
      track("answer_failed");
      showError(error.message || "The voice demo could not answer. Please try again.");
    }
  }

  function showTypedFallback(message) {
    form.classList.remove("d-none");
    input.focus();
    buttonLabel.textContent = "Type your question";
    if (message) {
      speakerText.textContent = "Demo status";
      transcriptText.textContent = message;
    }
  }

  function startListening() {
    if (!SR) {
      showTypedFallback("Voice input is not available in this browser. Type a question below, the answer will still be spoken aloud.");
      return;
    }
    if (window.ElevenLabsTTS) window.ElevenLabsTTS.stop();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    recognition = new SR();
    recognition.lang = voice.accent && voice.accent !== "auto" ? voice.accent : "en-GB";
    recognition.interimResults = true;
    recognition.continuous = false;
    let finalText = "";

    recognition.onstart = function () {
      track("mic_granted");
      listening = true;
      startTimer();
      startButton.classList.add("is-listening");
      buttonLabel.textContent = "Stop listening";
      speakerText.textContent = "You";
      transcriptText.textContent = "Listening…";
      setMode("listening", "Listening to you", "Listening");
    };
    recognition.onresult = function (event) {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const part = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += part;
        else interim += part;
      }
      transcriptText.textContent = (finalText + interim).trim() || "Listening…";
    };
    recognition.onerror = function (event) {
      listening = false;
      startButton.classList.remove("is-listening");
      const errors = {
        "not-allowed": "Microphone access is blocked. Allow it in your browser settings, or type your question below.",
        "audio-capture": "No microphone was found. You can type your question below.",
        "no-speech": "I did not hear a question. Tap the button and try again."
      };
      const message = errors[event.error] || "Voice input stopped. You can try again or type your question.";
      if (event.error === "not-allowed") track("mic_blocked");
      if (event.error === "not-allowed" || event.error === "audio-capture") showTypedFallback(message);
      else showError(message);
    };
    recognition.onend = function () {
      listening = false;
      startButton.classList.remove("is-listening");
      if (finalText.trim()) sendQuestion(finalText);
      else if (!busy) finish();
    };
    try {
      recognition.start();
    } catch (_) {
      showTypedFallback("The microphone could not start. Type your question below instead.");
    }
  }

  startButton.addEventListener("click", function () {
    if (listening && recognition) {
      recognition.stop();
      return;
    }
    if ((window.ElevenLabsTTS && window.ElevenLabsTTS.isPlaying())
        || (window.speechSynthesis && window.speechSynthesis.speaking)) {
      if (window.ElevenLabsTTS) window.ElevenLabsTTS.stop();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      finish();
      return;
    }
    if (!busy) {
      track("demo_started");
      startListening();
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    sendQuestion(question);
  });

  (async function boot() {
    try {
      const status = await api.get("/api/v1/chat/status");
      name = status.assistant_name || name;
      voice = Object.assign({}, voice, status.voice || {});
      assistantName.textContent = name + " · AI voice agent";
      avatar.setAttribute("aria-label", name + " AI assistant");
    } catch (_) {}
    if (!SR) {
      buttonLabel.textContent = "Try the demo";
      startButton.title = "Your browser will use typed input and spoken replies";
    }
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  })();

  document.querySelectorAll("[data-voice-demo-cta]").forEach(function (link) {
    link.addEventListener("click", function () { track("cta_clicked"); });
  });
})();
