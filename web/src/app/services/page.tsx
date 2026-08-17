import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Services",
  description:
    "AI voice agents, autonomous AI agents, business automations, and chatbots, plus the custom web & mobile engineering they run on. Services from Prince Caleb.",
};

const TRACKS = [
  {
    id: "track-01",
    trackId: "TRACK 01",
    status: "Voice operations",
    title: "AI Voice Agents",
    body: "Voice agents that answer your business line around the clock, booking appointments, qualifying callers, answering the questions you answer twenty times a day, and handing off to a human the moment a call needs one.",
    tech: ["Call answering", "Appointment booking", "Caller qualification", "Human handoff"],
    metric: "24/7",
    metricLabel: "Answer coverage",
  },
  {
    id: "track-02",
    trackId: "TRACK 02",
    status: "Agents at work",
    title: "Autonomous AI Agents",
    body: "Agents that scout leads, draft follow-ups, prepare proposals, and report on their own work daily. Not a pitch deck concept: this site's own sales engine runs on agents I built, and I build the same discipline into agents for clients.",
    tech: ["Lead scouting", "Follow-up drafting", "Daily reporting", "Grounded in your data"],
    metric: "In production",
    metricLabel: "Running this very site",
  },
  {
    id: "track-03",
    trackId: "TRACK 03",
    status: "Workflow relay",
    title: "Business Automations",
    body: "Connect the tools you already use and remove the manual work between them, enquiries into your CRM, bookings into invoices and reminders, events into email sequences. Built lean, running quietly on schedule, with failures surfaced instead of swallowed.",
    tech: ["CRM sync", "Email triggers", "Scheduled jobs", "Webhooks"],
    metric: "Hands-off",
    metricLabel: "Runs on schedule",
  },
  {
    id: "track-04",
    trackId: "TRACK 04",
    status: "Always-on support",
    title: "AI Chatbots & Live Assistants",
    body: "Chat that actually knows your business, grounded in your real content and services, with graceful fallbacks and a clean handoff to a human. The assistant in the corner of this page is the working example, not a mockup.",
    tech: ["Your real content", "Human handoff", "Fallbacks", "Lead capture"],
    metric: "Live demo",
    metricLabel: "Bottom-right corner",
  },
  {
    id: "track-05",
    trackId: "TRACK 05",
    status: "The backbone",
    title: "Custom Websites & Mobile Apps",
    body: "Fast business websites, custom web applications, and cross-platform mobile apps designed around how your customers and team actually work. They can launch as standalone products or become the interface for your AI agents and automations.",
    tech: ["Business websites", "Web applications", "iOS & Android apps", "UX & integrations"],
    metric: "12+ yrs",
    metricLabel: "Engineering behind it",
  },
  {
    id: "track-06",
    trackId: "TRACK 06",
    status: "Ad creative",
    title: "Video & Image Ads",
    body: "Scroll-stopping video and image ad creative for Meta, TikTok, and Google, scripted, produced, and delivered ready to launch, so your campaigns start with creative that actually performs.",
    tech: ["Short-form video", "Static image sets", "Platform-ready formats", "Scripting & captions"],
    metric: "1-2 wks",
    metricLabel: "Typical turnaround",
  },
];

const LIVE_PROOF = [
  { status: "Live", title: "Builder OS", body: "Inspect the full multi-agent system live: Lisa, Joan, Sharon, and Jason, each doing real work on this site right now.", href: "/builder-os", cta: "Open Builder OS" },
  { status: "Live", title: "Browser voice agent", body: "Speak with Lisa on the homepage and see the typed fallback, transcript state, and service-aware responses.", href: "/#voice-demo-start", cta: "Try the voice demo" },
  { status: "Connected", title: "Phone and WhatsApp", body: "The same assistant can receive real calls and messages through configured ElevenLabs channels and route them into the application.", href: "/contact", cta: "See the live channels" },
  { status: "Integrated", title: "Lisa across your tools", body: "See how Lisa can turn calls and messages into calendar bookings, CRM records, Slack alerts, and structured follow-ups.", href: "/lisa-ai-assistant", cta: "Explore Lisa's capabilities" },
  { status: "Visible", title: "Operational audit trail", body: "Call direction, numbers, status, duration, conversation turns, provider, and lead linkage are recorded for review.", href: "/ai-voice-agents-for-clinics#clinic-workflow", cta: "Inspect the workflow" },
  { status: "Controlled", title: "Human-approved outreach", body: "Lisa can prepare and place an eligible lead call only after a person reviews the script and confirms consent.", href: "/ai-safety", cta: "Review the safeguards" },
];

