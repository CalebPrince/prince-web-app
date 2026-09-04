"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type BuilderOsAgent } from "@/lib/api";

// Ported from public/js/agent-profile.js. The per-agent "profile" copy
// (mandate/surfaces/path) has no API source - it's hand-authored per key,
// exactly like the original - with a generic fallback for any agent key
// not in this dictionary.
type Profile = {
  mandate: string;
  surfaces: [string, string][];
  path: [string, string][];
};

const PROFILES: Record<string, Profile> = {
  lisa: {
    mandate:
      "Keep customer conversations moving across voice, WhatsApp, and the website, then turn confirmed intent into bookings, follow-ups, or a human handoff.",
    surfaces: [
      ["Voice line", "Answers inbound calls and places individually approved outbound calls."],
      ["WhatsApp", "Handles enquiries and continues qualified conversations."],
      ["Bookings", "Captures contact details, checks availability, and confirms agreed times."],
      ["Handoffs", "Alerts the owner when judgment or direct attention is required."],
    ],
    path: [
      ["Signal", "A customer calls, messages, or opens live chat."],
      ["Understand", "Lisa identifies the request and captures the missing details."],
      ["Act", "She answers, books, follows up, or routes the next safe action."],
      ["Handoff", "The customer and owner receive the relevant confirmation or alert."],
    ],
  },
  beacon: {
    mandate:
      "Continuously identify public opportunities that match the studio's services and turn scattered market signals into a lead queue worth reviewing.",
    surfaces: [
      ["Discovery", "Searches configured niches and locations for relevant businesses."],
      ["Qualification", "Filters weak or irrelevant results before they enter the pipeline."],
      ["Lead sourcing", "Captures public contact routes and business context."],
      ["Monitoring", "Keeps the discovery target and run status visible to operations."],
    ],
    path: [
      ["Search", "Configured niche and location queries run."],
      ["Inspect", "Public results are checked for relevance and opportunity."],
      ["Structure", "Qualified businesses become actionable lead records."],
      ["Route", "Research, outreach, or owner review receives the next task."],
    ],
  },
  dossier: {
    mandate:
      "Prepare grounded business intelligence before outreach so the first conversation reflects the prospect's actual context.",
    surfaces: [
      ["Research", "Collects relevant public company information."],
      ["Intelligence", "Separates useful signals from generic background."],
      ["Lead briefs", "Creates a concise account dossier for outreach."],
      ["Context", "Supplies other agents with a better starting point."],
    ],
    path: [
      ["Request", "A lead is selected for deeper research."],
      ["Gather", "Public business and market signals are collected."],
      ["Synthesize", "The relevant opportunity and constraints are summarized."],
      ["Deliver", "The brief becomes context for a pitch, call, or proposal."],
    ],
  },
  nurturer: {
    mandate:
      "Own the follow-up trail after outreach so replies, timing, and next actions do not disappear between conversations.",
    surfaces: [
      ["Sequences", "Runs configured email follow-up steps."],
      ["Reply tracking", "Checks the reply mailbox for lead responses."],
      ["Continuation", "Prepares the next relevant response when automation permits."],
      ["Escalation", "Stops or routes conversations that need human review."],
    ],
    path: [
      ["Enroll", "A qualified contact enters an enabled sequence."],
      ["Wait", "The configured timing and stop conditions are observed."],
      ["Interpret", "Replies are classified before another message is considered."],
      ["Continue", "The sequence advances, pauses, stops, or alerts the owner."],
    ],
  },
  proposal: {
    mandate:
      "Translate a qualified request into a structured commercial path with scope, delivery stages, and payment milestones.",
    surfaces: [
      ["Scope", "Organizes the requested outcome and boundaries."],
      ["Proposal", "Drafts a reviewable commercial document."],
      ["Milestones", "Structures delivery and payment checkpoints."],
      ["Approval", "Keeps final commercial judgment with the owner."],
    ],
    path: [
      ["Input", "A qualified request or booking supplies the context."],
      ["Structure", "Outcome, scope, assumptions, and stages are organized."],
      ["Draft", "A proposal is prepared for review."],
      ["Approve", "The owner edits, sends, or returns it for revision."],
    ],
  },
  arch: {
    mandate:
      "Turn approved business context into tailored website concepts and deployable digital experiences instead of generic templates.",
    surfaces: [
      ["Websites", "Builds pages around the client's real offer and audience."],
      ["CMS", "Creates maintainable content structures."],
      ["Mockups", "Produces personalized visual directions for review."],
      ["Deployment", "Prepares controlled releases and live system surfaces."],
    ],
    path: [
      ["Brief", "Business context and the desired outcome are assembled."],
      ["Compose", "Information architecture and visual direction are created."],
      ["Build", "Responsive interfaces and content systems are implemented."],
      ["Release", "The approved system is deployed and monitored."],
    ],
  },
  ada: {
    mandate:
      "Review business documents for missing, inconsistent, or risky details while keeping every consequential correction under human control.",
    surfaces: [
      ["Invoices", "Checks commercial fields and calculation consistency."],
      ["Statements", "Surfaces anomalies and unclear entries."],
      ["Document checks", "Creates a controlled review list."],
      ["Approval", "Never changes or sends sensitive records without confirmation."],
    ],
    path: [
      ["Receive", "A document is submitted for a bounded review."],
      ["Inspect", "Fields, totals, and internal consistency are checked."],
      ["Flag", "Unclear or conflicting items become review points."],
      ["Confirm", "A human approves any correction or downstream action."],
    ],
  },
  chief: {
    mandate:
      "Maintain private operational awareness across the agent team and command centre, then surface only the decisions that need the owner.",
    surfaces: [
      ["Reporting", "Summarizes real activity over the selected period."],
      ["Monitoring", "Watches operational signals and exceptions."],
      ["Owner alerts", "Sends private decision and handoff notifications."],
      ["Finance awareness", "Explains cost, revenue, and operating trends privately."],
    ],
    path: [
      ["Observe", "Operational records and agent activity are read."],
      ["Compare", "Results, exceptions, and changes are evaluated."],
      ["Explain", "Numbers and activity become a concise owner brief."],
      ["Alert", "Only meaningful decisions and risks are escalated."],
    ],
  },
  scout: {
    mandate:
      "Track emerging web, mobile, and AI tools and frameworks, and turn them into concrete, buildable project ideas grounded in real, live research rather than guesses.",
    surfaces: [
      ["Tech scouting", "Checks what is actually new via live web search."],
      ["Ideation", "Sketches concrete, buildable project concepts on new tooling."],
      ["Grounding", "Anchors ideas in the studio's real stack and past work."],
      ["Sparring", "Works through possibilities live with the owner."],
    ],
    path: [
      ["Prompt", "A question or a spark of curiosity starts the conversation."],
      ["Check", "A live web search verifies what is current before anything is claimed."],
      ["Connect", "The finding is matched against real services and past projects."],
      ["Propose", "A concrete, buildable idea comes back for the owner to weigh."],
    ],
  },
  reel: {
    mandate:
      "Plan a video before it gets built, concept, scene breakdown, narration script, pacing, and visual style, for videos produced with the studio's HyperFrames pipeline.",
    surfaces: [
      ["Video concepts", "Works through what a video should say and show."],
      ["Scene breakdowns", "Structures a concrete scene-by-scene plan with rough timings."],
      ["Narration scripts", "Drafts spoken lines that fit the visual pacing."],
      ["Visual style", "Anchors choices in the studio's real brand colors and fonts."],
    ],
    path: [
      ["Brief", "A video idea or need starts the conversation."],
      ["Structure", "The video is broken into scenes with a clear arc and pacing."],
      ["Script", "Narration lines are drafted to match the visual beats."],
      ["Hand off", "The confirmed plan goes to Claude Code to actually build and render."],
    ],
  },
};

