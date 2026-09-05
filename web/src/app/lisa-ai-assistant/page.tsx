import Link from "next/link";
import {
  CalendarCheck,
  UserPlus,
  AlertTriangle,
  Send,
  Calendar,
  Users,
  MessageSquare,
  Mail,
  CreditCard,
  Database,
  Check,
  X,
  Phone,
  MessageCircle,
  Globe,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { api, type SiteContent } from "@/lib/api";
import { LisaVideoAgent } from "@/components/LisaVideoAgent";

// Lisa - AI assistant sub-brand. Hero copy, the pricing-section intro, and
// all four tiers are admin-editable (Admin -> Lisa, the same `lisa_*`
// settings princecaleb.dev/lisa-ai-assistant.html reads), so they're
// fetched from /api/v1/content. Everything else here (situations,
// connections, control) is fixed marketing copy, same as the legacy page.

const CHANNELS: { icon: LucideIcon; label: string }[] = [
  { icon: Phone, label: "Phone" },
  { icon: MessageCircle, label: "WhatsApp" },
  { icon: Globe, label: "Web chat" },
];

const SITUATIONS: {
  icon: LucideIcon;
  title: string;
  body: string;
  quote: string;
  reply: string;
  steps: string[];
}[] = [
  {
    icon: CalendarCheck,
    title: "A caller needs a Thursday appointment.",
    body: "Lisa checks approved availability, confirms the caller’s details, books the slot, and leaves a clean record for the front desk.",
    quote: "Can I book a consultation for Thursday morning?",
    reply: "Yes. I have 10:30 available. Shall I reserve it for you?",
    steps: ["Understands the request", "Checks live availability", "Confirms and records the booking"],
  },
  {
    icon: UserPlus,
    title: "A new enquiry becomes a useful lead.",
    body: "Lisa asks the questions your sales team needs, records the answers in your CRM, scores the opportunity, and gives the right person the context.",
    quote: "I need a two-bedroom apartment in East Legon within three months.",
    reply: "What budget range are you working with, and would you prefer furnished or unfurnished?",
    steps: ["Captures budget and timeline", "Creates the CRM contact", "Assigns the best sales owner"],
  },
  {
    icon: AlertTriangle,
    title: "An urgent issue reaches a person with context.",
    body: "Lisa recognizes when automation should stop. She alerts the right team, shares a concise summary, and tells the customer what will happen next.",
    quote: "My payment went through twice and I need someone to check it today.",
    reply: "I have marked this as urgent and alerted the accounts team with your transaction details.",
    steps: ["Detects urgency and sentiment", "Pauses automated replies", "Alerts a person on priority channels"],
  },
  {
    icon: Send,
    title: "No reply does not mean the lead is forgotten.",
    body: "Lisa follows the timing and tone you approve, personalizes the message from the CRM record, and stops immediately when the customer replies.",
    quote: "Hi Yaw, I wanted to clarify the handover and support included in the proposal…",
    reply: "Message scheduled, and paused the moment Yaw responds.",
    steps: ["Watches the approved schedule", "Sends a relevant message", "Records replies and next actions"],
  },
];

const CONNECTIONS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Calendar,
    title: "Calendars",
    body: "Check availability, create bookings, reschedule appointments, and send reminders.",
  },
  {
    icon: Users,
    title: "CRMs",
    body: "Create contacts, qualify opportunities, update stages, assign owners, and record interactions.",
  },
  {
    icon: MessageSquare,
    title: "Team communication",
    body: "Post summaries, alert the right channel, request approval, and escalate urgent conversations.",
  },
  {
    icon: Mail,
    title: "Email and marketing",
    body: "Send confirmations, nurture leads, stop sequences on reply, and keep context together.",
  },
  {
    icon: CreditCard,
    title: "Payments and documents",
    body: "Share payment links, confirm payments, issue receipts, and prepare approved documents.",
  },
  {
    icon: Database,
    title: "Your internal tools",
    body: "Connect custom databases, admin dashboards, inventory tools, help desks, and APIs.",
  },
];

