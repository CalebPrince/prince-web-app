import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TiltCard } from "@/components/TiltCard";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { api, type SiteContent } from "@/lib/api";

// Pricing page. Every figure and every line of tier copy is admin-editable
// and fetched from /api/v1/content, never hardcoded: `website_tier_1..3_*`
// for the website packages this page leads with, `pricing_tier_1..3_*` for
// the AI agent tiers, and `pricing_tier_5_*` for the ad creative add-on.
// The defaults below mirror the seeded settings and are only ever shown if
// that fetch fails.
//
// The website figures are the ones already published elsewhere on the site
// (websites from GHS 5,000, web applications from GHS 15,000, mobile app
// MVPs from GHS 35,000), so a stale fallback still quotes real numbers.


const WEBSITE_DEFAULTS = [
  {
    name: "Business Website",
    price: "From GHS 5,000",
    tagline:
      "A designed, responsive site that explains what you do and makes it easy for a customer to get in touch.",
    features:
      "Page structure planned around your customers\nCustom design, reviewed before development\nResponsive layouts for phone, tablet and desktop\nContact or enquiry forms\nLaunch, handover and basic analytics",
  },
  {
    name: "Custom Web Application",
    price: "From GHS 15,000",
    tagline:
      "A tool, portal or dashboard built around how your business actually runs, not around a template.",
    features:
      "Accounts, roles and permissions\nWorkflows and data modelled to your process\nIntegrations with the tools you already use\nPayments where the work calls for them\nStaged delivery with review points",
  },
  {
    name: "Mobile App MVP",
    price: "From GHS 35,000",
    tagline:
      "iOS and Android from one codebase, scoped down to the smallest version worth putting in front of customers.",
    features:
      "iOS and Android from a single build\nCore journeys designed and tested\nAPI and backend integration\nStore submission support\nA plan for what comes after launch",
  },
];

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
    name: "Video & Image Ads",
    tagline:
      "Scroll-stopping video and image ad creative for Meta, TikTok, and Google, scripted, produced, and delivered ready to launch.",
    features:
      "3-5 short-form video ads or a static image ad set\nPlatform-optimized formats (Meta, TikTok, Google)\nScripting, captions, and on-brand visuals\nOne round of revisions included",
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

  // Lisa's own monthly tiers are edited on Admin -> Lisa. Quoting her entry
  // price here from anything but those settings means this page keeps
  // advertising an old figure the day they are raised.
  const lisaFrom = [
    field(content, "lisa_tier_1_price_ghs", "GHS 800"),
    field(content, "lisa_tier_1_price_usd", "$55"),
  ].join(" / ");

  const websitePackages = WEBSITE_DEFAULTS.map((d, i) => ({
    name: field(content, `website_tier_${i + 1}_name`, d.name),
    from: field(content, `website_tier_${i + 1}_price`, d.price),
    blurb: field(content, `website_tier_${i + 1}_tagline`, d.tagline),
    features: features(content, `website_tier_${i + 1}_features`, d.features),
  }));

  // Tier 5 only: the websites-and-apps add-on that used to sit here is now
  // the section the page opens with.
  const addons = ADDON_DEFAULTS.map((d) => ({
    name: field(content, "pricing_tier_5_name", d.name),
    blurb: field(content, "pricing_tier_5_tagline", d.tagline),
    features: features(content, "pricing_tier_5_features", d.features),
    cta: d.cta,
  }));

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-14 md:px-10 md:pt-36 md:pb-16">
          <Reveal>
            <SectionLabel>Pricing</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              What a project costs,
              <br />
              <span className="text-accent">written down before we start.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              {field(
                content,
                "pricing_intro",
                "Starting points for the work I take on most often, with websites first. Every project is quoted on its own scope and confirmed in a written agreement before anything begins.",
              )}
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 01 · WEBSITE PACKAGES ───────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-8 md:px-10">
        <Reveal className="mb-10 max-w-2xl">
          <SectionLabel index="01">Website design and development</SectionLabel>
          <h2 className="mt-6 text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            Start with the website.
          </h2>
          <p className="mt-4 text-text-2">
            Design and development, quoted on the pages and features you actually need. Each one is
            scoped in writing before work starts.
          </p>
        </Reveal>
        <div className="grid gap-6 lg:grid-cols-3">
          {websitePackages.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <TiltCard
                maxTilt={5}
                className="relative flex h-full flex-col rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 transition-colors hover:border-accent/30 md:p-10"
              >
                <h3 className="text-2xl font-bold tracking-tight md:text-3xl">{p.name}</h3>
                <p className="mt-3 text-text-2">{p.blurb}</p>

                <div className="mt-8 border-t border-hairline pt-6">
                  <span className="label text-muted">From</span>
                  <p className="mt-1 text-[clamp(1.8rem,3vw,2.6rem)] font-extrabold tracking-[-0.03em]">
                    {p.from}
                  </p>
                  <span className="label text-muted">quoted on your scope</span>
                </div>

                <ul className="mt-8 flex-1 space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-3 text-text-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <IntakeCta
                  kind="project"
                  openHref="/request?service=website-design"
                  openVariant={i === 0 ? "primary" : "secondary"}
                  size="default"
                  arrow={false}
                  className="mt-8 w-full"
                >
                  Request a quote
                </IntakeCta>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 02 · AI AGENT TIERS ─────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-8 md:px-10">
        <Reveal className="mb-10">
          <SectionLabel index="02">AI agents and automation</SectionLabel>
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
            <SectionLabel index="03">What changes month to month</SectionLabel>
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
            <SectionLabel index="04">Also available</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              Ad creative, when the site needs traffic.
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
                and is priced separately in GHS and USD, from {lisaFrom} a month.
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
