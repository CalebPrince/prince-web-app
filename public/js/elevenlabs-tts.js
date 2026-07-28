(function () {
  const activeAudio = new Audio();
  let activeUrl = null;
  let unlocked = false;

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

  async function play(text, handlers) {
    const spoken = String(text || "").trim();
    if (!spoken) throw new Error("No speech text");
    release();

    const response = await fetch("/api/v1/voice/tts", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: spoken.slice(0, 700) }),
    });
    if (!response.ok) throw new Error("Natural speech unavailable");

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

  document.addEventListener("pointerdown", unlock, { capture: true, once: true });
  document.addEventListener("keydown", unlock, { capture: true, once: true });

  window.ElevenLabsTTS = { play: play, stop: stop, isPlaying: isPlaying, unlock: unlock };
})();
