import Link from "next/link";
import { api } from "@/lib/api";
import { ArrowRight, Check, Phone, MessageCircle, X, ShieldCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ClinicRoiCalculator } from "@/components/ClinicRoiCalculator";
import { VoiceDemo } from "@/components/VoiceDemo";

// AI Voice Agents for Clinics - niche landing page ported from
// public/ai-voice-agents-for-clinics.html. The hero's voice-demo card is a
// static illustrative shell (same scope as the homepage's own voice-demo
// mockup) - the real browser-mic ElevenLabs demo isn't wired into web/
// anywhere yet. tel:/wa.me links are real and point at the same live
// numbers the legacy page uses.

const CALL_NUMBER = "+447462190814";
const WHATSAPP_URL = "https://wa.me/233535801359";
const BOOK_UTM = "?utm_source=clinic_voice_demo&utm_medium=niche_landing&utm_campaign=clinic_voice_agent";

const PROCESS_STEPS = [
  {
    label: "01 · Listening",
    title: "Call intake",
    caller: "Akosua Mensah",
    meta: "First-time caller · 00:42",
    transcript: "Can I see a doctor on Thursday morning?",
    fields: [
      ["Intent", "New appointment"],
      ["Preference", "Thursday · AM"],
      ["Contact", "Confirmed"],
    ],
    footer: "Details captured · 3 / 3",
  },
  {
    label: "02 · Checking",
    title: "Appointment calendar",
    caller: null,
    meta: null,
    transcript: null,
    fields: [
      ["08:30", "Unavailable"],
      ["10:30", "Available · selected"],
      ["11:45", "Available"],
    ],
    footer: "10:30 held for Akosua · confirmation sent by WhatsApp",
  },
  {
    label: "03 · Visible",
    title: "Front desk inbox",
    caller: null,
    meta: null,
    transcript: "Caller requested a Thursday morning appointment. No clinical questions asked. Contact details confirmed.",
    fields: [
      ["Patient", "Akosua Mensah"],
      ["Appointment", "Thu 30 Jul · 10:30"],
      ["Request", "New consultation"],
    ],
    footer: "No staff action required",
  },
];

const BOUNDARY_YES = [
  "Opening hours and location",
  "Appointment booking and changes",
  "Approved service and preparation FAQs",
];
const BOUNDARY_NO = ["Symptoms, diagnosis, or treatment advice", "Urgent, distressed, or unclear callers"];

const CAPABILITIES = [
  { no: "01", title: "Answers your real FAQs", body: "Grounded in your approved services, clinicians, locations, opening times, and patient instructions." },
  { no: "02", title: "Works with your calendar", body: "Checks actual availability before offering a time and records confirmed appointments." },
  { no: "03", title: "Follows up automatically", body: "Sends confirmations and reminders through the channels your patients already use." },
  { no: "04", title: "Leaves a clear audit trail", body: "Every completed action and handoff is visible, so staff can review what the system did." },
];

const PILOT_STEPS = [
  { tag: "Week 1", title: "Map", body: "Choose one routine call, approved answers, escalation rules, and the result staff need to receive." },
  { tag: "Week 2", title: "Build", body: "Configure Lisa’s voice, knowledge, booking steps, notifications, and visible audit trail." },
  { tag: "Week 3", title: "Test", body: "Your team makes controlled calls, reviews transcripts, and corrects language or edge cases." },
  { tag: "Launch review", title: "Decide", body: "Review answered calls, safe handoffs, captured bookings, and whether the workflow should expand." },
];

const PILOT_INCLUDES = ["One inbound call flow", "Approved FAQ set", "Human handoff rules", "Call logs", "Staff summaries"];

const FAQS = [
  { q: "Does Lisa replace reception staff?", a: "No. Lisa handles repeatable administrative calls and gives staff a clear handoff when judgment or personal attention is required." },
  { q: "What happens with an emergency or clinical question?", a: "Lisa does not diagnose or recommend treatment. Urgent, distressed, clinical, or unclear conversations follow the clinic’s approved escalation instructions." },
  { q: "Can we use our existing number?", a: "Often, yes, through forwarding, porting, or a compatible provider. The right route depends on the country, carrier, and whether the number must also support WhatsApp." },
  { q: "Can a human take over?", a: "Yes. The workflow can notify staff, transfer eligible calls, or collect a callback request with the context already summarised." },
  { q: "Are calls recorded?", a: "Recording is optional. If enabled, disclosure, access, retention, and deletion rules must be agreed before launch." },
  { q: "What happens when the AI is uncertain?", a: "It should say it is unsure, avoid inventing an answer, capture the request, and send it to an authorised person." },
];

