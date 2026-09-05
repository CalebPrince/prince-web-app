"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, Radio, Cpu, ShieldCheck, Activity } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { api, type BuilderOsAgent } from "@/lib/api";

// Builder OS - the topology grid renders the real, currently-configured
// agent roster from /api/v1/builder-os/team (same registry the admin
// command centre uses), not invented names - grouped into the three zones
// below by well-known agent key. The workflow simulator's three scenarios
// and their step copy are carried over verbatim from the live
// public/js/builder-os.js implementation; only the presentation is new.

const ZONE_DEFS: { code: string; icon: LucideIcon; title: string; keys: string[] | "rest" }[] = [
  { code: "01 / Conversations", icon: Radio, title: "The front door", keys: ["lisa"] },
  { code: "02 / Execution", icon: Cpu, title: "The specialists", keys: "rest" },
  { code: "03 / Control", icon: ShieldCheck, title: "The command centre", keys: ["chief"] },
];

const TRAIL = [
  {
    no: "01",
    title: "A conversation starts",
    body: "Lisa answers by voice, web chat, or WhatsApp and captures the request.",
  },
  {
    no: "02",
    title: "Context moves",
    body: "Research, contact details, intent, and next action become structured data.",
  },
  {
    no: "03",
    title: "The right specialist acts",
    body: "A configured agent handles research, follow-up, proposals, or document work.",
  },
  {
    no: "04",
    title: "The owner stays in control",
    body: "Chief watches the private command centre and flags decisions that need Prince Caleb.",
  },
];

interface LogLine {
  key: string;
  action: string;
}

const SCENARIOS: { id: string; label: string; request: string; log: LogLine[] }[] = [
  {
    id: "clinic",
    label: "After-hours clinic call",
    request: "“I need to book an appointment, but the clinic is closed.”",
    log: [
      { key: "lisa", action: "Incoming call answered, identified as an after-hours booking" },
      { key: "lisa", action: "Appointment details captured, name, contact, preferred date, reason" },
      { key: "system", action: "Availability checked, open calendar times returned, no private data exposed" },
      { key: "lisa", action: "Confirmation sent with the agreed booking details" },
      { key: "chief", action: "Owner checkpoint recorded, no escalation needed" },
    ],
  },
  {
    id: "enquiry",
    label: "New business enquiry",
    request: "“We need an AI assistant for customer calls and follow-up.”",
    log: [
      { key: "lisa", action: "Enquiry qualified, business need, channels, and outcome captured" },
      { key: "dossier", action: "Research context prepared from public business information" },
      { key: "proposal", action: "System scope assembled, workflow, delivery stages, milestones" },
      { key: "nurturer", action: "Follow-up sequence scheduled and reply path tracked" },
      { key: "chief", action: "Decision point flagged for Prince Caleb to review" },
    ],
  },
  {
    id: "invoice",
    label: "Invoice needs review",
    request: "“This invoice looks wrong. Can someone review it before I send it?”",
    log: [
      { key: "ada", action: "Document inspected, missing and inconsistent fields identified" },
      { key: "ada", action: "Corrections proposed as a controlled list of changes" },
      { key: "system", action: "Human approval required, nothing sent or changed without confirmation" },
      { key: "chief", action: "Review checkpoint surfaced in the private command centre" },
    ],
  },
];

function agentHref(a: BuilderOsAgent): string {
  if (a.key === "lisa") return "/lisa-ai-assistant";
  if (a.key === "sage") return "/marketing-brain";
  if (a.url) return a.url;
  return `/agent?agent=${encodeURIComponent(a.key)}`;
}

function isLiveStatus(status: string): boolean {
  return ["active", "available", "online"].includes(status.toLowerCase());
}

