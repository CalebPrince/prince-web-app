(function () {
  'use strict';
  const button = document.getElementById('lisa-video-start');
  const stage = document.getElementById('lisa-video-stage');
  const poster = document.getElementById('lisa-video-poster');
  const mount = document.getElementById('lisa-video-embed');
  const state = stage && stage.querySelector('.lisa-video-status strong');
  const note = document.getElementById('lisa-video-note');
  const controls = document.getElementById('lisa-video-controls');
  const muteButton = document.getElementById('lisa-video-mute');
  const endButton = document.getElementById('lisa-video-end');
  let session = null;
  let muted = false;
  if (!button || !stage || !poster || !mount || !state || !note || !window.LiveAvatarSDK) return;

  async function stopSession() {
    const activeSession = session;
    session = null;
    if (activeSession) { try { await activeSession.stop(); } catch (_) {} }
    mount.replaceChildren(); mount.hidden = true; poster.hidden = false;
    if (controls) controls.hidden = true;
    stage.classList.remove('is-live'); state.textContent = 'Ready';
    button.disabled = false; button.textContent = 'Start a video chat';
    note.textContent = 'You will be speaking with an AI assistant. Microphone permission is required.';
  }

  button.addEventListener('click', async function () {
    button.disabled = true; button.textContent = 'Connecting to Lisa…'; state.textContent = 'Connecting';
    note.textContent = 'Requesting microphone access and creating a secure sandbox session…';
    try {
      const response = await fetch('/api/v1/liveavatar/session-token', { method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok || !data.session_token) throw new Error(data.error || 'Unable to start Lisa.');
      const video = document.createElement('video');
      video.autoplay = true; video.playsInline = true;
      video.setAttribute('aria-label', 'Live video conversation with Lisa, an AI assistant');
      mount.replaceChildren(video); mount.hidden = false;
      const sdk = window.LiveAvatarSDK;
      session = new sdk.LiveAvatarSession(data.session_token, {
        voiceChat: true,
        apiUrl: window.location.origin + '/api/v1/liveavatar/sdk'
      });
      let streamReady = false;
      let connected = false;
      let greetingSent = false;
      function sendGreetingWhenReady() {
        if (!streamReady || !connected || greetingSent || !session) return;
        greetingSent = true;
        window.setTimeout(function () {
          if (session) session.message("Hi, I'm Lisa, Prince Caleb's AI assistant. How can I help with your business today?");
        }, 700);
      }
      session.on(sdk.SessionEvent.SESSION_STREAM_READY, function () {
        session.attach(video);
        video.playbackRate = 1;
        video.muted = false;
        video.play().catch(function () {});
        poster.hidden = true; if (controls) controls.hidden = false;
        stage.classList.add('is-live'); state.textContent = 'Live'; button.textContent = 'Video chat active';
        note.textContent = 'Lisa is an AI assistant. This preview runs in sandbox mode.';
        streamReady = true;
        sendGreetingWhenReady();
      });
      session.on(sdk.SessionEvent.SESSION_STATE_CHANGED, function (nextState) {
        connected = nextState === sdk.SessionState.CONNECTED;
        sendGreetingWhenReady();
      });
      session.on(sdk.SessionEvent.SESSION_DISCONNECTED, function () { if (session) stopSession(); });
      await session.start();
    } catch (error) {
      await stopSession(); state.textContent = 'Unavailable';
      note.textContent = (error.message || 'Unable to start Lisa.') + ' You can still use website chat.';
      button.textContent = 'Try video again';
    }
  });
  if (muteButton) muteButton.addEventListener('click', async function () {
    if (!session) return; muted = !muted;
    if (muted) await session.voiceChat.mute(); else await session.voiceChat.unmute();
    muteButton.textContent = muted ? 'Unmute' : 'Mute'; muteButton.setAttribute('aria-pressed', String(muted));
  });
  if (endButton) endButton.addEventListener('click', stopSession);
  window.addEventListener('pagehide', function () { if (session) session.stop(); });
})();
