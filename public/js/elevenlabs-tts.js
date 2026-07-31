(function () {
  const activeAudio = new Audio();
  let activeUrl = null;
  let unlocked = false;

  // Mirrors TextToSpeechController::MAX_TEXT_LENGTH — Lisa's public replies
  // stay short by design; Scout's admin-console ideation answers run much
  // longer, and truncating below what the server will actually synthesize
  // just moves the same "cuts off mid-sentence" bug to the client.
  const MAX_TEXT_LENGTH = { lisa: 700, scout: 3000 };

  function release() {
    activeAudio.pause();
    activeAudio.onplay = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.removeAttribute("src");
    activeAudio.load();
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
    }
  }

  // Browsers may reject audio started only after a network request because the
  // original click's activation has expired. Prime one reusable media element
  // on the first pointer/keyboard gesture so later Lisa replies can play.
  function unlock() {
    if (unlocked) return;
    activeAudio.muted = true;
    activeAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAA";
    const attempt = activeAudio.play();
    if (attempt && typeof attempt.then === "function") {
      attempt.then(function () {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio.muted = false;
        unlocked = true;
      }).catch(function () {
        activeAudio.muted = false;
      });
    }
  }

  async function play(text, handlers, agent) {
    const spoken = String(text || "").trim();
    if (!spoken) throw new Error("No speech text");
    release();

    const agentKey = agent || "lisa";
    const cap = MAX_TEXT_LENGTH[agentKey] || MAX_TEXT_LENGTH.lisa;
    const response = await fetch("/api/v1/voice/tts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken.slice(0, cap), agent: agentKey }),
    });
    if (!response.ok) {
      const error = new Error("Natural speech unavailable");
      error.status = response.status;
      throw error;
    }

    activeUrl = URL.createObjectURL(await response.blob());
    activeAudio.src = activeUrl;
    activeAudio.muted = false;
    activeAudio.onplay = function () { if (handlers && handlers.onstart) handlers.onstart(); };
    activeAudio.onended = function () {
      if (handlers && handlers.onend) handlers.onend();
      release();
    };
    activeAudio.onerror = function () {
      if (handlers && handlers.onerror) handlers.onerror();
      release();
    };
    await activeAudio.play();
    return activeAudio;
  }

  function stop() {
    release();
  }

  function isPlaying() {
    return !activeAudio.paused;
  }

  // Fall back to the browser's own voice on ANY failure — a disabled/
  // unconfigured provider (503), a quota/provider outage (502), or anything
  // else. This used to stay silent for Lisa on a non-503 failure, on the
  // theory that switching her voice mid-conversation was worse than no
  // voice at all; in practice an ElevenLabs outage (e.g. exhausted quota)
  // then left her voiceless for as long as the outage lasted, which is
  // worse for a live customer-facing widget than a different-sounding but
  // working voice. Every agent now degrades the same way.
  function shouldFallback(error) {
    return !!error;
  }

  document.addEventListener("pointerdown", unlock, { capture: true, once: true });
  document.addEventListener("keydown", unlock, { capture: true, once: true });

  window.ElevenLabsTTS = {
    play: play,
    stop: stop,
    isPlaying: isPlaying,
    unlock: unlock,
    shouldFallback: shouldFallback
  };
})();
