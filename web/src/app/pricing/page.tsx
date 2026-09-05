import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TiltCard } from "@/components/TiltCard";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { api, type SiteContent } from "@/lib/api";

// Pricing page - tier copy is admin-editable (Admin -> Pricing, the same
// `pricing_tier_1..5_*` settings princecaleb.dev/pricing.html reads), so it's
// fetched from /api/v1/content rather than hardcoded. Tiers 1-3 are the
// agent-workflow tiers; 4-5 are the add-on services (websites/apps, ads).
// These defaults mirror the settings table's own seeded defaults and are
// only ever shown if that fetch fails.

const TIER_META: { tag: string; outcome: string; featured?: boolean }[] = [
  { tag: "Starter", outcome: "Answer and route one repeatable call" },
  { tag: "Growth", outcome: "Continue the conversation on WhatsApp", featured: true },
  { tag: "Custom", outcome: "Build the complete digital operation" },
];

const TIER_DEFAULTS = [
  {
    name: "AI Voice Agent Pilot",
    price: "From GHS 5,000",
    tagline:
      "One focused call flow, trained on your approved information and tested before it reaches customers.",
    features:
      "One inbound call flow\nApproved FAQ and handoff rules\nCall logs and staff summaries\nLaunch review after monitored testing",
  },
  {
    name: "Voice + WhatsApp",
    price: "From GHS 15,000",
    tagline:
      "A connected customer-service system that carries context across calls, WhatsApp, bookings, and staff handoffs.",
    features:
      "AI voice and WhatsApp assistant\nCalendar or CRM integration\nHuman escalation and notifications\nReporting dashboard and audit trail",
  },
  {
    name: "AI Operations System",
    price: "From GHS 25,000",
    tagline:
      "Multiple agents and automations working across sales, service, follow-up, reporting, and internal operations.",
    features:
      "Multiple agent workflows\nCustom dashboards and integrations\nPermissions, monitoring, and safeguards\nOngoing optimisation and support",
  },
];

const ADDON_DEFAULTS = [
  {
    name: "Custom Websites & Mobile Apps",
    tagline:
      "Mobile app MVPs start from GHS 35,000. Every build is scoped around your customers and operation.",
    features:
      "Business and e-commerce websites\nCustom web applications from GHS 15,000\niOS and Android mobile app MVPs from GHS 35,000\nAPIs, payments, and third-party integrations\nLaunch support and ongoing improvements",
    cta: "Request a project",
  },
  {
    name: "Video & Image Ads",
    tagline:
      "Scroll-stopping video and image ad creative for Meta, TikTok, and Google, scripted, produced, and delivered ready to launch.",
    features:
      "3–5 short-form video ads or a static image ad set\nPlatform-optimized formats (Meta, TikTok, Google)\nScripting, captions, and on-brand visuals\nOne round of revisions included",
    cta: "Get a quote",
  },
];

const MODEL: { label: string; kind: string; body: string }[] = [
  {
    label: "Implementation",
    kind: "One-time",
    body: "Conversation design, approved knowledge, integrations, dashboard work, testing, and launch preparation.",
  },
  {
    label: "Calls and AI",
    kind: "Usage",
    body: "Phone minutes, voice generation, transcription, and language-model use vary with conversation volume.",
  },
  {
    label: "WhatsApp",
    kind: "Usage",
    body: "Messaging charges vary by message type, destination, provider, and the conversations customers start.",
  },
  {
    label: "Ongoing support",
    kind: "Optional",
    body: "Monitoring, prompt updates, new workflows, reporting, and operational improvements, retained monthly.",
  },
];

function field(content: SiteContent | null, key: string, fallback: string): string {
  return content?.[key]?.trim() || fallback;
}

