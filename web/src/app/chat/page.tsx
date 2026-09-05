"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { Send, Check, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants, Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const TOTAL_STEPS = 5;
const STEP_NAMES = ["Business & goal", "Creative direction", "Pages", "Features", "Your content"];

const STORAGE_KEY = "arch-chat-session-v1";

type Turn = { role: "user" | "assistant"; text: string };

type SiteData = {
  slug: string;
  revision_token: string;
  preview_url: string;
  download_url?: string;
  revisions_remaining: number;
  has_cms: boolean;
  admin_password?: string;
  admin_url?: string;
};

export default function Chat() {
  const [assistantName, setAssistantName] = useState("Arch");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);

  // Build state
  const [building, setBuilding] = useState(false);
  const [buildingMessage, setBuildingMessage] = useState("Laying the foundations…");
  const [currentSite, setCurrentSite] = useState<SiteData | null>(null);
  const [reviewInput, setReviewInput] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    let name = "Arch";
    api
      .content()
      .then((content) => {
        if (content.arch_assistant_name) name = content.arch_assistant_name;
      })
      .catch(() => {})
      .finally(() => {
        setAssistantName(name);
        try {
          const raw = sessionStorage.getItem(STORAGE_KEY);
          const saved = raw ? JSON.parse(raw) : null;
          if (saved?.transcript?.length) {
            setTranscript(saved.transcript);
            setBrief(saved.brief || {});
            setReady(!!saved.ready);
            setCurrentStep(saved.step || 1);
            if (saved.site && saved.site.slug && saved.site.revision_token) {
              setCurrentSite(saved.site);
            }
            hydrated.current = true;
            return;
          }
        } catch {}
        
        const greeting = `Hi, I'm ${name}, your AI website builder. I'll ask a few quick questions and then build you a complete, ready-to-launch website. Let's start: what's the name of your business, and what type is it (restaurant, shop, church, portfolio, and so on)?`;
        setTranscript([{ role: "assistant", text: greeting }]);
        hydrated.current = true;
      });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ transcript, brief, ready, step: currentStep, site: currentSite })
      );
    } catch {}
  }, [transcript, brief, ready, currentStep, currentSite]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [transcript, sending]);

  const suggestions = useMemo(() => {
    if (currentStep === 2) return ["Calm & trustworthy", "Refined & premium", "Warm & welcoming", "Bold & energetic"];
    if (currentStep === 3) return ["Home, About, Services, Contact", "Add a Gallery", "Add a Blog", "Add a Shop"];
    if (currentStep === 4) return ["Contact form + WhatsApp", "Add Google Maps", "Photo gallery", "No extra features"];
    return [];
  }, [currentStep]);

  function safeReply(reply: string, step: number) {
    const text = reply.trim();
    if (text && !/(^|\n)\s*(tool\s*code|toolcode|thought|analysis)\s*:?\s*(\n|$)|<\/?think>|defaultapi\.|update_?brief\s*\(/i.test(text)) {
      return text;
    }
    const fallbacks: Record<number, string> = {
      1: "What's your business name and type, who is it for, and what is the main action visitors should take?",
      2: "What should the site feel like? Share a personality, preferred colors, style, light or dark theme, and any optional visual reference.",
      3: "Which pages do you need? Common ones are Home, About, Services, Contact, Gallery, Blog, and Shop.",
      4: "Any key features you'd like, such as a contact form, WhatsApp, maps, payments, a gallery, or booking?",
      5: "Last step, tell me your tagline, business description, services, and contact details.",
    };
    return fallbacks[step] || fallbacks[1];
  }

  async function sendMessage(text: string) {
    if (sending || building) return;
    const nextTranscript: Turn[] = [...transcript, { role: "user", text }];
    setTranscript(nextTranscript);
    setError(null);
    setSending(true);
    setInput("");
    try {
      const res = await api.archChat({ message: text, transcript: nextTranscript, brief });
      setBrief(res.brief || brief);
      setReady(!!res.ready);
      setCurrentStep(Math.max(1, Math.min(TOTAL_STEPS, res.step || 1)));
      setTranscript((t) => [...t, { role: "assistant", text: safeReply(res.reply, res.step || 1) }]);
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
    sendMessage(text);
  }

  async function startBuild() {
    if (sending || building) return;
    setError(null);
    setBuilding(true);
    let ticker = 0;
    const BUILD_MESSAGES = [
      "Laying the foundations…",
      "Designing your layout…",
      "Writing your content…",
      "Styling it to match your brand…",
      "Adding the finishing touches…",
    ];
    setBuildingMessage(BUILD_MESSAGES[0]);
    const timer = setInterval(() => {
      ticker = (ticker + 1) % BUILD_MESSAGES.length;
      setBuildingMessage(BUILD_MESSAGES[ticker]);
    }, 2500);

    try {
      const res = await api.archGenerate({ brief });
      setCurrentSite(res);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Build failed. Please try again.");
    } finally {
      clearInterval(timer);
      setBuilding(false);
    }
  }

  async function submitRevision(e: React.FormEvent) {
    e.preventDefault();
    const feedback = reviewInput.trim();
    if (!feedback || !currentSite || revising) return;

    setRevising(true);
    setReviewStatus("Arch is applying your changes…");
    setError(null);
    try {
      const res = await api.archRevise({
        slug: currentSite.slug,
        revision_token: currentSite.revision_token,
        feedback,
      });
      setBrief(res.brief || brief);
      setCurrentSite((s) => s ? {
        ...s,
        preview_url: res.preview_url + (res.preview_url.includes("?") ? "&" : "?") + "revision=" + Date.now(),
        download_url: res.download_url,
        revisions_remaining: res.revisions_remaining
      } : null);
      setReviewInput("");
      setReviewStatus(res.message || "Changes applied. Review the refreshed preview.");
    } catch (err) {
      setReviewStatus("");
      setError(err instanceof Error ? err.message : "The changes could not be applied. Please try again.");
    } finally {
      setRevising(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-4xl px-6 pt-28 pb-12 md:px-10 md:pt-36 md:pb-16 text-center">
          <Reveal>
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-accent/15 text-2xl font-bold text-accent">
              {currentSite ? "✓" : assistantName.charAt(0)}
            </div>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="text-4xl font-extrabold tracking-[-0.03em] md:text-5xl">
              {currentSite ? "Your website direction is ready" : "Create your website direction with Arch"}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-text-2">
              {currentSite
                ? "Review the live, industry-shaped build below, request up to two focused changes, then contact Prince Caleb for final launch preparation."
                : "Share your audience, goal and creative direction. Arch will turn them into a responsive, deployable website concept shaped for your industry."}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CONTENT ────────────────────────────────────────────── */}
      <section className="flex-1 mx-auto w-full max-w-4xl px-6 pb-24 md:px-10 md:pb-32">
        {building ? (
          <div className="py-24 text-center">
            <span className="mx-auto mb-6 flex size-12 animate-spin rounded-full border-4 border-accent border-r-transparent" />
            <h2 className="text-xl font-bold">Building your website…</h2>
            <p className="mt-2 text-text-2">{buildingMessage}</p>
          </div>
        ) : currentSite ? (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg">
              <iframe src={currentSite.preview_url} className="w-full h-[65vh] border-0" title="Your generated website preview" loading="lazy" />
            </div>

            <form onSubmit={submitRevision} className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 glass">
              <label htmlFor="reviewInput" className="mb-2 block font-semibold">Want anything changed?</label>
              <p className="mb-4 text-sm text-text-2">Describe a focused change to this prototype. Two revision rounds are included; larger changes need a project review.</p>
              <textarea
                id="reviewInput"
                value={reviewInput}
                onChange={(e) => setReviewInput(e.target.value)}
                maxLength={2000}
                placeholder="For example: use a warmer red, shorten the headline, and add our catering service."
                className="w-full min-h-[100px] resize-y rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 py-3 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
              />
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <Button type="submit" disabled={revising || currentSite.revisions_remaining === 0}>
                  {revising ? "Applying…" : "Apply changes"}
                </Button>
                <span className="text-sm text-text-2">{reviewStatus}</span>
                <span className="ml-auto text-sm text-muted">
                  {Math.max(0, currentSite.revisions_remaining)} revision{currentSite.revisions_remaining === 1 ? "" : "s"} remaining
                </span>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Button variant="outline" onClick={() => setCurrentSite(null)}>Back to chat</Button>
              <Link href={currentSite.preview_url} target="_blank" rel="noopener" className={buttonVariants({ variant: "default" })}>
                Open full preview ↗
              </Link>
              <Link href={currentSite.download_url || "/contact"} className={buttonVariants({ variant: "outline" })}>
                {currentSite.download_url ? "Download site (.zip)" : "Discuss the final build"}
              </Link>
              <Button variant="outline" onClick={() => {
                sessionStorage.removeItem(STORAGE_KEY);
                window.location.reload();
              }}>Build another</Button>
            </div>

            {currentSite.has_cms && currentSite.admin_password && (
              <div className="rounded-[var(--radius)] border border-accent/40 bg-accent/10 p-6 mt-8">
                <strong className="block mb-2">Your admin panel is set up.</strong>
                <p className="text-sm text-text-2 mb-1">
                  Edit your site's text anytime, sign in at <a href={currentSite.admin_url || currentSite.preview_url + "admin/"} target="_blank" rel="noopener" className="text-accent underline">your admin page</a>.
                </p>
                <p className="text-sm text-text-2">
                  Password: <code className="bg-black/10 px-1.5 py-0.5 rounded">{currentSite.admin_password}</code> (save this now, it's shown only once).
                </p>
              </div>
            )}
            
            {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
          </div>
        ) : (
          <div className="flex flex-col mx-auto max-w-3xl">
            <div className="mb-6 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Step {currentStep} of {TOTAL_STEPS} <span className="ml-2 text-text-2 font-normal">{STEP_NAMES[currentStep - 1]}</span>
              </span>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-hairline-strong">
                <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }} />
              </div>
            </div>

            <div className="flex h-[36rem] flex-col overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2/50 glass">
              <div ref={logRef} className="flex-1 space-y-4 overflow-y-auto p-6 scroll-smooth">
                {transcript.map((turn, i) => (
                  <p
                    key={i}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words border",
                      turn.role === "user"
                        ? "ml-auto rounded-br-sm border-hairline bg-bg text-text-2"
                        : "mr-auto rounded-bl-sm border-accent/30 bg-accent/10 text-text"
                    )}
                  >
                    {turn.text}
                  </p>
                ))}
                {sending && (
                  <p className="flex max-w-[85%] mr-auto gap-1.5 rounded-2xl rounded-bl-sm border border-accent/30 bg-accent/10 px-5 py-4">
                    <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                    <span className="size-1.5 animate-bounce rounded-full bg-accent" />
                  </p>
                )}
              </div>

              {error && <p className="border-t border-hairline px-6 py-3 text-sm text-red-400">{error}</p>}
              
              <div className="border-t border-hairline bg-bg-2/30 p-4">
                <form onSubmit={onSubmit} className="flex items-end gap-3">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        onSubmit(e as any);
                      }
                    }}
                    maxLength={2000}
                    placeholder="Type your answer…"
                    className="flex-1 max-h-40 min-h-[52px] resize-none overflow-y-auto rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 py-3.5 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
                  />
                  <Button type="submit" disabled={sending} className="shrink-0 size-[52px] p-0" aria-label="Send">
                    <Send className="size-5" />
                  </Button>
                </form>

                {suggestions.length > 0 && !sending && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setInput(s);
                        }}
                        className="rounded-full border border-hairline bg-transparent px-4 py-1.5 text-sm text-text transition-colors hover:border-accent hover:text-accent"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {ready && (
                  <Button onClick={startBuild} className="w-full mt-4" size="lg">
                    Build my website ✦
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