function fallbackProfile(agent: BuilderOsAgent): Profile {
  return {
    mandate: agent.role,
    surfaces: (agent.capabilities || []).map((item) => [item, `Supports ${item.toLowerCase()} within Builder OS.`]),
    path: [
      ["Signal", "A configured workflow creates a task."],
      ["Process", "The agent handles its bounded responsibility."],
      ["Record", "The result becomes visible to the operating system."],
      ["Handoff", "The next agent or owner receives the required context."],
    ],
  };
}

export function AgentProfile() {
  const searchParams = useSearchParams();
  const key = searchParams.get("agent") || "lisa";
  const [agent, setAgent] = useState<BuilderOsAgent | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .builderOsTeam()
      .then((data) => {
        const found = (data.agents || []).find((item) => item.key === key);
        if (!found) throw new Error("Unknown agent");
        setAgent(found);
        document.title = `${found.name}, Builder OS agent`;
      })
      .catch(() => setFailed(true));
  }, [key]);

  if (failed) {
    return (
      <section className="mx-auto max-w-[1400px] px-6 pt-36 pb-24 text-center md:px-10 md:pt-48">
        <Reveal>
          <SectionLabel>Registry unavailable</SectionLabel>
          <h1 className="mx-auto mt-8 max-w-2xl text-[clamp(2rem,5vw,3.4rem)] font-bold tracking-[-0.03em]">
            That agent dossier could not be opened.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-text-2">
            Return to the system map and choose a configured specialist.
          </p>
          <Link href="/builder-os" className={cn(buttonVariants({ size: "lg" }), "mt-8")}>
            Return to Builder OS
          </Link>
        </Reveal>
      </section>
    );
  }

  if (!agent) {
    return (
      <section className="mx-auto max-w-[1400px] px-6 pt-36 pb-24 md:px-10 md:pt-48">
        <Reveal>
          <SectionLabel>Builder OS</SectionLabel>
          <h1 className="mt-8 text-[clamp(2rem,5vw,3.4rem)] font-bold tracking-[-0.03em]">
            Opening agent dossier…
          </h1>
        </Reveal>
      </section>
    );
  }

  const profile = PROFILES[agent.key] || fallbackProfile(agent);

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <p className="mb-4 font-mono text-sm text-muted">
              builder@princecaleb:~$ inspect agent/{agent.key}
            </p>
          </Reveal>
          <div className="flex flex-wrap items-start justify-between gap-8">
            <Reveal delay={80}>
              <span className="label text-accent">
                {agent.key} / configured specialist
              </span>
              <h1 className="page-hero-title mt-4">
                {agent.name}
              </h1>
              <p className="mt-4 max-w-xl text-lg text-text-2">{agent.role}</p>
            </Reveal>
            <Reveal delay={160} className="grid shrink-0 grid-cols-3 gap-4 sm:gap-6">
              <Stat label="Operating status" value={agent.status} live />
              <Stat label="System" value="Builder OS" />
              <Stat label="Access" value="Bounded / monitored" />
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── MANDATE ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-20">
        <Reveal>
          <SectionLabel index="01">Mandate</SectionLabel>
          <h2 className="mt-6 max-w-2xl text-[clamp(1.8rem,4.5vw,3rem)] font-bold tracking-[-0.03em]">
            What {agent.name} is responsible for.
          </h2>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-text-2">{profile.mandate}</p>
        </Reveal>
      </section>

      {/* ── OPERATING SURFACES ──────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-20">
          <Reveal>
            <SectionLabel index="02">Operating surfaces</SectionLabel>
            <h2 className="mt-6 max-w-2xl text-[clamp(1.8rem,4.5vw,3rem)] font-bold tracking-[-0.03em]">
              Where the work becomes visible.
            </h2>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {profile.surfaces.map(([title, body], i) => (
              <Reveal
                key={title}
                delay={i * 80}
                className="rounded-[var(--radius)] border border-hairline bg-bg/60 p-6 glass"
              >
                <span className="label text-accent">{String(i + 1).padStart(2, "0")}</span>
                <strong className="mt-4 block text-text">{title}</strong>
                <p className="mt-2 text-sm text-text-2">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── SIGNAL PATH ─────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-20">
        <Reveal>
          <SectionLabel index="03">Signal path</SectionLabel>
          <h2 className="mt-6 max-w-2xl text-[clamp(1.8rem,4.5vw,3rem)] font-bold tracking-[-0.03em]">
            How one task moves through the system.
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {profile.path.map(([title, body], i) => (
            <Reveal key={title} delay={i * 80} as="li" className="relative">
              <span className="label text-accent">{String(i + 1).padStart(2, "0")}</span>
              <strong className="mt-3 block text-lg text-text">{title}</strong>
              <p className="mt-2 text-sm text-text-2">{body}</p>
              {i < profile.path.length - 1 && (
                <ArrowRight className="absolute -right-4 top-0 hidden size-4 text-hairline-strong lg:block" />
              )}
            </Reveal>
          ))}
        </ol>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="border-t border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-16 md:px-10 md:py-20">
          <Reveal className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <span className="label text-accent">Deployment path</span>
              <h2 className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold tracking-[-0.02em]">
                Build a system with this responsibility.
              </h2>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link href="/builder-os" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Back to network
              </Link>
              <Link
                href={`/contact?agent=${encodeURIComponent(agent.key)}`}
                className={cn(buttonVariants({ size: "lg" }), "group")}
              >
                Map this workflow
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 px-4 py-3 glass">
      <span className="label text-muted">{label}</span>
      <p className="mt-1.5 flex items-center gap-2 text-sm font-semibold capitalize text-text">
        {live && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-accent" />}
        {value}
      </p>
    </div>
  );
}
