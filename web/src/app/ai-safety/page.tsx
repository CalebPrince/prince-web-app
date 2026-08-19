import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Prince Caleb - AI Trust & Safety",
  description:
    "How Prince Caleb approaches AI disclosure, human escalation, call recordings, data retention, and safe boundaries for voice agents and automations.",
};

const PRINCIPLES = [
  {
    no: "01",
    kicker: "Disclosure",
    title: "People should know they are speaking with AI.",
    body: "The opening and channel profile identify the assistant clearly. The system does not pretend to be a clinician, employee, or specific real person.",
  },
  {
    no: "02",
    kicker: "Boundaries",
    title: "Approved tasks are written down.",
    body: "Allowed information, prohibited advice, escalation triggers, and tool permissions are defined for the workflow instead of left to improvisation.",
  },
  {
    no: "03",
    kicker: "Human control",
    title: "Uncertainty produces a handoff.",
    body: "When a request is sensitive, urgent, unclear, or outside scope, the agent stops, captures context, and follows an approved transfer or callback path.",
  },
  {
    no: "04",
    kicker: "Data restraint",
    title: "Collect only what the task needs.",
    body: "Access, retention, deletion, exports, and staff visibility are scoped before launch. Sensitive data is not collected merely because the system can ask for it.",
  },
  {
    no: "05",
    kicker: "Recording",
    title: "Recording is optional and disclosed.",
    body: "If calls are recorded or transcribed, the organisation must approve the purpose, notice, access rules, retention period, and deletion process.",
  },
  {
    no: "06",
    kicker: "Auditability",
    title: "Important actions leave evidence.",
    body: "Calls, messages, handoffs, tool actions, failures, and approvals can be logged so staff can review what happened and correct the system.",
  },
];

const BOUNDARY_ROWS = [
  { yes: true, label: "Agent handles", detail: "Hours, location, services, and booking" },
  { yes: true, label: "Agent handles", detail: "Approved preparation information" },
  { yes: false, label: "Human handoff", detail: "Symptoms, diagnosis, and treatment" },
  { yes: false, label: "Human handoff", detail: "Urgent, distressed, or uncertain callers" },
];

export default function AiSafetyPage() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-20 md:px-10 md:pt-48 md:pb-24">
          <Reveal>
            <SectionLabel>AI trust &amp; safety</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-[16ch] text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              The <span className="text-accent">agent</span> should know when to stop.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-[64ch] text-lg leading-relaxed text-text-2 md:text-xl">
              A dependable AI system is explicit about what it is, acts only inside approved boundaries, and
              leaves important decisions with authorised people.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── PRINCIPLES ──────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <Reveal className="grid gap-8 md:grid-cols-[1fr_minmax(18rem,0.55fr)] md:items-end">
          <div>
            <SectionLabel index="01">Design principles</SectionLabel>
            <h2 className="mt-6 max-w-[14ch] text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Controls before convenience.
            </h2>
          </div>
          <p className="max-w-[46ch] text-text-2">
            The exact controls depend on the organisation, workflow, country, and information involved. They are
            agreed before launch.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius)] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Reveal
              key={p.no}
              delay={(i % 3) * 70}
              className="group flex min-h-[16rem] flex-col bg-bg p-8 transition-colors hover:bg-bg-2 md:p-10"
            >
              <div className="flex items-center gap-2.5">
                <span className="label text-accent">{p.no}</span>
                <span className="label text-muted">{p.kicker}</span>
              </div>
              <h3 className="mt-8 text-xl font-semibold tracking-tight text-text">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-text-2">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── HEALTHCARE BOUNDARY ─────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-6 py-24 md:grid-cols-[0.75fr_minmax(22rem,1fr)] md:items-center md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="02">Healthcare boundary</SectionLabel>
            <h2 className="mt-6 max-w-[14ch] text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Administrative support is not clinical judgment.
            </h2>
            <p className="mt-5 max-w-[52ch] text-text-2">
              A clinic agent can share approved administrative information, manage appointments, and route
              requests. It should not diagnose symptoms, recommend treatment, or delay urgent human help.
            </p>
          </Reveal>

          <Reveal delay={120} className="border-t border-hairline-strong">
            {BOUNDARY_ROWS.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-2 border-b border-hairline-strong py-5 sm:grid-cols-[9.5rem_1fr] sm:gap-4"
              >
                <span className={cn("label", row.yes ? "text-accent" : "text-[#ff8f8f]")}>{row.label}</span>
                <strong className="font-semibold text-text">{row.detail}</strong>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(2rem,5.5vw,4.5rem)] font-extrabold leading-[1] tracking-[-0.03em]">
              Define the safe boundary
              <br />
              <span className="text-accent">before the first live call.</span>
            </h2>
            <p className="mx-auto mt-8 max-w-xl text-lg text-text-2">
              Bring one routine workflow. We will map what the agent may do, what it must never do, and when a
              person takes over.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Review a workflow
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/services" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Explore services
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