function features(content: SiteContent | null, key: string, fallback: string): string[] {
  return field(content, key, fallback)
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

// Reads admin-editable copy from /api/v1/content on every request. Not ISR:
// a revalidating route writes its rendered .html on the server, and the FTP
// deploy can then serve that stale file against chunks it has just replaced.
export const dynamic = "force-dynamic";

export default async function Pricing() {
  const content = await api.content().catch(() => null);

  const tiers = TIER_META.map((meta, i) => ({
    ...meta,
    name: field(content, `pricing_tier_${i + 1}_name`, TIER_DEFAULTS[i].name),
    from: field(content, `pricing_tier_${i + 1}_price`, TIER_DEFAULTS[i].price),
    blurb: field(content, `pricing_tier_${i + 1}_tagline`, TIER_DEFAULTS[i].tagline),
    features: features(content, `pricing_tier_${i + 1}_features`, TIER_DEFAULTS[i].features),
  }));

  const addons = ADDON_DEFAULTS.map((d, i) => ({
    name: field(content, `pricing_tier_${i + 4}_name`, d.name),
    blurb: field(content, `pricing_tier_${i + 4}_tagline`, d.tagline),
    features: features(content, `pricing_tier_${i + 4}_features`, d.features),
    cta: d.cta,
  }));

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-14 md:px-10 md:pt-48 md:pb-16">
          <Reveal>
            <SectionLabel>Pricing</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              Start with one workflow.
              <br />
              <span className="text-accent">Expand after it works.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              {field(
                content,
                "pricing_intro",
                "Start with one useful workflow, prove it with real conversations, then expand. These are implementation starting points; telephony, messaging, and AI usage are billed separately.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── TIERS ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-8 md:px-10">
        <Reveal className="mb-10">
          <SectionLabel index="01">Choose the first useful outcome</SectionLabel>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-3">
          {tiers.map((t, i) => (
            <Reveal key={t.name} delay={i * 90}>
              <TiltCard
                maxTilt={5}
                className={cn(
                  "relative flex h-full flex-col rounded-[var(--radius)] border p-8 transition-colors md:p-10",
                  t.featured
                    ? "border-accent/50 bg-accent/[0.04]"
                    : "border-hairline bg-bg-2/50 hover:border-hairline-strong",
                )}
              >
                {t.featured && (
                  <span className="absolute -top-3 left-8 rounded-full border border-accent/50 bg-bg px-3 py-1 text-[0.65rem] font-medium text-accent glow-green">
                    Most requested
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <span className="label text-accent">[{t.tag}]</span>
                  <span className="label text-muted">{t.outcome.split(" ").slice(0, 3).join(" ")}…</span>
                </div>
                <h2 className="mt-6 text-2xl font-bold tracking-tight md:text-3xl">{t.name}</h2>
                <p className="mt-3 text-text-2">{t.blurb}</p>

                <div className="mt-8 border-t border-hairline pt-6">
                  <span className="label text-muted">Implementation from</span>
                  <p className="mt-1 text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold tracking-[-0.03em]">
                    {t.from}
                  </p>
                  <span className="label text-muted">one-time · usage billed separately</span>
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-3 text-text-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <IntakeCta
                  kind="booking"
                  openVariant={t.featured ? "primary" : "secondary"}
                  className="mt-8 w-full"
                >
                  Get a quote
                </IntakeCta>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PRICING MODEL ───────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <Reveal className="lg:col-span-4">
            <SectionLabel index="02">What changes month to month</SectionLabel>
            <h2 className="mt-6 text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Implementation and usage stay separate.
            </h2>
            <p className="mt-5 text-text-2">
              You can see what you pay to build the system and what increases only when customers
              actually call, message, or use AI.
            </p>
          </Reveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
            {MODEL.map((m, i) => (
              <Reveal
                key={m.label}
                delay={i * 70}
                className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-7 glass"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold tracking-tight">{m.label}</h3>
                  <span
                    className={cn(
                      "label rounded-full border px-3 py-1 text-[0.62rem]",
                      m.kind === "Usage"
                        ? "border-accent/40 text-accent"
                        : "border-hairline text-muted",
                    )}
                  >
                    {m.kind}
                  </span>
                </div>
                <p className="mt-3 text-text-2">{m.body}</p>
              </Reveal>
            ))}
            <Reveal className="sm:col-span-2">
              <p className="text-sm text-muted">
                Third-party prices can change. Current provider rates and expected volume are
                reviewed before you approve a launch.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── ADD-ON SERVICES ─────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="03">Beyond the agents</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Buy a working system, not a technology label.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {addons.map((a, i) => (
              <Reveal
                key={a.name}
                delay={i * 90}
                className="flex flex-col rounded-[var(--radius)] border border-hairline bg-bg/60 p-8 transition-colors hover:border-accent/30 md:p-10 glass"
              >
                <h3 className="text-2xl font-bold tracking-tight">{a.name}</h3>
                <p className="mt-3 text-text-2">{a.blurb}</p>
                <ul className="mt-8 flex-1 space-y-3">
                  {a.features.map((f) => (
                    <li key={f} className="flex gap-3 text-text-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className="label group mt-8 inline-flex items-center gap-2 text-accent"
                >
                  {a.cta}
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── LISA CALLOUT ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-24">
        <Reveal>
          <Link
            href="/lisa-ai-assistant"
            className="group flex flex-col justify-between gap-8 rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 transition-colors hover:border-accent/40 md:flex-row md:items-center md:p-12 glass"
          >
            <div>
              <span className="label text-accent">Meet Lisa</span>
              <h3 className="mt-4 text-[clamp(1.6rem,3.5vw,2.6rem)] font-bold tracking-[-0.02em]">
                An AI assistant with her own monthly tiers.
              </h3>
              <p className="mt-3 max-w-xl text-text-2">
                Lisa answers calls, WhatsApp, and web chat, works inside the tools you already use,
                and is priced separately in GHS and USD, from GHS 800 / $55 a month.
              </p>
            </div>
            <span className="label inline-flex shrink-0 items-center gap-2 text-accent">
              See Lisa&rsquo;s pricing
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </span>
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
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              Want an exact number?
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-lg text-text-2">
              Not sure which tier fits? A short discovery call gets your project scoped and quoted
              properly, with no vague ranges.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Get a quote</IntakeCta>
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