export default function BuilderOS() {
  const [agents, setAgents] = useState<BuilderOsAgent[] | null>(null);
  const [failed, setFailed] = useState(false);

  const [active, setActive] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api
      .builderOsTeam()
      .then((data) => setAgents(data.agents || []))
      .catch(() => setFailed(true));
  }, []);

  const scenario = SCENARIOS[active];

  function selectScenario(i: number) {
    setActive(i);
    setRevealed(0);
    setRunning(false);
  }

  function run() {
    setRevealed(0);
    setRunning(true);
  }

  useEffect(() => {
    if (!running) return;
    if (revealed >= scenario.log.length) return;
    const isLastStep = revealed === scenario.log.length - 1;
    const t = setTimeout(() => {
      setRevealed((r) => r + 1);
      if (isLastStep) setRunning(false);
    }, 650);
    return () => clearTimeout(t);
  }, [running, revealed, scenario.log.length]);

  function agentName(key: string): string {
    if (key === "system") return "System";
    return agents?.find((a) => a.key === key)?.name ?? key[0].toUpperCase() + key.slice(1);
  }

  const zones = ZONE_DEFS.map((z) => ({
    ...z,
    agents:
      agents === null
        ? []
        : z.keys === "rest"
          ? agents.filter((a) => !ZONE_DEFS.some((zd) => zd.keys !== "rest" && zd.keys.includes(a.key)))
          : agents.filter((a) => z.keys.includes(a.key)),
  }));

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(98,255,152,0.12),transparent_55%)]" />
          <div
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
              backgroundSize: "54px 54px",
            }}
          />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-24">
          <Reveal>
            <SectionLabel>Builder OS</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              One operating system.
              <br />
              <span className="text-accent">Specialists at every handoff.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Builder OS connects customer conversations, research, follow-up, documents, proposals,
              websites, and private reporting into one working environment.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-10 flex flex-col gap-4 sm:flex-row">
            <a href="#topology" className={cn(buttonVariants({ size: "lg" }), "group")}>
              Inspect the network
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <Link href="/work" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
              View published work
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── TOPOLOGY ────────────────────────────────────────── */}
      <section id="topology" className="scroll-mt-24 border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel index="01">Live topology</SectionLabel>
              <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                The people are AI. The handoffs are real.
              </h2>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm text-accent">
              <Activity className="size-4" />
              <span className="label">
                {agents ? `${agents.length} configured specialists connected` : failed ? "Registry reconnecting" : "Reading live registry…"}
              </span>
            </span>
          </Reveal>

          {failed && (
            <Reveal className="mt-8 rounded-[var(--radius)] border border-hairline bg-bg/60 p-6 text-text-2 glass">
              The public registry is reconnecting. The customer-service channels remain available.
            </Reveal>
          )}

          {!failed && (
            <div className="mt-16 grid gap-6 lg:grid-cols-3">
              {zones.map(({ code, icon: Icon, title, agents: zoneAgents }, i) => (
                <Reveal
                  key={code}
                  delay={i * 90}
                  className="rounded-[var(--radius)] border border-hairline bg-bg/60 p-7 glass"
                >
                  <div className="flex items-center justify-between">
                    <span className="label text-accent">{code}</span>
                    <Icon className="size-5 text-muted" aria-hidden="true" />
                  </div>
                  <p className="mt-4 text-sm text-muted">{title}</p>
                  <div className="mt-5 space-y-3">
                    {agents === null &&
                      Array.from({ length: i === 1 ? 3 : 1 }).map((_, j) => (
                        <div
                          key={j}
                          className="h-[68px] animate-pulse rounded-[var(--radius)] border border-hairline bg-bg-2/60 glass"
                        />
                      ))}
                    {zoneAgents.map((a) => (
                      <Link
                        key={a.key}
                        href={agentHref(a)}
                        className="flex items-center gap-4 rounded-[var(--radius)] border border-hairline bg-bg-2/60 p-4 transition-colors hover:border-accent/40 glass"
                      >
                        <span className="tilt-3d tilt-3d-tile grid size-11 shrink-0 place-items-center rounded-full border border-accent/40 bg-accent/10 text-sm font-semibold text-accent">
                          {a.key.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text">{a.name}</p>
                          <p className="truncate text-sm text-text-2">{a.role}</p>
                        </div>
                        <span
                          className={cn(
                            "label rounded-full border px-2.5 py-1 text-[0.58rem]",
                            isLiveStatus(a.status) ? "border-accent/40 text-accent" : "border-hairline text-muted",
                          )}
                        >
                          {a.status}
                        </span>
                      </Link>
                    ))}
                  </div>
                </Reveal>
              ))}
            </div>
          )}
          <Reveal className="mt-8">
            <p className="max-w-3xl text-sm text-muted">
              Names and availability are loaded from the same team configuration used by the command
              centre.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── OPERATIONAL TRAIL ───────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="02">Example execution</SectionLabel>
          <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            One enquiry. A complete operational trail.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {TRAIL.map((s, i) => (
            <Reveal key={s.no} delay={i * 80} className="relative">
              <span className="label text-accent">{"// "}{s.no}</span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-text-2">{s.body}</p>
              {i < TRAIL.length - 1 && (
                <ArrowRight className="absolute -right-4 top-0 hidden size-4 text-hairline-strong lg:block" />
              )}
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── SIMULATION ──────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="03">Interactive workflow playback</SectionLabel>
            <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Run a request through Builder OS.
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">Choose a scenario, then run the workflow.</p>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-12">
            {/* Scenario picker */}
            <Reveal className="lg:col-span-4">
              <div className="flex flex-col gap-3">
                {SCENARIOS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => selectScenario(i)}
                    className={cn(
                      "rounded-[var(--radius)] border p-5 text-left transition-colors",
                      active === i
                        ? "border-accent/50 bg-accent/[0.06]"
                        : "border-hairline bg-bg/60 hover:border-hairline-strong",
                    )}
                  >
                    <span className={cn("label", active === i ? "text-accent" : "text-muted")}>
                      Scenario 0{i + 1}
                    </span>
                    <p className="mt-2 font-semibold text-text">{s.label}</p>
                  </button>
                ))}
                <button onClick={run} className={cn(buttonVariants({ size: "lg" }), "group mt-2 w-full")}>
                  <Play className="size-4" />
                  Run simulation
                </button>
              </div>
            </Reveal>

            {/* Execution log */}
            <Reveal delay={100} className="lg:col-span-8">
              <div className="overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg">
                <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
                  <span className="label text-muted">builder-os / execution-log</span>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", running ? "animate-pulse bg-accent" : "bg-muted")} />
                    <span className="label text-muted">{running ? "Running" : "Idle"}</span>
                  </span>
                </div>
                <div className="p-5 font-mono text-sm">
                  <p className="text-text-2">
                    <span className="text-accent">▸ incoming request</span> &nbsp;{scenario.request}
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {scenario.log.slice(0, revealed).map((line, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="shrink-0 text-muted">{String(i + 1).padStart(2, "0")}</span>
                        <span className="shrink-0 font-semibold text-accent">{agentName(line.key)}</span>
                        <span className="text-text-2">{line.action}</span>
                      </div>
                    ))}
                    {running && <span className="inline-block h-4 w-2 animate-pulse bg-accent align-middle" />}
                    {!running && revealed === 0 && (
                      <p className="text-muted">Press “Run simulation” to trace the handoffs.</p>
                    )}
                    {!running && revealed === scenario.log.length && (
                      <p className="pt-2 text-accent">✓ workflow complete · trail recorded</p>
                    )}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <div className="flex justify-center">
              <SectionLabel index="04">Your workflow next</SectionLabel>
            </div>
            <h2 className="mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              What should your business
              <br />
              <span className="text-accent">stop doing manually?</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-text-2">
              Start with one customer journey or operational bottleneck. We build the smallest system
              that proves the result.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Map my workflow</IntakeCta>
              <Link href="/" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Return home
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
