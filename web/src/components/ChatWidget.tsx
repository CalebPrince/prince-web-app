"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Mic, Menu as MenuIcon, X, Volume2, VolumeX } from "lucide-react";
import { AgentFace } from "@/components/AgentFace";
import { ChatBubble, type ChatMsg } from "@/components/chat/ChatBubble";
import { QuickReplyMenu, type MenuButton } from "@/components/chat/QuickReplyMenu";
import { LeaveMessageForm } from "@/components/chat/LeaveMessageForm";
import { hasCode, proseOnly } from "@/lib/chat-format";
import { playTts, stopTts, speakWithBrowser, stopBrowserSpeech, stripForSpeech, unlockTts, type VoiceConfig } from "@/lib/tts";
import { api, type ChatStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// Live chat widget — full-parity port of public/js/ai-widget.js +
// public/js/agent-face.js + public/js/elevenlabs-tts.js onto real data
// (/api/v1/chat/*), restyled for the Figma-rebuild design system. Every
// enhancement here (chime, read-aloud, voice input, typewriter, code
// cards) is a progressive one — the chat still works without Web Audio /
// speech support, same as the legacy widget.

type MenuOption = {
  label: string;
  to?: string;
  action?: "projectLead" | "techInfo" | "portfolio" | "supportForm" | "humanHandoff";
  text?: string;
  key?: string;
  tag?: string;
};
type MenuNode = { prompt: string; back?: string; options: MenuOption[] };

const MENU: Record<string, MenuNode> = {
  main: {
    prompt: "How can I help you today?",
    options: [
      { label: "🚀 Start a Project / Get a Quote", to: "startProject" },
      { label: "⚡ Tech Stack & Capabilities", to: "techStack" },
      { label: "💼 View Portfolio & Case Studies", action: "portfolio" },
      { label: "📞 Existing Client Support", to: "support" },
      { label: "💬 Talk to a Human", action: "humanHandoff" },
    ],
  },
  startProject: {
    prompt: "What kind of project are you thinking about?",
    back: "main",
    options: [
      { label: "📱 Mobile App Development", to: "mobileApp" },
      { label: "💻 Custom Web Application", to: "webApp" },
      { label: "🌐 Website & E-commerce", to: "website" },
      { label: "🤖 AI or Automation Integration", to: "aiAutomation" },
    ],
  },
  mobileApp: {
    prompt: "Mobile app, which platform?",
    back: "startProject",
    options: [
      { label: "🍎 iOS", action: "projectLead", text: "I'm interested in a mobile app for iOS." },
      { label: "🤖 Android", action: "projectLead", text: "I'm interested in a mobile app for Android." },
      { label: "🔀 Cross-Platform (Hybrid)", action: "projectLead", text: "I'm interested in a cross-platform (hybrid) mobile app." },
    ],
  },
  webApp: {
    prompt: "Custom web application, what shape is it?",
    back: "startProject",
    options: [
      { label: "🖥️ Frontend/Backend Build", action: "projectLead", text: "I need a custom web application, a frontend and backend build." },
      { label: "📊 SaaS Platform", action: "projectLead", text: "I want to build a SaaS platform." },
      { label: "🔐 Client/Admin Portal", action: "projectLead", text: "I need a custom client or admin portal." },
    ],
  },
  website: {
    prompt: "Website & e-commerce, what do you need?",
    back: "startProject",
    options: [
      { label: "🐘 Custom PHP/Bootstrap Site", action: "projectLead", text: "I need a custom PHP/Bootstrap website." },
      { label: "🛒 E-commerce Storefront", action: "projectLead", text: "I want an e-commerce storefront." },
      { label: "🏢 Corporate Site", action: "projectLead", text: "I need a corporate website." },
    ],
  },
  aiAutomation: {
    prompt: "AI or automation, what are you picturing?",
    back: "startProject",
    options: [
      { label: "🤖 Chatbot", action: "projectLead", text: "I'm interested in building a chatbot." },
      { label: "⚙️ Workflow Automation", action: "projectLead", text: "I'm interested in workflow automation." },
      { label: "🔌 Custom API Integration", action: "projectLead", text: "I need a custom API integration." },
    ],
  },
  techStack: {
    prompt: "What would you like to know about?",
    back: "main",
    options: [
      { label: "⚡ Frontend Technologies", action: "techInfo", key: "frontend" },
      { label: "⚙️ Backend & APIs", action: "techInfo", key: "backend" },
      { label: "🗄️ Database & Cloud", action: "techInfo", key: "database" },
      { label: "🛠️ CMS & Platforms", action: "techInfo", key: "cms" },
    ],
  },
  support: {
    prompt: "What do you need help with?",
    back: "main",
    options: [
      { label: "🐛 Report a Bug / Technical Issue", action: "supportForm", tag: "Bug Report" },
      { label: "📈 Request a Feature/Update", action: "supportForm", tag: "Feature Request" },
      { label: "💳 Billing & Invoicing Query", action: "supportForm", tag: "Billing Query" },
      { label: "🧑‍💻 Talk to my Project Manager", action: "supportForm", tag: "Talk to PM" },
    ],
  },
};

const TECH_INFO: Record<string, string> = {
  frontend:
    "⚡ On the frontend: plain HTML/CSS/JS or React when a build needs real interactivity, Bootstrap 5 or Tailwind for layout, and React Native for cross-platform mobile, no framework or build-step overhead unless the project actually calls for it.",
  backend:
    "⚙️ On the backend: PHP, Node.js, and Python/FastAPI, all built around clean REST APIs, picked per project, not a one-size-fits-all stack.",
  database:
    "🗄️ For data: MySQL, PostgreSQL, and SQLite for anything relational, NoSQL when the shape of the data calls for it, plus cloud object storage/CDNs for media-heavy features.",
  cms: "🛠️ For content: tailored WordPress builds, headless CMS setups, or a fully custom lightweight admin panel, whichever keeps day-to-day editing easy without dragging in more than you need.",
};

const DEFAULTS = {
  greeting: "Hi there! 👋 Welcome. We build AI voice agents, WhatsApp assistants, and automations around the work your team repeats.",
  intro: "Pick an option below, or describe the call, message, or repetitive workflow you want to improve.",
  offline: "We're offline at the moment, but your message won't be missed — leave your name, email and a few words below and Prince will get back to you shortly.",
};

// Minimal shape of the Web Speech recognition API this widget uses — no
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
  const [menuNode, setMenuNode] = useState<string | null>(null);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveFormPrefill, setLeaveFormPrefill] = useState("");
  const [leaveFormHasBack, setLeaveFormHasBack] = useState(false);

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
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
      setAutoSpeak(sessionStorage.getItem("chat_autospeak") === "1");
      setToken(sessionStorage.getItem("chat_token"));
      setSpeechAvailable("speechSynthesis" in window);
      setMicAvailable(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, menuNode, showLeaveForm]);

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
      // Audio unsupported or blocked until a user gesture — fine to skip.
    }
  }

  function appendMessage(role: "user" | "bot", text: string, extra?: Partial<ChatMsg>) {
    const id = nextId();
    setMessages((m) => [...m, { id, role, text, ...extra }]);
    if (role === "bot" && !extra?.typing) playTone();
    return id;
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

  function clearMessages() {
    setMessages([]);
  }

  // ---- boot ---------------------------------------------------------------
  async function boot() {
    let status: ChatStatus = {
      online: false,
      greeting: DEFAULTS.greeting,
      intro: DEFAULTS.intro,
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

    appendMessage("bot", status.greeting || DEFAULTS.greeting);
    if (status.online) {
      appendMessage("bot", status.intro || DEFAULTS.intro);
      setMenuNode("main");
    } else {
      appendMessage("bot", status.offline_message || DEFAULTS.offline);
      setShowLeaveForm(true);
    }
    setBooted(true);
  }

  function openWidget() {
    setOpen(true);
    if (!badgeSeen) {
      setBadgeSeen(true);
      sessionStorage.setItem("chat_badge_seen", "1");
    }
    if (!booted) boot();
  }

  // ---- send a free-text message -------------------------------------------
  async function sendChatMessage(text: string) {
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
      setLeaveFormHasBack(false);
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
    setMenuNode(null);
    sendChatMessage(text);
  }

  // ---- quick-reply menu -----------------------------------------------------
  function selectMenu(nodeId: string, opts: { skipPrompt?: boolean } = {}) {
    if (!opts.skipPrompt) appendMessage("bot", MENU[nodeId].prompt);
    setMenuNode(nodeId);
  }

  async function showPortfolio() {
    const pendingId = appendTyping();
    try {
      const projects = await api.projects();
      const top = projects.slice(0, 3);
      if (top.length) {
        resolveMessage(pendingId, "A few things I've built recently:", {
          links: top.map((p) => ({ href: `/systems/${p.slug}`, label: p.title })),
        });
      } else {
        resolveMessage(pendingId, "Take a look at the full portfolio, new work gets added regularly.");
      }
    } catch {
      resolveMessage(pendingId, "Couldn't load the portfolio right now, take a look at the full page instead.");
    }
  }

  function handleOption(opt: MenuOption) {
    clearMessages();
    if (opt.to) {
      selectMenu(opt.to);
      return;
    }
    switch (opt.action) {
      case "projectLead":
        setMenuNode(null);
        sendChatMessage(opt.text!);
        break;
      case "techInfo":
        appendMessage("bot", TECH_INFO[opt.key!]);
        selectMenu("techStack");
        break;
      case "portfolio":
        setMenuNode(null);
        showPortfolio();
        break;
      case "supportForm":
        setMenuNode(null);
        setLeaveFormPrefill(`[${opt.tag}] `);
        setLeaveFormHasBack(true);
        setShowLeaveForm(true);
        break;
      case "humanHandoff":
        setMenuNode(null);
        setLeaveFormPrefill("");
        setLeaveFormHasBack(true);
        setShowLeaveForm(true);
        break;
    }
  }

  function backToMenuFromForm() {
    setShowLeaveForm(false);
    selectMenu("main");
  }

  function openMainMenu() {
    setShowLeaveForm(false);
    clearMessages();
    selectMenu("main");
  }

  async function submitLeaveForm(data: { name: string; email: string; phone: string; message: string }) {
    try {
      await api.chatInquiry({ token, ...data, attribution: {} });
      setShowLeaveForm(false);
      setMenuNode(null);
      appendMessage("bot", `Thanks! Your message is on its way, Prince will reply to you at ${data.email} soon. 📬`);
      if (online) selectMenu("main");
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

  // ---- menu buttons -----------------------------------------------------------
  const currentMenuButtons: MenuButton[] = menuNode
    ? [
        ...MENU[menuNode].options.map((opt) => ({ label: opt.label, onClick: () => handleOption(opt) })),
        ...(MENU[menuNode].back
          ? [{ label: "⬅ Back", back: true, onClick: () => selectMenu(MENU[menuNode].back!) }]
          : []),
      ]
    : [];

  const statusLabel = online === null ? "Connecting…" : online ? "Online" : "Offline";

  return (
    <>
      <button
        type="button"
        aria-label={open ? `Close live chat with ${assistantName}` : "Open live chat"}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openWidget())}
        className="fixed bottom-6 right-6 z-50 grid size-14 place-items-center rounded-full border border-accent/50 bg-bg text-accent shadow-[0_12px_32px_rgba(0,0,0,0.35)] transition-transform hover:-translate-y-0.5 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {open ? (
          <X className="size-6" />
        ) : (
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className="size-7" aria-hidden="true">
            <circle cx="24" cy="24" r="18" />
            <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
            <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
          </svg>
        )}
        {!open && !badgeSeen && (
          <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full border-2 border-bg bg-red-500 text-[0.65rem] font-bold text-white">
            1<span className="sr-only"> unread message</span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={`Live chat with ${assistantName}`}
          className="fixed bottom-24 right-6 z-50 flex max-h-[min(34rem,calc(100vh-7rem))] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-[calc(var(--radius)*1.3)] border border-hairline bg-bg shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
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
            <button type="button" onClick={openMainMenu} title="Menu" aria-label="Show menu" className="shrink-0 text-muted transition-colors hover:text-text">
              <MenuIcon className="size-4" />
            </button>
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

          {menuNode && !showLeaveForm && <QuickReplyMenu buttons={currentMenuButtons} />}

          {showLeaveForm ? (
            <LeaveMessageForm
              prefillMessage={leaveFormPrefill}
              showBack={leaveFormHasBack && !!online}
              onBack={backToMenuFromForm}
              onSubmit={submitLeaveForm}
            />
          ) : (
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
                    "grid size-9 shrink-0 place-items-center rounded-full border border-hairline text-text-2 transition-colors hover:border-accent/40 hover:text-text",
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
                className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-colors hover:bg-accent-strong"
              >
                <Send className="size-4" />
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}
