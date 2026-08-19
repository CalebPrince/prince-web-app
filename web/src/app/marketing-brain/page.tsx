"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Send } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// Sage - free public marketing-frameworks chat. Ported from
// public/marketing-brain.html + public/js/marketing-brain-chat.js: same
// sessionStorage-persisted transcript, same real /api/v1/agents/sage/chat
// call, same starter prompts and framework strip.

const FRAMEWORKS = [
  { name: "Hormozi", focus: "Offer construction" },
  { name: "Brunson", focus: "Funnels & value ladders" },
  { name: "Ogilvy", focus: "Headlines & copy" },
  { name: "Cialdini", focus: "Ethical influence" },
  { name: "Godin", focus: "Positioning & permission" },
];

const STARTERS = [
  {
    label: "My offer isn't converting",
    prompt:
      "I have an offer but it's not converting, how do I know if the problem is the offer, the price, or the audience?",
  },
  {
    label: "Content vs. outbound, which first?",
    prompt: "Should I focus on content or cold outbound to get my first customers?",
  },
  {
    label: "Help me with a headline",
    prompt:
      "How do I write a headline that actually gets someone to keep reading, without sounding clickbaity?",
  },
  {
    label: "Opens but no replies",
    prompt: "My email sequence gets opens but no replies, what's likely going wrong?",
  },
];

const STORAGE_KEY = "sage_chat_state";

type Turn = { role: "user" | "agent"; text: string };

export default function MarketingBrain() {
  const [assistantName, setAssistantName] = useState("Sage");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    let name = "Sage";
    api
      .content()
      .then((content) => {
        if (content.sage_assistant_name) name = content.sage_assistant_name;
      })
      .catch(() => {})
      .finally(() => {
        setAssistantName(name);
        // sessionStorage (not localStorage) is deliberate: it survives a
        // reload but clears when the tab actually closes, matching a chat
        // that "remembers" mid-visit without persisting forever.
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY);
          const stored = raw ? JSON.parse(raw) : null;
          if (stored?.transcript?.length) {
            setToken(stored.token || null);
            setTranscript(stored.transcript);
            hydrated.current = true;
            return;
          }
        } catch {
          // Storage unavailable (private browsing) - start fresh below.
        }
        setTranscript([
          {
            role: "agent",
            text: `I'm ${name}. Bring me a real marketing problem, an offer that isn't converting, a channel you're unsure about, a headline, a funnel that's stuck, and I'll work it through with you.`,
          },
        ]);
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, transcript }));
    } catch {
      // Storage full or unavailable - conversation just won't survive a reload.
    }
  }, [token, transcript]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [transcript, sending]);

  async function sendMessage(text: string) {
    const nextTranscript: Turn[] = [...transcript, { role: "user", text }];
    setTranscript(nextTranscript);
    setError(null);
    setSending(true);
    try {
      const res = await api.sageChat({ message: text, transcript: nextTranscript, token });
      setTranscript((t) => [...t, { role: "agent", text: res.reply }]);
      if (res.token) setToken(res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    sendMessage(text);
  }

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-14 md:px-10 md:pt-48 md:pb-16">
          <Reveal>
            <SectionLabel>Free marketing brain</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-3xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Meet <span className="text-accent">{assistantName}</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Bring a real marketing problem, an offer that isn&rsquo;t converting, a channel you
              can&rsquo;t decide between, a funnel that&rsquo;s stuck, a headline that isn&rsquo;t
              landing, and work it through the combined lens of five well-known frameworks. No
              signup, no email required.
            </p>
          </Reveal>
          <Reveal delay={220} className="mt-8 flex flex-wrap gap-2.5">
            {FRAMEWORKS.map((f) => (
              <span
                key={f.name}
                className="inline-flex flex-col rounded-[var(--radius)] border border-hairline bg-bg-2/60 px-4 py-2.5"
              >
                <strong className="text-sm text-text">{f.name}</strong>
                <span className="text-xs text-muted">{f.focus}</span>
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CHAT ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32" id="sage-chat">
        <div className="grid gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-8">
            <div className="flex h-[34rem] flex-col overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2/50">
              <header className="flex items-center gap-3 border-b border-hairline px-6 py-4">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" />
                <strong className="text-text">{assistantName}</strong>
                <span className="text-sm text-text-2">Marketing frameworks, combined</span>
              </header>
              <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-6" aria-live="polite">
                {transcript.map((turn, i) => (
                  <p
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed",
                      turn.role === "user"
                        ? "ml-auto rounded-br-sm border-hairline bg-bg text-text-2"
                        : "rounded-bl-sm border-accent/30 bg-accent/10 text-text",
                    )}
                  >
                    {turn.text}
                  </p>
                ))}
                {sending && (
                  <p className="flex max-w-[85%] gap-1 rounded-2xl rounded-bl-sm border border-accent/30 bg-accent/10 px-4 py-3">
                    <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-accent" />
                  </p>
                )}
              </div>
              {error && <p className="border-t border-hairline px-6 py-3 text-sm text-red-400">{error}</p>}
              <form onSubmit={onSubmit} className="flex gap-3 border-t border-hairline p-4">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  maxLength={1000}
                  autoComplete="off"
                  required
                  placeholder="Describe a real problem you're working on…"
                  className="h-12 flex-1 rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className={cn(buttonVariants({ size: "default" }), "shrink-0 disabled:opacity-40")}
                >
                  <Send className="size-4" />
                  Send
                </button>
              </form>
            </div>
          </Reveal>

          <Reveal delay={100} className="lg:col-span-4">
            <p className="label mb-4 text-muted">Try one of these</p>
            <div className="flex flex-col gap-2.5">
              {STARTERS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => sendMessage(s.prompt)}
                  disabled={sending}
                  className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 px-4 py-3 text-left text-sm text-text-2 transition-colors hover:border-accent/40 hover:text-text disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-6 text-sm text-muted">
              {assistantName} brainstorms marketing strategy, it doesn&rsquo;t book calls or access
              your accounts. For real automations (follow-ups, lead qualification, booking),{" "}
              <Link href="/services" className="text-text-2 underline underline-offset-4 hover:text-accent">
                see what Prince Caleb builds
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── BEYOND BRAINSTORMING ─────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-24">
          <Reveal className="flex flex-col items-start justify-between gap-8 rounded-[var(--radius)] border border-hairline bg-bg/60 p-8 md:flex-row md:items-center md:p-12">
            <div>
              <span className="label text-accent">Beyond brainstorming</span>
              <h2 className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold tracking-[-0.02em]">
                Want the follow-up automated too?
              </h2>
              <p className="mt-3 max-w-xl text-text-2">
                {assistantName} will help you think through the message. If the actual bottleneck is
                that no one follows up, qualifies, or replies on time, that&rsquo;s a workflow Prince
                Caleb builds for real.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Talk through your workflow
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/lisa-ai-assistant" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                See Lisa in action
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