const CAN_DO = [
  "Read approved business information",
  "Create calendar appointments",
  "Update customer records",
  "Send approved follow-ups",
];

const NEEDS_HUMAN = ["Issue refunds or financial decisions", "Handle sensitive or unclear requests"];

const TIER_DEFAULTS = [
  {
    tag: "Starter",
    ghs: "GHS 800",
    usd: "$55",
    blurb: "One channel, answering the questions and requests that come in every day.",
    features: "One channel: WhatsApp or web chat\nApproved FAQ and lead capture\nMonthly conversation summary",
  },
  {
    tag: "Growth",
    ghs: "GHS 2,000",
    usd: "$140",
    blurb: "Voice and messaging together, connected to the calendar and CRM your team already uses.",
    features:
      "Voice, WhatsApp, and web chat\nOne CRM or calendar integration\nHuman escalation and notifications\nMonthly reporting dashboard",
    featured: true,
  },
  {
    tag: "Scale",
    ghs: "GHS 4,500",
    usd: "$300",
    blurb: "Every channel plus a live AI video agent, connected to your apps and CRMs with priority support.",
    features:
      "All channels, including social inboxes\nLive AI video agent with an agreed monthly allowance\nMultiple CRM, app, and social integrations\nPriority support and monthly optimisation\nFull audit trail and reporting",
  },
];

const CUSTOM_TIER_DEFAULT = {
  name: "Custom",
  tagline: "A workflow built around your exact tools, volume, and compliance needs, priced once we've scoped it.",
  features: "Unlimited channels and integrations\nCustom-trained branded video avatar\nDedicated workflows and safeguards\nA named point of contact",
  cta: "Talk to us",
};

function field(content: SiteContent | null, key: string, fallback: string): string {
  return content?.[key]?.trim() || fallback;
}