export default function ServicesPage() {
  return (
    <main>
      {/* Single-block hero — no side panel here, unlike home/about */}
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Services</p>
          <h1 className="mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            AI <span className="text-editorial-accent-strong">agents</span> that finish the workflow.
          </h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Start with the call, message, or repetitive task costing your team time. Then connect the answer to the
            booking, follow-up, record, and person who needs it.
          </p>
        </div>
      </header>

      {/* Workflow mockup proof */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// A working handoff</p>
              <h2 className="max-w-2xl text-3xl font-bold md:text-4xl">From first hello to confirmed booking.</h2>
            </div>
            <p className="max-w-sm text-ink-soft">
              The useful part is not one clever AI response. It is the full chain: answering, understanding,
              updating your records, and telling the right person what happened.
            </p>
          </div>

          {/* Ported from .workflow-mockup — a fake "Ops desk" app window: dark
              sidebar rail + main pane split into conversation transcript and
              a completed-actions summary. */}
          <div
            aria-label="Mockup showing an automated customer enquiry workflow"
            className="grid min-h-[38rem] overflow-hidden rounded-3xl border border-line-strong bg-card shadow-lg max-md:grid-cols-1"
            style={{ gridTemplateColumns: "13rem minmax(0, 1fr)" }}
          >
            <aside className="flex flex-col border-r border-line bg-heading p-5 text-bg max-md:hidden">
              <div className="mb-10 flex items-center gap-[0.65rem]">
                <span className="grid size-8 place-items-center rounded-lg border border-bg/35">P</span>
                <strong className="text-bg">Ops desk</strong>
              </div>
              <nav aria-label="Mock application navigation" className="grid gap-[0.35rem]">
                {["Live activity", "Conversations", "Automations", "Customers"].map((label, i) => (
                  <span
                    key={label}
                    className={
                      i === 0
                        ? "flex justify-between rounded-lg bg-bg/10 p-[0.7rem] text-[0.78rem] text-bg"
                        : "flex justify-between rounded-lg p-[0.7rem] text-[0.78rem] text-bg/58"
                    }
                  >
                    {label}
                    {i === 0 && (
                      <b className="grid min-w-5 place-items-center rounded-full bg-bg text-[0.65rem] text-heading">3</b>
                    )}
                  </span>
                ))}
              </nav>
              <div className="mt-auto flex items-center gap-[0.7rem] border-t border-bg/16 pt-4">
                <span className="inline-block size-[0.48rem] rounded-full bg-[#20a36a] shadow-[0_0_0_4px_rgba(32,163,106,0.13)]" />
                <div>
                  <strong className="block text-[0.68rem] text-bg">All systems online</strong>
                  <small className="mt-[0.15rem] block text-[0.68rem] text-bg opacity-55">Checked just now</small>
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <header className="flex min-h-[5.5rem] items-center justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-editorial-muted">
                    ACTIVITY / CALL-1048
                  </span>
                  <h3 className="mt-1 text-[1.15rem] font-bold text-heading">New appointment enquiry</h3>
                </div>
                <span className="rounded-full border border-[rgba(32,163,106,0.28)] bg-[rgba(32,163,106,0.08)] px-2 py-[0.35rem] font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#16835a]">
                  Resolved automatically
                </span>
              </header>
              <div className="grid max-md:grid-cols-1" style={{ gridTemplateColumns: "minmax(0, 1fr) 18rem" }}>
                <div className="border-r border-line p-[clamp(1.25rem,4vw,3rem)] max-md:border-r-0">
                  <div className="flex items-center gap-3 pb-6">
                    <span className="grid size-10 flex-none place-items-center rounded-full bg-heading font-mono text-[0.7rem] font-bold text-bg">
                      AM
                    </span>
                    <div>
                      <strong className="block text-heading">Akosua Mensah</strong>
                      <small className="mt-[0.15rem] block text-[0.75rem] text-editorial-muted">Inbound call · 2m 14s</small>
                    </div>
                  </div>
                  <div className="mb-4 max-w-[75%] rounded-[4px_14px_14px_14px] border border-line bg-bg-soft p-4">
                    <span className="font-mono text-[0.66rem] font-semibold uppercase text-editorial-muted">Customer</span>
                    <p className="mt-[0.45rem] text-[0.86rem] leading-[1.55] text-ink">Can I book a consultation for Thursday morning?</p>
                  </div>
                  <div className="mb-4 ml-auto max-w-[75%] rounded-[14px_4px_14px_14px] bg-heading p-4">
                    <span className="font-mono text-[0.66rem] font-semibold uppercase text-bg opacity-58">Voice agent</span>
                    <p className="mt-[0.45rem] text-[0.86rem] leading-[1.55] text-bg">
                      Yes, 10:30 is available. I&apos;ve held it and sent the details to your WhatsApp.
                    </p>
                  </div>
                  <div className="mt-8 flex justify-between gap-4 border-t border-line pt-4 text-[0.7rem] text-editorial-muted">
                    <span>Intent: appointment</span>
                    <span>Confidence 98%</span>
                  </div>
                </div>
                <aside className="bg-bg-soft p-6">
                  <span className="mb-4 block font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-editorial-muted">
                    Actions completed
                  </span>
                  {[
                    ["Calendar booked", "Thu · 10:30 GMT"],
                    ["Customer added", "CRM record #2841"],
                    ["Team notified", "WhatsApp summary sent"],
                  ].map(([title, sub]) => (
                    <div key={title} className="flex items-center gap-3 border-b border-line py-[0.9rem]">
                      <span className="font-bold text-[#16835a]">✓</span>
                      <div>
                        <strong className="block text-heading">{title}</strong>
                        <small className="mt-[0.15rem] block text-[0.7rem] text-editorial-muted">{sub}</small>
                      </div>
                    </div>
                  ))}
                  <div className="mt-8 flex justify-between gap-4 text-[0.7rem] text-editorial-muted">
                    <span>Human time used</span>
                    <strong className="text-heading">0 min</strong>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Production log — hairline list, ported from .production-log-entry */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="border-t border-line">
            {TRACKS.map((t) => (
              <div
                key={t.id}
                id={t.id}
                className="grid items-center gap-6 border-b border-line py-9 max-md:grid-cols-1"
                style={{ gridTemplateColumns: "minmax(150px, 0.24fr) minmax(0, 1fr) minmax(190px, 0.28fr)" }}
              >
                <div>
                  <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">{t.trackId}</span>
                  <div className="mt-2 font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">{t.status}</div>
                </div>
                <div>
                  <h2 className="mb-[0.65rem] text-2xl font-bold text-heading">{t.title}</h2>
                  <p className="max-w-[68ch] text-ink-soft">{t.body}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {t.tech.map((tag) => (
                      <span key={tag} className="inline-flex items-center rounded-lg border border-line px-[0.9rem] py-[0.45rem] font-mono text-[0.8rem] text-ink">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="justify-self-end border-l border-line pl-4 text-right">
                  <strong className="block text-[clamp(1.35rem,3vw,2.1rem)] leading-none text-heading">{t.metric}</strong>
                  <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">{t.metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live proof — edge-to-edge hairline grid, ported from .live-proof-grid */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Evidence, not invented metrics</p>
              <h2 className="max-w-2xl text-3xl font-bold md:text-4xl">This site runs the systems it sells.</h2>
            </div>
            <p className="max-w-sm text-ink-soft">
              These are working product surfaces you can inspect today. They demonstrate capability; they are not
              presented as client performance results.
            </p>
          </div>

          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
            {LIVE_PROOF.map((p) => (
              <article key={p.title} className="flex min-h-[18rem] flex-col border-r border-b border-line bg-bg p-7">
                <div className="flex items-center gap-2 font-mono text-[0.68rem] font-bold uppercase leading-[1.2] tracking-[0.07em] text-[#16835a]">
                  <span className="inline-block size-[0.48rem] rounded-full bg-[#20a36a] shadow-[0_0_0_4px_rgba(32,163,106,0.13)]" />
                  {p.status}
                </div>
                <h3 className="mb-3 mt-10 text-[1.18rem] font-bold text-heading">{p.title}</h3>
                <p className="mb-6 text-[0.86rem] leading-[1.68] text-editorial-muted">{p.body}</p>
                <Link href={p.href} className="group mt-auto text-[0.82rem] font-bold text-heading hover:text-editorial-accent">
                  {p.cta}{" "}
                  <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                    →
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA — dark inverted panel */}
      <section className="border-t border-line border-b bg-heading py-20 text-center text-bg">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Start with the workflow that repeats most.</h2>
          <p className="mb-6 text-lg opacity-90">
            A short review identifies what the agent may handle, where a person takes over, and what result should
            reach your team.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="brand"
              size="pill"
              className="border-bg bg-bg text-heading hover:text-bg"
              nativeButton={false}
              render={<a href="/book.html" />}
            >
              Review a workflow
            </Button>
            <Button
              variant="brand-outline"
              size="pill"
              className="border-white/35 text-bg hover:border-bg hover:text-bg"
              nativeButton={false}
              render={<Link href="/contact" />}
            >
              Send a message
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