export default async function ClinicVoiceAgents() {
  const content = await api.content().catch(() => null);

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <SectionLabel>AI call handling for clinics</SectionLabel>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-8 text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
                Your <span className="text-accent">front desk</span> is busy. Your phone still gets
                answered.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-2">
                A voice agent handles routine calls, captures the right details, books available
                appointments, and sends the conversation to your team, without giving medical advice
                or pretending to be a clinician.
              </p>
            </Reveal>
            <Reveal delay={220} className="mt-8 flex flex-wrap gap-4">
              <Link href={`/book${BOOK_UTM}`} className={cn(buttonVariants({ size: "lg" }), "group")}>
                Book a clinic demo
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <a href="#clinic-workflow" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                See the call flow
              </a>
            </Reveal>
            <Reveal delay={260} className="mt-8 flex flex-wrap gap-3">
              <a
                href={`tel:${CALL_NUMBER}`}
                className="flex items-center gap-2.5 rounded-full border border-hairline bg-bg-2/60 px-4 py-2.5 text-sm text-text-2 transition-colors hover:border-accent/40 hover:text-text glass"
              >
                <Phone className="size-4 text-accent" /> Call Lisa now
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-full border border-hairline bg-bg-2/60 px-4 py-2.5 text-sm text-text-2 transition-colors hover:border-accent/40 hover:text-text glass"
              >
                <MessageCircle className="size-4 text-accent" /> WhatsApp Lisa
              </a>
            </Reveal>
            <Reveal delay={300} className="mt-6 flex items-center gap-3 rounded-[var(--radius)] border border-hairline bg-bg-2/40 px-4 py-3 glass">
              <ShieldCheck className="size-5 shrink-0 text-accent" />
              <p className="text-sm text-text-2">
                <span className="font-semibold text-text">Built-in boundary, </span>
                Scheduling and information only. Clinical questions go to staff.
              </p>
            </Reveal>
          </div>

          {/* Interactive Voice Demo */}
          <Reveal delay={200} className="lg:col-span-5">
            <VoiceDemo />
          </Reveal>
        </div>
      </section>

      {/* ── WORKFLOW ────────────────────────────────────────── */}
      <section id="clinic-workflow" className="scroll-mt-24 border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="01">One routine call</SectionLabel>
            <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Handled end to end.
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">
              The agent does not replace clinical judgment. It removes the repeatable call work
              around it.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {PROCESS_STEPS.map((step, i) => (
              <Reveal
                key={step.title}
                delay={i * 90}
                className="flex flex-col rounded-[var(--radius)] border border-hairline bg-bg/60 p-6 glass"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text">{step.title}</span>
                  <span className="label text-muted">{step.label}</span>
                </div>
                {step.caller && (
                  <div className="mt-4 flex items-center gap-3">
                    <span className="tilt-3d tilt-3d-tile grid size-9 shrink-0 place-items-center rounded-full border border-hairline bg-bg-2 text-xs font-semibold text-text-2 glass">
                      AM
                    </span>
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm text-text">{step.caller}</strong>
                      <small className="text-xs text-text-2">{step.meta}</small>
                    </div>
                    <em className="text-xs not-italic text-accent">Live</em>
                  </div>
                )}
                {step.transcript && (
                  <p className="mt-4 rounded-[var(--radius)] border border-hairline bg-bg-2/60 p-3 text-sm text-text-2 glass">
                    {step.transcript}
                  </p>
                )}
                <div className="mt-4 flex-1 space-y-2">
                  {step.fields.map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-sm">
                      <span className="text-muted">{k}</span>
                      <strong className="text-text">{v}</strong>
                    </div>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-2 border-t border-hairline pt-4 text-xs text-text-2">
                  <Check className="size-3.5 shrink-0 text-accent" />
                  {step.footer}
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOUNDARY ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionLabel index="02">Designed to know its limits</SectionLabel>
            <h2 className="mt-6 text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Administrative confidence. Clinical restraint.
            </h2>
            <p className="mt-5 text-text-2">
              The safe system is not the one that answers everything. It is the one that knows
              exactly when to stop and hand the conversation to a person.
            </p>
          </Reveal>
          <div className="space-y-2.5 lg:col-span-7">
            {BOUNDARY_YES.map((item) => (
              <div
                key={item}
                className="flex items-center gap-4 rounded-[var(--radius)] border border-accent/30 bg-accent/[0.04] px-5 py-4"
              >
                <Check className="size-4 shrink-0 text-accent" />
                <span className="label shrink-0 text-accent">Agent handles</span>
                <strong className="text-text">{item}</strong>
              </div>
            ))}
            {BOUNDARY_NO.map((item) => (
              <div
                key={item}
                className="flex items-center gap-4 rounded-[var(--radius)] border border-hairline bg-bg-2/50 px-5 py-4 glass"
              >
                <X className="size-4 shrink-0 text-muted" />
                <span className="label shrink-0 text-muted">Human handoff</span>
                <strong className="text-text">{item}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CAPABILITIES ────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="03">Built around your practice</SectionLabel>
            <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Not another isolated phone bot.
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">
              The useful build connects the call to the systems and people who need the result.
            </p>
          </Reveal>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.no} delay={i * 80} className="rounded-[var(--radius)] border border-hairline bg-bg/60 p-6 glass">
                <span className="label text-accent">{c.no}</span>
                <h3 className="mt-4 font-semibold text-text">{c.title}</h3>
                <p className="mt-2 text-sm text-text-2">{c.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── PILOT ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="04">A controlled first deployment</SectionLabel>
          <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            Start with one call your team repeats every day.
          </h2>
          <p className="mt-5 max-w-2xl text-text-2">
            The pilot proves the workflow with monitored conversations before anything expands.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {PILOT_STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 80}>
              <span className="label text-accent">{s.tag}</span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-text-2">{s.body}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={320} className="mt-12 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 glass">
          <strong className="text-text">Pilot includes</strong>
          {PILOT_INCLUDES.map((p) => (
            <span key={p} className="label rounded-full border border-hairline px-3 py-1.5 text-text-2">
              {p}
            </span>
          ))}
          <Link href="/pricing" className="label ml-auto inline-flex items-center gap-2 text-accent">
            See implementation starting points
            <ArrowRight className="size-3.5" />
          </Link>
        </Reveal>
      </section>

      {/* ── ROI CALCULATOR ──────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="mb-12">
            <SectionLabel index="05">Missed-call opportunity</SectionLabel>
            <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              What could one answered call be worth?
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">
              Use your own operating assumptions. This estimates opportunity, not guaranteed revenue.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <ClinicRoiCalculator />
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="06">Before a clinic trusts the line</SectionLabel>
          <h2 className="mt-6 max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            The questions worth asking.
          </h2>
          <p className="mt-5 max-w-2xl text-text-2">
            A useful voice agent is defined as much by its limits as by what it can do.
          </p>
        </Reveal>
        <div className="mt-16 grid gap-4 md:grid-cols-2">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={(i % 2) * 80}>
              <details className="group rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 open:border-accent/40 glass">
                <summary className="cursor-pointer list-none font-semibold text-text marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="shrink-0 text-accent transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm text-text-2">{f.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200} className="mt-8 flex flex-col items-start justify-between gap-6 rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 sm:flex-row sm:items-center glass">
          <div>
            <strong className="text-text">Safety is part of the build.</strong>
            <p className="mt-1 text-sm text-text-2">
              See how disclosure, consent, recordings, data retention, and human escalation are
              handled.
            </p>
          </div>
          <Link href="/ai-safety" className={cn(buttonVariants({ variant: "secondary" }), "shrink-0")}>
            Read the trust &amp; safety approach
          </Link>
        </Reveal>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <div className="flex justify-center">
              <SectionLabel>Start with your busiest call</SectionLabel>
            </div>
            <h2 className="mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              Show me what your front desk repeats every day.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-text-2">
              I&rsquo;ll map one practical call flow and show you where a voice agent should, and
              should not, act.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href={`/book${BOOK_UTM}`} className={cn(buttonVariants({ size: "lg" }), "group")}>
                Book a clinic demo
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href={`/contact${BOOK_UTM}`} className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Describe your call flow
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href={`tel:${CALL_NUMBER}`} className="label inline-flex items-center gap-2 text-accent">
                <Phone className="size-3.5" /> Call Lisa
              </a>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="label inline-flex items-center gap-2 text-accent">
                <MessageCircle className="size-3.5" /> WhatsApp Lisa
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
