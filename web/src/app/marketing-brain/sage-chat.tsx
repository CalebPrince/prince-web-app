"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Ported from public/js/marketing-brain-chat.js. sessionStorage (not
// localStorage) is deliberate: it survives a reload but clears when the
// tab/browser actually closes.
const STORAGE_KEY = "sage_chat_state";
const STARTERS = [
  { label: "My offer isn't converting", text: "I have an offer but it's not converting, how do I know if the problem is the offer, the price, or the audience?" },
  { label: "Content vs. outbound, which first?", text: "Should I focus on content or cold outbound to get my first customers?" },
  { label: "Help me with a headline", text: "How do I write a headline that actually gets someone to keep reading, without sounding clickbaity?" },
  { label: "Opens but no replies", text: "My email sequence gets opens but no replies, what's likely going wrong?" },
];

type Turn = { role: "user" | "agent"; text: string };

export function SageChat() {
  const [assistantName, setAssistantName] = React.useState("Sage");
  const [transcript, setTranscript] = React.useState<Turn[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [input, setInput] = React.useState("");
  const tokenRef = React.useRef<string | null>(null);
  const logRef = React.useRef<HTMLDivElement>(null);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      let name = "Sage";
      try {
        const content = await api.content();
        if (content.sage_assistant_name) name = content.sage_assistant_name;
      } catch {
        // Fine to boot with the default name if Site Content can't be reached.
      }
      setAssistantName(name);

      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        if (stored && Array.isArray(stored.transcript) && stored.transcript.length) {
          tokenRef.current = stored.token || null;
          setTranscript(stored.transcript);
          return;
        }
      } catch {
        // Storage unavailable — start fresh.
      }
      setTranscript([{ role: "agent", text: `I'm ${name}. Bring me a real marketing problem, an offer that isn't converting, a channel you're unsure about, a headline, a funnel that's stuck, and I'll work it through with you.` }]);
    })();
  }, []);

  React.useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [transcript, pending]);

  function saveState(next: Turn[]) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token: tokenRef.current, transcript: next }));
    } catch {
      // Storage full or unavailable (private browsing) — conversation just won't survive a reload.
    }
  }

  async function sendMessage(text: string) {
    const withUser = [...transcript, { role: "user" as const, text }];
    setTranscript(withUser);
    saveState(withUser);
    setError("");
    setPending(true);
    try {
      const res = await api.sageChat({ message: text, transcript: withUser, token: tokenRef.current });
      const withReply = [...withUser, { role: "agent" as const, text: res.reply }];
      if (res.token) tokenRef.current = res.token;
      setTranscript(withReply);
      saveState(withReply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
      <div ref={cardRef} className="sage-chat-card">
        <header>
          <span className="status-dot is-live" />
          <strong>{assistantName}</strong>
          <span>Marketing frameworks, combined</span>
        </header>
        <div ref={logRef} className="sage-chat-log">
          {transcript.map((turn, i) => (
            <div key={i} className={`sage-bubble${turn.role === "user" ? " user" : ""}`}>
              {turn.text}
            </div>
          ))}
          {pending && (
            <div className="sage-bubble" aria-label={`${assistantName} is typing`}>
              <span className="ai-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>
        {error && <div className="mx-5 mb-2 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">{error}</div>}
        <form
          className="sage-chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            const text = input.trim();
            if (!text || pending) return;
            setInput("");
            sendMessage(text);
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe a real problem you're working on…"
            maxLength={1000}
            autoComplete="off"
            required
            disabled={pending}
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-4 py-2.5 text-sm text-ink outline-none focus:border-editorial-accent disabled:opacity-60"
          />
          <Button type="submit" variant="brand" size="pill-sm" disabled={pending}>
            Send
          </Button>
        </form>
      </div>

      <div className="grid content-start gap-2.5">
        <p className="mb-1 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Try one of these</p>
        {STARTERS.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={pending}
            onClick={() => {
              sendMessage(s.text);
              cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="rounded-xl border border-line bg-card p-4 text-left text-[0.82rem] font-semibold text-heading transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow disabled:opacity-60"
          >
            {s.label}
          </button>
        ))}
        <p className="mt-2 text-[0.72rem] leading-[1.6] text-ink-soft">
          Sage brainstorms marketing strategy, it doesn&apos;t book calls or access your accounts. For real
          automations (follow-ups, lead qualification, booking),{" "}
          <a href="/services" className="text-editorial-accent hover:text-editorial-accent-strong">
            see what Prince Caleb builds
          </a>
          .
        </p>
      </div>
    </div>
  );
}
