"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, X, Volume2, VolumeX, Phone } from "lucide-react";
import { AgentFace } from "@/components/AgentFace";
import { ChatBubble, type ChatMsg } from "@/components/chat/ChatBubble";
import { LeaveMessageForm } from "@/components/chat/LeaveMessageForm";
import { hasCode, proseOnly } from "@/lib/chat-format";
import { playTts, stopTts, speakWithBrowser, stopBrowserSpeech, stripForSpeech, unlockTts, type VoiceConfig } from "@/lib/tts";
import { api, type ChatStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// Live chat widget - full-parity port of public/js/ai-widget.js +
// public/js/agent-face.js + public/js/elevenlabs-tts.js onto real data
// (/api/v1/chat/*), restyled for the Figma-rebuild design system. Every
// enhancement here (chime, read-aloud, voice input, typewriter, code
// cards) is a progressive one - the chat still works without Web Audio /
// speech support, same as the legacy widget.

/** What Lisa opens a call with. A call that begins in silence reads as
 *  broken, so the voice path says hello - typed on screen and spoken aloud,
 *  the same line either way. Text stays silent: there the visitor is already
 *  typing, and being greeted by a wall of copy is what the old widget did. */
const callGreeting = (name: string) =>
  `Hey there. I'm ${name} from Prince Caleb. How can I help you today?`;

/** Silence gets answered three times before Lisa leaves: a nudge, a check
 *  that the messages are arriving at all, then a goodbye. Long enough that
 *  someone reading her last answer is not interrupted, short enough that an
 *  abandoned conversation closes itself the same visit. */
const IDLE_MS = 45000;
const IDLE_LINES = [
  "Still there? Tell me what you are building, or what you would like to fix, and I will take it from there.",
  "I might be missing your messages. If you are still there, type or say what is on your mind - otherwise we can pick this up another time.",
  "Looks like you are away, so I will close this off for now. Come back any time and we can carry on.",
];

const DEFAULTS = {
  offline: "We're offline at the moment, but your message won't be missed, leave your name, email and a few words below and Prince will get back to you shortly.",
};

// Minimal shape of the Web Speech recognition API this widget uses - no
// official TS lib types ship for it.
interface SRResult {
  0: { transcript: string };
  isFinal: boolean;
}
interface SRResultEvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SRInstance extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: SRResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

declare global {
  interface Window {
    ElevenLabsTTS: any;
    trackUiEvent?: (eventName: string) => void;
    webkitAudioContext?: typeof AudioContext;
  }
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [badgeSeen, setBadgeSeen] = useState(true); // true until we know otherwise (avoids SSR/CSR flash)
  const [booted, setBooted] = useState(false);

  const [online, setOnline] = useState<boolean | null>(null);
  const [assistantName, setAssistantName] = useState("Lisa");
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({ gender: "female", accent: "en-GB", rate: 1, pitch: 1 });

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  /** Set by a call being started, cleared by the greeting going out. A ref
   *  rather than state: boot() reads it after an await, and a re-render is
   *  not what should carry it. */
  const wantsGreeting = useRef(false);
  /** How far up the idle ladder this conversation has climbed. Reset by the
   *  visitor saying anything at all. */
  const idleStep = useRef(0);
  /** Whether Lisa is talking right now, readable from inside the recogniser's
   *  callbacks - which fire outside React and so cannot see the state. */
  const speakingRef = useRef(false);
  /** The microphone was ours to stop, so it is ours to start again. */
  const resumeMic = useRef(false);
  const [ended, setEnded] = useState(false);
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [listening, setListening] = useState(false);

  const idRef = useRef(0);
  const messagesRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<SRInstance | null>(null);
  const nextId = () => `m${idRef.current++}`;

  // ---- setup (runs once, cheap) ------------------------------------------
  useEffect(() => {
    document.addEventListener("pointerdown", unlockTts, { capture: true, once: true });
    document.addEventListener("keydown", unlockTts, { capture: true, once: true });
    // Deferred one tick so these state updates happen in a callback rather
    // than synchronously inside the effect body.
    const t = setTimeout(() => {
      setBadgeSeen(sessionStorage.getItem("chat_badge_seen") === "1");
      // Read-aloud is on unless the visitor has turned it off. Lisa has a real
      // ElevenLabs voice and it is the point of her, but the toggle still
      // persists a refusal so it is asked once, not every visit.
      setAutoSpeak(sessionStorage.getItem("chat_autospeak") !== "0");
      setToken(sessionStorage.getItem("chat_token"));
      setSpeechAvailable("speechSynthesis" in window);
      setMicAvailable(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
      // Status used to be fetched in boot(), which only runs once the widget is
      // opened — so the launcher could not know whether Lisa was available
      // until after the click it was meant to inform. It offers to speak to
      // her, and must not do that when she is offline, so it asks up front.
      // One small GET; boot() still refetches for the greeting and intro.
      api.chatStatus()
        .then((s) => setOnline(!!s.online))
        .catch(() => setOnline(false));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, showLeaveForm]);

  function playTone() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (audioCtxRef.current ??= new AC());
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Audio unsupported or blocked until a user gesture - fine to skip.
    }
  }

  function appendMessage(role: "user" | "bot", text: string, extra?: Partial<ChatMsg>) {
    const id = nextId();
    setMessages((m) => [...m, { id, role, text, ...extra }]);
    if (role === "bot" && !extra?.typing) playTone();
    return id;
  }

  /** Greets, but only into an empty conversation: someone returning to a
   *  thread they were already having does not need introducing again. The
   *  message animates, which is both how the text types itself out and how
   *  the read-aloud is triggered when it finishes (handleRevealDone). */
  function greetForCall(name: string) {
    if (!wantsGreeting.current) return;
    wantsGreeting.current = false;
    setMessages((m) =>
      m.length ? m : [{ id: nextId(), role: "bot", text: callGreeting(name), animate: true }],
    );
  }

  function appendTyping() {
    const id = nextId();
    setMessages((m) => [...m, { id, role: "bot", text: "", typing: true }]);
    return id;
  }

  function resolveMessage(id: string, text: string, opts?: { links?: ChatMsg["links"] }) {
    playTone();
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, text, typing: false, animate: true, links: opts?.links } : msg)));
  }

  // ---- boot ---------------------------------------------------------------
  async function boot() {
    let status: ChatStatus = {
      online: false,
      // The greeting and intro the API still sends are deliberately unused:
      // the widget opens straight into a conversation now, with nothing
      // said until there is something to say.
      greeting: "",
      intro: "",
      offline_message: DEFAULTS.offline,
      assistant_name: "Lisa",
      voice: { gender: "female", accent: "en-GB", rate: 1, pitch: 1 },
    };
    try {
      status = await api.chatStatus();
    } catch {
      // offline defaults above
    }
    setOnline(!!status.online);
    setAssistantName(status.assistant_name || "Lisa");
    setVoiceConfig(status.voice || voiceConfig);

    const storedToken = sessionStorage.getItem("chat_token");
    if (storedToken) {
      try {
        const session = await api.chatSession(storedToken);
        if (session.transcript.length) {
          setToken(storedToken);
          setMessages(
            session.transcript.map((t) => ({ id: nextId(), role: t.role === "user" ? "user" : "bot", text: t.text })),
          );
          setShowLeaveForm(!status.online);
          setBooted(true);
          return;
        }
      } catch {
        sessionStorage.removeItem("chat_token");
        setToken(null);
      }
    }

    if (status.online) {
      greetForCall(status.assistant_name || "Lisa");
    } else {
      appendMessage("bot", status.offline_message || DEFAULTS.offline);
      setShowLeaveForm(true);
    }
    setBooted(true);
  }

  /** Silence, answered the way a person would: a nudge, then a check that the
   *  messages are arriving at all, then a graceful exit rather than a widget
   *  left hanging open forever. The ladder resets the moment the visitor says
   *  anything, and the last rung ends the conversation. */
  useEffect(() => {
    if (!open || !online || ended || showLeaveForm || sending || messages.length === 0) return;

    const timer = window.setTimeout(() => {
      const step = idleStep.current;
      const line = IDLE_LINES[step];
      if (!line) return;
      idleStep.current = step + 1;
      setMessages((m) => [...m, { id: nextId(), role: "bot", text: line, animate: true }]);
      if (step === IDLE_LINES.length - 1) {
        setEnded(true);
        // Read-aloud goes with the conversation. Turned off here rather than
        // in the effect below, which has only external systems to stop.
        setAutoSpeak(false);
      }
    }, IDLE_MS);

    return () => window.clearTimeout(timer);
  }, [open, online, ended, showLeaveForm, sending, messages]);

  /** A call plays Lisa through the speakers and listens through the
   *  microphone at the same time, so she hears herself and types her own
   *  greeting into the composer. The microphone stands down while she talks
   *  and starts again when she stops - it keeps the permission it was granted
   *  by the tap that opened the call, so no second gesture is needed. */
  useEffect(() => {
    speakingRef.current = speakingId !== null;

    if (speakingId !== null) {
      if (listening) {
        resumeMic.current = true;
        recRef.current?.stop();
      }
      return;
    }

    if (resumeMic.current && open && !ended && micAvailable && !listening) {
      resumeMic.current = false;
      toggleMic();
    }
    // toggleMic is redefined every render and only ever reads current state,
    // so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakingId, listening, open, ended, micAvailable]);

  /** Ending stops the microphone and whatever was being read aloud: the one
   *  thing worse than a widget that never closes is one that closes and keeps
   *  listening. */
  useEffect(() => {
    if (!ended) return;
    stopTts();
    stopBrowserSpeech();
    recRef.current?.stop();
  }, [ended]);

  /**
   * `voice` opens straight into a spoken exchange: read-aloud on, and the mic
   * already listening so the visitor can just talk. Speech recognition needs a
   * user gesture, and the launcher tap is one — but only if the mic starts in
   * the same task as the click, hence starting it here rather than in an
   * effect once the panel has rendered.
   */
  function openWidget(mode: "text" | "voice" = "text", opts: { greet?: boolean } = {}) {
    setOpen(true);
    if (!badgeSeen) {
      setBadgeSeen(true);
      sessionStorage.setItem("chat_badge_seen", "1");
    }
    // Asked for by the caller, not inferred from the mode: the call button
    // falls back to text where there is no microphone, and it should still
    // open with Lisa saying hello - that is what the button promised.
    if (opts.greet) wantsGreeting.current = true;
    if (mode === "voice") {
      unlockTts();
      setAutoSpeak(true);
      sessionStorage.setItem("chat_autospeak", "1");
      if (micAvailable && !listening) toggleMic();
    }
    // boot() greets on its way out; a widget that has already booted has no
    // one left to do it.
    if (!booted) boot();
    else if (opts.greet && online) greetForCall(assistantName);
  }

  // ---- send a free-text message -------------------------------------------
  async function sendChatMessage(text: string) {
    idleStep.current = 0;
    setEnded(false);
    appendMessage("user", text);
    const pendingId = appendTyping();
    setSending(true);
    try {
      const res = await api.chatMessage({ message: text, token });
      setToken(res.token);
      sessionStorage.setItem("chat_token", res.token);
      resolveMessage(pendingId, res.reply);
    } catch (err) {
      resolveMessage(pendingId, err instanceof Error ? err.message : "Sorry, something went wrong. Please leave a message below instead.");
      setShowLeaveForm(true);
    } finally {
      setSending(false);
    }
  }

  function onSubmitText(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    sendChatMessage(text);
  }

  async function submitLeaveForm(data: { name: string; email: string; phone: string; message: string }) {
    try {
      await api.chatInquiry({ token, ...data, attribution: {} });
      setShowLeaveForm(false);
      appendMessage("bot", `Thanks! Your message is on its way, Prince will reply to you at ${data.email} soon. 📬`);
    } catch (err) {
      appendMessage("bot", err instanceof Error ? err.message : "Could not send your message, please try again.");
    }
  }

  // ---- read-aloud -----------------------------------------------------------
  async function handleSpeakClick(id: string, rawText: string) {
    const spoken = stripForSpeech(hasCode(rawText) ? proseOnly(rawText) : rawText);
    if (!spoken) return;
    if (speakingId === id) {
      stopTts();
      stopBrowserSpeech();
      setSpeakingId(null);
      return;
    }
    stopTts();
    stopBrowserSpeech();
    try {
      await playTts(spoken, {
        onstart: () => setSpeakingId(id),
        onend: () => setSpeakingId(null),
        onerror: () => setSpeakingId(null),
      });
    } catch {
      speakWithBrowser(spoken, voiceConfig, {
        onstart: () => setSpeakingId(id),
        onend: () => setSpeakingId(null),
        onerror: () => setSpeakingId(null),
      });
    }
  }

  function handleRevealDone(id: string, text: string) {
    if (autoSpeak) handleSpeakClick(id, text);
  }

  function toggleAutoSpeak() {
    setAutoSpeak((v) => {
      const next = !v;
      sessionStorage.setItem("chat_autospeak", next ? "1" : "0");
      if (!next) {
        stopTts();
        stopBrowserSpeech();
        setSpeakingId(null);
      }
      return next;
    });
  }

  // ---- voice input (speech-to-text) ------------------------------------------
  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as any;
    if (!SR) return;
    const rec = new SR();
    recRef.current = rec;
    rec.lang = voiceConfig.accent && voiceConfig.accent !== "auto" ? voiceConfig.accent : "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = input ? input.trim() + " " : "";
    rec.onstart = () => setListening(true);
    rec.onresult = (e: any) => {
      // Anything heard while Lisa is talking is Lisa, coming back in through
      // the speakers. The recogniser is stopped for the duration below, but
      // results already in flight still land here afterwards, and they are
      // what put her own greeting in the composer.
      if (speakingRef.current) return;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setInput((finalText + interim).replace(/\s{2,}/g, " ").trimStart());
    };
    rec.onerror = (e: any) => setListening(false);
    rec.onend = () => setListening(false);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }

  const statusLabel = online === null ? "Connecting…" : online ? "Online" : "Offline";

  return (
    <>
      {/* Launcher. Modelled on the ElevenLabs help widget: one card that says
          who is there and then offers the ways in, rather than a stack of
          floating buttons. The call is the filled pill because talking to
          Lisa is the thing worth doing; text keeps its own button rather than
          becoming a mode of the voice one.

          The card is the resting state. There is no bubble to click first:
          a launcher that only says "there is a launcher here" costs a click
          to learn what the card says outright. */}
      {!open && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="lisa-card">
            <div className="flex items-center gap-2.5 px-1.5 pb-3 pt-1">
              <AgentFace size="sm" />
              <span className="text-[0.95rem] font-medium text-text">
                {online === false ? `${assistantName} is away` : "Need help?"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                // Always the call, even where the browser has no speech
                // recognition: reading aloud does not need a microphone, and
                // a silent "Ask anything" is not what the button says.
                onClick={() => openWidget("voice", { greet: true })}
                className="lisa-cta"
              >
                <Phone className="size-4" />
                {online === false ? "Leave a message" : "Ask anything"}
              </button>

              <button
                type="button"
                onClick={() => openWidget("text")}
                aria-label={`Chat with ${assistantName}`}
                className="lisa-round relative"
              >
                <svg viewBox="0 0 24 24" fill="none" className="size-5" aria-hidden="true">
                  <path
                    d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <circle cx="8.75" cy="9.5" r="1.05" fill="currentColor" />
                  <circle cx="12" cy="9.5" r="1.05" fill="currentColor" />
                  <circle cx="15.25" cy="9.5" r="1.05" fill="currentColor" />
                </svg>
                {!badgeSeen && <span className="lisa-badge" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={`Live chat with ${assistantName}`}
          className="fixed bottom-6 right-6 z-50 flex max-h-[min(34rem,calc(100vh-4rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[calc(var(--radius)*1.3)] border border-hairline bg-bg shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        >
          <header className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <AgentFace size="sm" thinking={sending} speaking={speakingId !== null} />
            <div className="min-w-0 flex-1 leading-tight">
              <strong className="block truncate text-sm text-text">{assistantName}</strong>
              <span className="flex items-center gap-1.5 text-xs text-text-2">
                <span className={cn("size-1.5 rounded-full", online ? "bg-accent" : "bg-muted")} />
                {statusLabel}
              </span>
            </div>
            {speechAvailable && (
              <button
                type="button"
                onClick={toggleAutoSpeak}
                title={autoSpeak ? "Auto read-aloud: on" : "Auto read-aloud: off"}
                aria-pressed={autoSpeak}
                className={cn("shrink-0 text-muted transition-colors hover:text-text", autoSpeak && "text-accent")}
              >
                {autoSpeak ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 text-muted transition-colors hover:text-text">
              <X className="size-4" />
            </button>
          </header>

          <div ref={messagesRef} role="log" aria-live="polite" aria-label={`Conversation with ${assistantName}`} className="flex min-h-[8rem] flex-1 flex-col gap-2.5 overflow-y-auto p-4">
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                msg={m}
                speaking={speakingId === m.id}
                canSpeak={speechAvailable}
                onRevealDone={handleRevealDone}
                onSpeakClick={handleSpeakClick}
              />
            ))}
          </div>

          {showLeaveForm ? (
            <LeaveMessageForm onSubmit={submitLeaveForm} />
          ) : (
            <>
              {/* Ended, but not closed: the composer stays exactly where it
                  was, so picking the conversation back up is typing into the
                  same box rather than finding a way back in. */}
              {ended && (
                <p className="border-t border-hairline px-4 py-3 text-center text-xs text-text-3">
                  {assistantName} ended the conversation.{" "}
                  <span className="text-text-2">Send a message to pick it back up.</span>
                </p>
              )}

              <form onSubmit={onSubmitText} className="flex items-center gap-2 border-t border-hairline p-3">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="e.g. a booking site for my salon"
                autoComplete="off"
                required
                className="h-10 flex-1 rounded-full border border-hairline-strong bg-bg-2/50 px-4 text-sm text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
              />
              {micAvailable && (
                <button
                  type="button"
                  onClick={toggleMic}
                  title={listening ? "Listening… tap to stop" : "Speak your message"}
                  aria-label="Speak your message"
                  className={cn(
                    "tilt-3d tilt-3d-tile grid size-9 shrink-0 place-items-center rounded-full border border-hairline text-text-2 transition-colors hover:border-accent/40 hover:text-text",
                    listening && "animate-pulse border-accent/50 text-accent",
                  )}
                >
                  <Mic className="size-4" />
                </button>
              )}
                <button
                  type="submit"
                  aria-label="Send message"
                  title="Send"
                  className="tilt-3d tilt-3d-tile grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-strong"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
