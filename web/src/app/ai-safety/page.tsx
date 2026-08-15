import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "AI Trust & Safety",
  description: "How Prince Caleb approaches AI disclosure, human escalation, call recordings, data retention, and safe boundaries for voice agents and automations.",
};

const PRINCIPLES = [
  {
    n: "01 · Disclosure",
    title: "People should know they are speaking with AI.",
    body: "The opening and channel profile identify the assistant clearly. The system does not pretend to be a clinician, employee, or specific real person.",
  },
  {
    n: "02 · Boundaries",
    title: "Approved tasks are written down.",
    body: "Allowed information, prohibited advice, escalation triggers, and tool permissions are defined for the workflow instead of left to improvisation.",
  },
  {
    n: "03 · Human control",
    title: "Uncertainty produces a handoff.",
    body: "When a request is sensitive, urgent, unclear, or outside scope, the agent stops, captures context, and follows an approved transfer or callback path.",
  },
  {
    n: "04 · Data restraint",
    title: "Collect only what the task needs.",
    body: "Access, retention, deletion, exports, and staff visibility are scoped before launch. Sensitive data is not collected merely because the system can ask for it.",
  },
  {
    n: "05 · Recording",
    title: "Recording is optional and disclosed.",
    body: "If calls are recorded or transcribed, the organisation must approve the purpose, notice, access rules, retention period, and deletion process.",
  },
  {
    n: "06 · Auditability",
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
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// AI trust &amp; safety</p>
          <h1 className="mb-4 max-w-[14ch] text-5xl font-bold leading-[1.1] md:text-6xl">
            The <span className="text-editorial-accent-strong">agent</span> should know when to stop.
          </h1>
          <p className="max-w-[64ch] text-lg leading-[1.65] text-ink-soft">
            A dependable AI system is explicit about what it is, acts only inside approved boundaries, and leaves
            important decisions with authorised people.
          </p>
        </div>
      </header>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-[1fr_minmax(18rem,0.55fr)] md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Design principles</p>
              <h2 className="max-w-[12ch] text-3xl font-bold md:text-4xl">Controls before convenience.</h2>
            </div>
            <p className="max-w-[46ch] text-ink-soft">
              The exact controls depend on the organisation, workflow, country, and information involved. They are
              agreed before launch.
            </p>
          </div>

          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <article key={p.n} className="min-h-64 border-r border-b border-line p-8">
                <span className="font-mono text-[0.7rem] font-bold leading-[1.2] tracking-[0.09em] text-editorial-accent">{p.n}</span>
                <h2 className="mt-10 mb-3 text-[1.3rem] font-bold text-heading">{p.title}</h2>
                <p className="leading-[1.7] text-ink-soft">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-bg-soft py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-[0.75fr_minmax(22rem,1fr)] md:items-center">
          <div>
            <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Healthcare boundary</p>
            <h2 className="mb-4 max-w-[12ch] text-3xl font-bold md:text-4xl">Administrative support is not clinical judgment.</h2>
            <p className="text-ink-soft">
              A clinic agent can share approved administrative information, manage appointments, and route requests.
              It should not diagnose symptoms, recommend treatment, or delay urgent human help.
            </p>
          </div>
          <div className="border-t border-line-strong">
            {BOUNDARY_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 border-b border-line-strong py-5 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                <span
                  className={`font-mono text-[0.65rem] leading-[1.4] font-bold tracking-[0.06em] uppercase ${row.yes ? "text-[#16835a]" : "text-[#b73b3b]"}`}
                >
                  {row.label}
                </span>
                <strong className="text-heading">{row.detail}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-heading py-20 text-center text-bg">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Define the safe boundary before the first live call.</h2>
          <p className="mb-6 text-lg opacity-90">
            Bring one routine workflow. We will map what the agent may do, what it must never do, and when a person
            takes over.
          </p>
          <Button
            variant="brand"
            size="pill"
            className="border-bg bg-bg text-heading hover:text-bg"
            nativeButton={false}
            render={<a href="/book.html" />}
          >
            Review a workflow
          </Button>
        </div>
      </section>
    </main>
  );
}
