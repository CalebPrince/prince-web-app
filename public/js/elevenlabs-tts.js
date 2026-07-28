(function () {
  let activeAudio = null;
  let activeUrl = null;

  function release() {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.src = "";
      activeAudio = null;
    }
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
      activeUrl = null;
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
    const audio = new Audio(activeUrl);
    activeAudio = audio;
    audio.onplay = function () { if (handlers && handlers.onstart) handlers.onstart(); };
    audio.onended = function () {
      if (handlers && handlers.onend) handlers.onend();
      release();
    };
    audio.onerror = function () {
      if (handlers && handlers.onerror) handlers.onerror();
      release();
    };
    await audio.play();
    return audio;
  }

  function stop() {
    release();
  }

  function isPlaying() {
    return !!(activeAudio && !activeAudio.paused);
  }

  window.ElevenLabsTTS = { play: play, stop: stop, isPlaying: isPlaying };
})();