function features(content: SiteContent | null, key: string, fallback: string): string[] {
  return field(content, key, fallback)
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

function eyebrow(content: SiteContent | null, key: string, fallback: string): string {
  return field(content, key, fallback).replace(/^\/\/\s*/, "");
}

// Reads admin-editable copy from /api/v1/content on every request. Not ISR:
// a revalidating route writes its rendered .html on the server, and the FTP
// deploy can then serve that stale file against chunks it has just replaced.
export const dynamic = "force-dynamic";

export default async function Lisa() {
  const content = await api.content().catch(() => null);

  const tiers = TIER_DEFAULTS.map((d, i) => ({
    ...d,
    tag: field(content, `lisa_tier_${i + 1}_name`, d.tag),
    ghs: field(content, `lisa_tier_${i + 1}_price_ghs`, d.ghs),
    usd: field(content, `lisa_tier_${i + 1}_price_usd`, d.usd),
    blurb: field(content, `lisa_tier_${i + 1}_tagline`, d.blurb),
    features: features(content, `lisa_tier_${i + 1}_features`, d.features),
  }));

  const customTier = {
    tag: field(content, "lisa_custom_tier_name", CUSTOM_TIER_DEFAULT.name),
    blurb: field(content, "lisa_custom_tier_tagline", CUSTOM_TIER_DEFAULT.tagline),
    features: features(content, "lisa_custom_tier_features", CUSTOM_TIER_DEFAULT.features),
    cta: field(content, "lisa_custom_tier_cta_label", CUSTOM_TIER_DEFAULT.cta),
  };

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[160px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto grid max-w-[1400px] items-center gap-12 px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-24 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Reveal>
              <SectionLabel>{eyebrow(content, "lisa_page_eyebrow", "// Meet Lisa")}</SectionLabel>
            </Reveal>
            <Reveal delay={80}>
              <p className="label mt-6 text-muted">AI assistant by Prince Caleb</p>
              <h1 className="page-hero-title mt-3">
                One assistant.
                <br />
                <span className="text-accent">Your tools, connected.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">
                {field(
                  content,
                  "lisa_page_subheadline",
                  "Lisa answers calls and messages, understands what a customer needs, completes the next task in the tools your team already uses, and brings a person in when judgment is required.",
                )}
              </p>
            </Reveal>
            <Reveal delay={220} className="mt-8 flex flex-wrap gap-2.5">
              {CHANNELS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-hairline bg-bg-2/60 px-4 py-2 text-sm text-text-2 glass"
                >
                  <Icon className="size-4 text-accent" aria-hidden="true" />
                  {label}
                </span>
              ))}
            </Reveal>
            <Reveal delay={280} className="mt-10 flex flex-col gap-4 sm:flex-row">
              <IntakeCta kind="booking">Plan your Lisa workflow</IntakeCta>
              <a href="#pricing" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                See pricing
              </a>
            </Reveal>
          </div>

          {/* Presenter */}
          <Reveal delay={200} className="lg:col-span-5">
            <LisaVideoAgent />
          </Reveal>
        </div>
      </section>

      {/* ── VIDEO IDENTITY ──────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-28">
          <Reveal className="max-w-3xl">
            <SectionLabel index="01">A human presence</SectionLabel>
            <h2 className="mt-6 text-[clamp(1.8rem,4.5vw,3.4rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              A human presence. The same connected intelligence.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-text-2">
              Lisa’s visual presenter is designed for natural video conversations. The same face
              appears before and during website calls, while her connected workflows continue to
              handle the real work behind the conversation.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── REAL SITUATIONS ─────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="02">Real situations</SectionLabel>
          <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            See the work after the conversation.
          </h2>
          <p className="mt-5 max-w-2xl text-text-2">
            Each example shows what the customer says, what Lisa understands, and what your team
            sees next.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {SITUATIONS.map(({ icon: Icon, title, body, quote, reply, steps }, i) => (
            <Reveal
              key={title}
              delay={(i % 2) * 90}
              className="flex flex-col rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 transition-colors hover:border-accent/40 md:p-10 glass"
            >
              <div className="flex size-12 items-center justify-center rounded-[var(--radius)] border border-hairline bg-bg text-accent">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-tight md:text-2xl">{title}</h3>
              <p className="mt-3 text-text-2">{body}</p>

              {/* Mini conversation */}
              <div className="mt-6 space-y-2.5">
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm border border-hairline bg-bg px-4 py-2.5 text-sm text-text-2">
                  {quote}
                </p>
                <p className="max-w-[85%] rounded-2xl rounded-bl-sm border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-text">
                  {reply}
                </p>
              </div>

              {/* Steps */}
              <ol className="mt-7 space-y-2 border-t border-hairline pt-6">
                {steps.map((s, si) => (
                  <li key={s} className="flex items-center gap-3 text-sm text-text-2">
                    <span className="label text-accent">0{si + 1}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CONNECTIONS ─────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="03">Connections</SectionLabel>
            <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Use the tools you already trust.
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">
              Lisa connects through approved APIs, webhooks, and automation platforms, without
              forcing your team to replace everything.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTIONS.map(({ icon: Icon, title, body }, i) => (
              <Reveal
                key={title}
                delay={(i % 3) * 70}
                className="rounded-[var(--radius)] border border-hairline bg-bg/60 p-7 transition-colors hover:border-accent/30 glass"
              >
                <Icon className="size-6 text-accent" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
                <p className="mt-2 text-text-2">{body}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-8">
            <p className="max-w-3xl text-sm text-muted">
              {field(
                content,
                "lisa_page_integrations_disclaimer",
                "Tool names describe possible integrations. Availability depends on the tool’s API, your account plan, permissions, and the workflow we approve together.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CONTROL ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-5">
            <SectionLabel index="04">Useful because it is controlled</SectionLabel>
            <h2 className="mt-6 text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Lisa knows what she may do, and when to stop.
            </h2>
            <p className="mt-5 text-text-2">
              Each deployment gets its own knowledge, tools, permissions, escalation rules, tone,
              operating hours, and audit trail. The goal is reliable assistance, not uncontrolled
              autonomy.
            </p>
          </Reveal>

          <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
            <Reveal className="rounded-[var(--radius)] border border-accent/30 bg-accent/[0.04] p-7">
              <p className="label text-accent">Lisa can</p>
              <ul className="mt-5 space-y-3">
                {CAN_DO.map((c) => (
                  <li key={c} className="flex gap-3 text-text-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={80} className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-7 glass">
              <p className="label text-muted">Needs a human first</p>
              <ul className="mt-5 space-y-3">
                {NEEDS_HUMAN.map((c) => (
                  <li key={c} className="flex gap-3 text-text-2">
                    <X className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    {c}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────────────────── */}
      <section id="pricing" className="scroll-mt-24 border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="05">{eyebrow(content, "lisa_pricing_eyebrow", "// One connected service")}</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              {field(content, "lisa_pricing_title", "Lisa, sold as one whole service.")}
            </h2>
            <p className="mt-5 max-w-2xl text-text-2">
              {field(
                content,
                "lisa_page_service_pitch",
                "Lisa isn’t a pile of separate tools you have to stitch together. She’s one monthly service, calls, WhatsApp, and web chat on one side, and your social media tools, apps, and CRMs connected on the other, all managed as a single subscription.",
              )}
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:grid-cols-4">
            {tiers.map((t, i) => (
              <Reveal
                key={t.tag}
                delay={i * 80}
                className={cn(
                  "relative flex flex-col rounded-[var(--radius)] border p-8",
                  t.featured ? "border-accent/50 bg-accent/[0.05]" : "border-hairline bg-bg/60",
                )}
              >
                {t.featured && (
                  <span className="absolute -top-3 left-8 rounded-full border border-accent/50 bg-bg px-3 py-1 text-[0.65rem] font-medium text-accent glow-green">
                    Most requested
                  </span>
                )}
                <span className="label text-accent">{t.tag}</span>
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-extrabold tracking-[-0.03em]">
                    {t.ghs}
                  </span>
                  {t.usd && <span className="label text-muted">/ {t.usd} /mo</span>}
                </div>
                <p className="mt-4 text-sm text-text-2">{t.blurb}</p>

                <ul className="mt-6 flex-1 space-y-2.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2.5 text-sm text-text-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <IntakeCta
                  kind="booking"
                  size="default"
                  openVariant={t.featured ? "primary" : "secondary"}
                  arrow={false}
                  className="mt-8 w-full"
                >
                  Get started
                </IntakeCta>
              </Reveal>
            ))}

            {/* Custom tier */}
            <Reveal delay={240} className="relative flex flex-col rounded-[var(--radius)] border border-hairline bg-bg/60 p-8 glass">
              <span className="label text-accent">{customTier.tag}</span>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-extrabold tracking-[-0.03em]">
                  Let&rsquo;s scope it
                </span>
              </div>
              <p className="mt-4 text-sm text-text-2">{customTier.blurb}</p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {customTier.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-text-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <IntakeCta
                kind="booking"
                size="default"
                openVariant="secondary"
                arrow={false}
                className="mt-8 w-full"
              >
                {customTier.cta}
              </IntakeCta>
            </Reveal>
          </div>

          <Reveal className="mt-8">
            <p className="max-w-3xl text-sm text-muted">
              The monthly fee covers Lisa’s connected service. Phone minutes, messaging, live video
              minutes, and AI usage beyond the agreed allowance are billed separately.
            </p>
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
            <div className="flex justify-center">
              <SectionLabel index="06">Start with one real workflow</SectionLabel>
            </div>
            <h2 className="mx-auto mt-6 max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              What should Lisa handle
              <br />
              <span className="text-accent">for your business?</span>
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-text-2">
              Bring the calls, messages, spreadsheets, calendars, and handoffs your team deals with
              today. We’ll map the smallest useful version first.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Plan your Lisa workflow</IntakeCta>
              <Link href="/contact" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Send a message
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
