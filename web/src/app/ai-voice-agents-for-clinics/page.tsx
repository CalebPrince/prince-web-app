import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ClinicRoiCalculator } from "./clinic-roi-calculator";

export const metadata: Metadata = {
  title: "AI Voice Agents for Clinics in Ghana",
  description: "AI voice agents for clinics and healthcare practices in Ghana: answer routine calls, capture patient details, book appointments, send reminders, and hand clinical questions to staff.",
  keywords: "AI voice agents for clinics Ghana, clinic appointment automation Accra, healthcare chatbot Ghana, medical practice call answering",
  openGraph: {
    type: "website",
    title: "AI Voice Agents for Clinics in Ghana",
    description: "Answer routine calls, book appointments, and keep your front desk focused on patients already in the clinic.",
    url: "https://princecaleb.dev/ai-voice-agents-for-clinics.html",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Agents for Clinics in Ghana",
    description: "A practical call-answering and booking system for clinics, built with clear clinical safety boundaries.",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
};

const BOUNDARY_ROWS = [
  { yes: true, label: "Agent handles", detail: "Opening hours and location" },
  { yes: true, label: "Agent handles", detail: "Appointment booking and changes" },
  { yes: true, label: "Agent handles", detail: "Approved service and preparation FAQs" },
  { yes: false, label: "Human handoff", detail: "Symptoms, diagnosis, or treatment advice" },
  { yes: false, label: "Human handoff", detail: "Urgent, distressed, or unclear callers" },
];

const CAPABILITIES = [
  { n: "01", title: "Answers your real FAQs", body: "Grounded in your approved services, clinicians, locations, opening times, and patient instructions." },
  { n: "02", title: "Works with your calendar", body: "Checks actual availability before offering a time and records confirmed appointments." },
  { n: "03", title: "Follows up automatically", body: "Sends confirmations and reminders through the channels your patients already use." },
  { n: "04", title: "Leaves a clear audit trail", body: "Every completed action and handoff is visible, so staff can review what the system did." },
];

const PILOT_WEEKS = [
  { n: "Week 1", title: "Map", body: "Choose one routine call, approved answers, escalation rules, and the result staff need to receive." },
  { n: "Week 2", title: "Build", body: "Configure Lisa's voice, knowledge, booking steps, notifications, and visible audit trail." },
  { n: "Week 3", title: "Test", body: "Your team makes controlled calls, reviews transcripts, and corrects language or edge cases." },
  { n: "Launch review", title: "Decide", body: "Review answered calls, safe handoffs, captured bookings, and whether the workflow should expand." },
];

const FAQS = [
  { q: "Does Lisa replace reception staff?", a: "No. Lisa handles repeatable administrative calls and gives staff a clear handoff when judgment or personal attention is required." },
  { q: "What happens with an emergency or clinical question?", a: "Lisa does not diagnose or recommend treatment. Urgent, distressed, clinical, or unclear conversations follow the clinic's approved escalation instructions." },
  { q: "Can we use our existing number?", a: "Often, yes, through forwarding, porting, or a compatible provider. The right route depends on the country, carrier, and whether the number must also support WhatsApp." },
  { q: "Can a human take over?", a: "Yes. The workflow can notify staff, transfer eligible calls, or collect a callback request with the context already summarised." },
  { q: "Are calls recorded?", a: "Recording is optional. If enabled, disclosure, access, retention, and deletion rules must be agreed before launch." },
  { q: "What happens when the AI is uncertain?", a: "It should say it is unsure, avoid inventing an answer, capture the request, and send it to an authorised person." },
];

const DEMO_UTM = "?utm_source=clinic_voice_demo&utm_medium=niche_landing&utm_campaign=clinic_voice_agent";

export default function AiVoiceAgentsForClinicsPage() {
  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center px-4 py-[clamp(5rem,10vw,8rem)] sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-[clamp(2rem,6vw,6rem)] lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.48fr)] lg:items-center">
          <div>
            <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// AI call handling for clinics</p>
            <h1 className="mb-4 max-w-[12ch] text-5xl font-bold leading-[1.1] md:text-6xl">
              Your <span className="text-editorial-accent-strong">front desk</span> is busy. Your phone still gets answered.
            </h1>
            <p className="mb-4 max-w-[42rem] text-lg leading-[1.65] text-ink-soft">
              A voice agent handles routine calls, captures the right details, books available appointments, and
              sends the conversation to your team, without giving medical advice or pretending to be a clinician.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="brand" size="pill" nativeButton={false} render={<a href={`/book.html${DEMO_UTM}`} />}>
                Book a clinic demo
              </Button>
              <Button variant="brand-outline" size="pill" nativeButton={false} render={<a href="#clinic-workflow" />}>
                See the call flow
              </Button>
            </div>

            <div className="mt-6 grid grid-cols-1 divide-y divide-line-strong overflow-hidden rounded-2xl border border-line-strong sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <span className="flex items-center gap-2 p-4 text-[0.72rem] font-semibold text-editorial-accent">
                <span className="inline-block size-[0.4rem] rounded-full bg-editorial-accent" aria-hidden="true" /> Production line live
              </span>
              <a href="tel:+447462190814" className="grid gap-[0.15rem] p-4 hover:bg-card">
                <strong className="text-heading">Call Lisa now</strong>
                <small className="text-editorial-muted">+44 7462 190814</small>
              </a>
              <a href="https://wa.me/233535801359" target="_blank" rel="noopener" className="grid gap-[0.15rem] p-4 hover:bg-card">
                <strong className="text-heading">WhatsApp Lisa</strong>
                <small className="text-editorial-muted">Use the same assistant in chat</small>
              </a>
            </div>

            <div className="mt-6 flex max-w-[42rem] items-center gap-3 border-t border-line pt-4 text-[0.76rem]">
              <span className="shrink-0 font-mono text-[0.65rem] font-bold uppercase tracking-[0.06em] text-[#16835a]">Built-in boundary</span>
              <strong className="text-heading">Scheduling and information only. Clinical questions go to staff.</strong>
            </div>
          </div>

          {/* Static shell — real ElevenLabs/mic wiring deferred, same as the homepage's VoiceDemoMockup */}
          <article aria-label="Mockup of an AI voice agent handling a live booking call" className="relative w-full max-w-[27rem] overflow-hidden rounded-[20px] border border-line-strong bg-card shadow-lg lg:ml-auto">
            <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="inline-flex items-center gap-[0.55rem] text-heading">
                <span className="inline-block size-[0.48rem] rounded-full bg-[#20a36a] shadow-[0_0_0_4px_rgba(32,163,106,0.13)]" aria-hidden="true" />
                Voice demo ready
              </span>
              <span className="font-mono text-xs text-editorial-muted">00:00</span>
            </header>
            <div className="relative">
              <div className="flex items-center gap-3 p-4">
                <span aria-label="Lisa AI assistant" className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-editorial-accent/50 bg-navy text-editorial-accent shadow-[0_0_0_4px_rgba(98,255,152,0.08)]">
                  <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-8">
                    <circle cx="24" cy="24" r="18" />
                    <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
                    <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
                  </svg>
                </span>
                <div className="flex-1">
                  <strong className="block text-heading">Prince&apos;s Assistant</strong>
                  <small className="text-editorial-muted">Try the real assistant</small>
                </div>
                <span className="font-mono text-[0.68rem] font-semibold uppercase text-[#16835a]">Ready</span>
              </div>
              <div className="flex h-16 items-center justify-center gap-1 border-y border-line" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, i) => (
                  <i key={i} className="w-[3px] rounded-full bg-heading opacity-20" style={{ height: i % 3 === 2 ? "85%" : i % 2 === 0 ? "55%" : "20%" }} />
                ))}
              </div>
              <div className="p-4">
                <span className="block text-xs font-semibold uppercase tracking-wide text-editorial-muted">Voice agent</span>
                <p className="mt-1 text-sm text-ink-soft">
                  Tap &ldquo;Start voice demo,&rdquo; then ask how a voice agent could handle calls for your clinic.
                </p>
              </div>
              <div className="mx-4 mb-4 flex items-center gap-2 rounded-lg border border-line bg-bg-soft p-3">
                <span className="text-[#16835a]">✓</span>
                <div>
                  <strong className="block text-[0.8rem] text-heading">Connected to the real assistant</strong>
                  <small className="block text-[0.7rem] text-editorial-muted">Ask about call handling, appointment workflows, or implementation.</small>
                </div>
              </div>
            </div>
            <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <button type="button" className="inline-flex items-center gap-[0.55rem] rounded-full bg-heading px-[0.9rem] py-[0.68rem] text-bg">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
                </svg>
                <span className="text-[0.82rem] font-semibold">Start voice demo</span>
              </button>
              <span className="max-w-[13ch] text-right text-[0.68rem] text-editorial-muted">Microphone activates only after you tap.</span>
            </footer>
          </article>
        </div>
      </header>

      <section aria-label="Common clinic call pressure" className="overflow-hidden border-y border-line bg-heading text-bg">
        <div className="mx-auto flex min-h-[4.5rem] max-w-6xl flex-wrap items-center justify-between gap-4 px-4 font-mono text-[0.72rem] font-semibold tracking-[0.04em] uppercase sm:px-6">
          <span className="flex items-center gap-2">
            <i className="inline-block size-[0.42rem] rounded-full bg-bg/38" /> Staff assisting patients
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-[0.42rem] rounded-full bg-bg/38" /> Phone ringing
          </span>
          <span className="flex items-center gap-2">
            <i className="inline-block size-[0.42rem] rounded-full bg-bg/38" /> Appointment request waiting
          </span>
          <strong className="text-bg">The agent answers</strong>
        </div>
      </section>

      <section className="py-20" id="clinic-workflow">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// One routine call</p>
              <h2 className="text-3xl font-bold md:text-4xl">Handled end to end.</h2>
            </div>
            <p className="text-ink-soft">The agent does not replace clinical judgment. It removes the repeatable call work around it.</p>
          </div>

          <div aria-label="Mockups showing call intake, appointment booking, and staff handoff" className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
            <article className="min-h-[31rem] overflow-hidden rounded-2xl border border-line-strong bg-card shadow">
              <header className="flex min-h-[3.2rem] items-center justify-between gap-3 border-b border-line px-4 py-3">
                <span className="inline-flex items-center gap-[0.45rem] font-mono text-[0.68rem] font-bold uppercase text-heading">
                  <i className="inline-block size-[0.4rem] rounded-full bg-[#29d978]" /> Call intake
                </span>
                <b className="font-mono text-[0.6rem] font-semibold uppercase text-editorial-muted">01 · Listening</b>
              </header>
              <div className="flex items-center gap-[0.7rem] border-b border-line p-4">
                <span className="grid size-9 place-items-center rounded-full bg-bg-soft font-mono text-[0.7rem] font-bold text-heading">AM</span>
                <div>
                  <strong className="block text-heading">Akosua Mensah</strong>
                  <small className="mt-[0.15rem] block text-[0.67rem] text-editorial-muted">First-time caller · 00:42</small>
                </div>
                <em className="ml-auto font-mono text-[0.62rem] font-bold text-[#16835a] not-italic uppercase">Live</em>
              </div>
              <div className="m-4 rounded-[4px_12px_12px_12px] border border-line bg-bg-soft p-4">
                <span className="font-mono text-[0.6rem] font-semibold text-editorial-muted uppercase">Caller</span>
                <p className="mt-[0.45rem] text-[0.8rem] leading-[1.5] text-ink">Can I see a doctor on Thursday morning?</p>
              </div>
              <div className="mx-4 border-t border-line">
                {[
                  ["Intent", "New appointment"],
                  ["Preference", "Thursday · AM"],
                  ["Contact", "Confirmed"],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-line py-3">
                    <span className="font-mono text-[0.6rem] font-semibold text-editorial-muted uppercase">{k}</span>
                    <strong className="text-[0.7rem] text-heading">{v}</strong>
                  </div>
                ))}
              </div>
              <footer className="mt-4 flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[0.68rem] text-editorial-muted">
                <span>Details captured</span>
                <strong className="text-heading">3 / 3</strong>
              </footer>
            </article>

            <div aria-hidden="true" className="grid justify-items-center gap-[0.65rem] text-editorial-muted max-lg:rotate-90 max-lg:py-2">
              <span className="font-mono text-[0.58rem] font-semibold tracking-[0.08em] uppercase [writing-mode:vertical-rl] lg:rotate-180">Qualified request</span>
              <i className="grid size-7 place-items-center rounded-full border border-line-strong bg-bg text-heading not-italic">→</i>
            </div>

            <article className="min-h-[31rem] overflow-hidden rounded-2xl border border-line-strong bg-card shadow">
              <header className="flex min-h-[3.2rem] items-center justify-between gap-3 border-b border-line px-4 py-3">
                <span className="font-mono text-[0.68rem] font-bold uppercase text-heading">Appointment calendar</span>
                <b className="font-mono text-[0.6rem] font-semibold uppercase text-editorial-muted">02 · Checking</b>
              </header>
              <div className="flex items-center justify-between px-4 py-[1.1rem]">
                <button type="button" tabIndex={-1} aria-hidden="true" className="size-[1.7rem] rounded-full border border-line text-editorial-muted">
                  ‹
                </button>
                <strong className="text-[0.78rem] text-heading">Thursday, 30 July</strong>
                <button type="button" tabIndex={-1} aria-hidden="true" className="size-[1.7rem] rounded-full border border-line text-editorial-muted">
                  ›
                </button>
              </div>
              <div aria-hidden="true" className="grid grid-cols-5 gap-[0.35rem] px-4 pb-4">
                {["M", "T", "W", "T", "F"].map((d, i) => (
                  <span key={i} className={`grid h-8 place-items-center rounded-md font-mono text-[0.62rem] font-semibold ${i === 3 ? "bg-heading text-bg" : "text-editorial-muted"}`}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="border-t border-line">
                <div className="flex justify-between gap-3 border-b border-line px-4 py-[0.85rem] text-[0.7rem]">
                  <span className="font-mono text-heading">08:30</span>
                  <em className="text-editorial-muted not-italic">Unavailable</em>
                </div>
                <div className="flex justify-between gap-3 border-b border-line bg-[rgba(32,163,106,0.08)] px-4 py-[0.85rem] text-[0.7rem] shadow-[inset_3px_0_#20a36a]">
                  <span className="font-mono text-heading">10:30</span>
                  <strong className="text-[0.66rem] text-[#16835a]">Available · selected</strong>
                </div>
                <div className="flex justify-between gap-3 border-b border-line px-4 py-[0.85rem] text-[0.7rem]">
                  <span className="font-mono text-heading">11:45</span>
                  <strong className="text-[0.66rem] text-[#16835a]">Available</strong>
                </div>
              </div>
              <div className="m-4 flex items-center gap-[0.65rem] rounded-[9px] border border-[rgba(32,163,106,0.25)] bg-[rgba(32,163,106,0.07)] p-[0.8rem]">
                <span className="font-extrabold text-[#16835a]">✓</span>
                <div>
                  <strong className="block text-[0.7rem] text-heading">10:30 held for Akosua</strong>
                  <small className="mt-[0.15rem] block text-[0.62rem] text-editorial-muted">Confirmation sent by WhatsApp</small>
                </div>
              </div>
            </article>

            <div aria-hidden="true" className="grid justify-items-center gap-[0.65rem] text-editorial-muted max-lg:rotate-90 max-lg:py-2">
              <span className="font-mono text-[0.58rem] font-semibold tracking-[0.08em] uppercase [writing-mode:vertical-rl] lg:rotate-180">Booking confirmed</span>
              <i className="grid size-7 place-items-center rounded-full border border-line-strong bg-bg text-heading not-italic">→</i>
            </div>

            <article className="min-h-[31rem] overflow-hidden rounded-2xl border border-line-strong bg-card shadow">
              <header className="flex min-h-[3.2rem] items-center justify-between gap-3 border-b border-line px-4 py-3">
                <span className="font-mono text-[0.68rem] font-bold uppercase text-heading">Front desk inbox</span>
                <b className="font-mono text-[0.6rem] font-semibold uppercase text-editorial-muted">03 · Visible</b>
              </header>
              <div className="m-4 flex justify-between border-l-[3px] border-[#20a36a] bg-bg-soft p-3">
                <span className="text-[0.72rem] font-bold text-heading">New booking</span>
                <strong className="font-mono text-[0.6rem] font-semibold uppercase text-[#16835a]">Just now</strong>
              </div>
              <div className="mx-4 border-t border-line">
                {[
                  ["Patient", "Akosua Mensah"],
                  ["Appointment", "Thu 30 Jul · 10:30"],
                  ["Request", "New consultation"],
                ].map(([k, v]) => (
                  <div key={k} className="border-b border-line py-3">
                    <span className="font-mono text-[0.6rem] font-semibold text-editorial-muted uppercase">{k}</span>
                    <strong className="mt-[0.3rem] block text-[0.73rem] text-heading">{v}</strong>
                  </div>
                ))}
              </div>
              <div className="m-4 rounded-[9px] border border-line p-[0.85rem]">
                <span className="font-mono text-[0.6rem] font-semibold text-editorial-muted uppercase">Agent note</span>
                <p className="mt-[0.45rem] text-[0.7rem] leading-[1.5] text-ink">
                  Caller requested a Thursday morning appointment. No clinical questions asked. Contact details confirmed.
                </p>
              </div>
              <footer className="flex items-center gap-3 border-t border-line px-4 py-3">
                <span className="text-[#16835a]">✓</span>
                <strong className="text-[0.7rem] text-heading">No staff action required</strong>
              </footer>
            </article>
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-bg-soft py-20">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 md:grid-cols-[0.75fr_minmax(22rem,1fr)] md:items-center">
          <div>
            <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Designed to know its limits</p>
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">Administrative confidence. Clinical restraint.</h2>
            <p className="text-ink-soft">
              The safe system is not the one that answers everything. It is the one that knows exactly when to stop
              and hand the conversation to a person.
            </p>
          </div>
          <div className="border-t border-line-strong">
            {BOUNDARY_ROWS.map((row, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 border-b border-line-strong py-5 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
                <span className={`font-mono text-[0.65rem] leading-[1.4] font-bold tracking-[0.06em] uppercase ${row.yes ? "text-[#16835a]" : "text-[#b73b3b]"}`}>{row.label}</span>
                <strong className="text-heading">{row.detail}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Built around your practice</p>
              <h2 className="text-3xl font-bold md:text-4xl">Not another isolated phone bot.</h2>
            </div>
            <p className="text-ink-soft">The useful build connects the call to the systems and people who need the result.</p>
          </div>
          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2">
            {CAPABILITIES.map((c) => (
              <article key={c.n} className="min-h-60 border-r border-b border-line p-8">
                <span className="font-mono text-[0.68rem] font-bold tracking-[0.08em] text-editorial-muted uppercase">{c.n}</span>
                <h3 className="mt-10 mb-[0.8rem] text-[1.2rem] font-bold text-heading">{c.title}</h3>
                <p className="leading-[1.65] text-ink-soft">{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-line bg-bg-soft py-20" id="clinic-pilot">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// A controlled first deployment</p>
              <h2 className="text-3xl font-bold md:text-4xl">Start with one call your team repeats every day.</h2>
            </div>
            <p className="text-ink-soft">The pilot proves the workflow with monitored conversations before anything expands.</p>
          </div>
          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
            {PILOT_WEEKS.map((w) => (
              <article key={w.n} className="border-r border-b border-line p-8">
                <span className="block font-mono text-[0.7rem] font-bold tracking-[0.09em] text-editorial-accent uppercase">{w.n}</span>
                <h3 className="mt-8 mb-[0.65rem] text-[1.25rem] font-bold text-heading">{w.title}</h3>
                <p className="leading-[1.65] text-ink-soft">{w.body}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-[0.7rem]">
            <strong className="mr-1 text-heading">Pilot includes</strong>
            {["One inbound call flow", "Approved FAQ set", "Human handoff rules", "Call logs", "Staff summaries"].map((item) => (
              <span key={item} className="rounded-full border border-line px-[0.7rem] py-[0.45rem] text-[0.76rem] text-ink-soft">
                {item}
              </span>
            ))}
            <Link href="/pricing" className="group ml-auto font-bold text-heading hover:text-editorial-accent">
              See implementation starting points{" "}
              <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20" id="clinic-roi">
        <ClinicRoiCalculator />
      </section>

      <section className="border-t border-line bg-bg-soft py-20" id="clinic-faq">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Before a clinic trusts the line</p>
              <h2 className="text-3xl font-bold md:text-4xl">The questions worth asking.</h2>
            </div>
            <p className="text-ink-soft">A useful voice agent is defined as much by its limits as by what it can do.</p>
          </div>
          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2">
            {FAQS.map((f) => (
              <details key={f.q} className="border-r border-b border-line p-6">
                <summary className="cursor-pointer font-bold text-heading marker:text-editorial-accent">{f.q}</summary>
                <p className="mt-4 leading-[1.7] text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-start justify-between gap-6 border border-line bg-bg p-6 sm:flex-row sm:items-center">
            <div>
              <strong className="block text-heading">Safety is part of the build.</strong>
              <span className="text-[0.88rem] text-ink-soft">See how disclosure, consent, recordings, data retention, and human escalation are handled.</span>
            </div>
            <Button variant="brand-outline" size="pill" nativeButton={false} render={<Link href="/ai-safety" />}>
              Read the trust &amp; safety approach
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-line bg-heading py-20 text-bg">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 px-4 sm:px-6 md:flex-row md:items-end">
          <div className="max-w-[48rem]">
            <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#73aaff]">// Start with your busiest call</p>
            <h2 className="mb-3 text-3xl font-bold md:text-4xl">Show me what your front desk repeats every day.</h2>
            <p className="opacity-90">I&apos;ll map one practical call flow and show you where a voice agent should, and should not, act.</p>
          </div>
          <div className="grid gap-[0.85rem] justify-self-start">
            <div className="flex flex-wrap gap-3">
              <Button variant="brand" size="pill" className="border-bg bg-bg text-heading hover:bg-transparent hover:text-bg" nativeButton={false} render={<a href={`/book.html${DEMO_UTM}`} />}>
                Book a clinic demo
              </Button>
              <Button variant="brand-outline" size="pill" className="border-bg/35 text-bg hover:border-bg" nativeButton={false} render={<a href={`/contact${DEMO_UTM}`} />}>
                Describe your call flow
              </Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <a href="tel:+447462190814" className="font-mono text-[0.68rem] font-bold tracking-[0.04em] text-bg/80 uppercase hover:text-bg">
                Call Lisa
              </a>
              <a href="https://wa.me/233535801359" target="_blank" rel="noopener" className="font-mono text-[0.68rem] font-bold tracking-[0.04em] text-bg/80 uppercase hover:text-bg">
                WhatsApp Lisa
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
