import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PricingCheckout } from "@/components/pricing-checkout";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Starting-point pricing for AI voice agents, WhatsApp assistants, and connected business automation systems from Prince Caleb.",
};

const OUTCOMES = [
  { tag: "[STARTER]", title: "Answer and route one repeatable call", body: "Prove the voice, information boundaries, call handling, and staff handoff on a controlled workflow.", metric: "Pilot", metricLabel: "One call flow" },
  { tag: "[GROWTH]", title: "Continue the conversation on WhatsApp", body: "Add confirmations, reminders, follow-up, and a human-visible conversation history.", metric: "Connected", metricLabel: "Voice + messaging" },
  { tag: "[CUSTOM]", title: "Build the complete digital operation", body: "Connect multiple agents and automations, or add the custom website, web platform, or mobile app your operation needs.", metric: "Custom", metricLabel: "Staged rollout" },
];

const TIERS = [
  {
    name: "AI Voice Agent Pilot",
    price: "From GHS 5,000",
    tagline: "One focused call flow, trained on your approved information and tested before it reaches customers.",
    features: ["One inbound call flow", "Approved FAQ and handoff rules", "Call logs and staff summaries", "Launch review after monitored testing"],
    featured: false,
    checkout: true,
  },
  {
    name: "Voice + WhatsApp",
    price: "From GHS 15,000",
    tagline: "A connected customer-service system that carries context across calls, WhatsApp, bookings, and staff handoffs.",
    features: ["AI voice and WhatsApp assistant", "Calendar or CRM integration", "Human escalation and notifications", "Reporting dashboard and audit trail"],
    featured: true,
    badge: "Most requested",
  },
  {
    name: "AI Operations System",
    price: "From GHS 25,000",
    tagline: "Multiple agents and automations working across sales, service, follow-up, reporting, and internal operations.",
    features: ["Multiple agent workflows", "Custom dashboards and integrations", "Permissions, monitoring, and safeguards", "Ongoing optimisation and support"],
    featured: false,
  },
  {
    name: "Custom Websites & Mobile Apps",
    price: "Websites from GHS 5,000",
    tagline: "Mobile app MVPs start from GHS 35,000. Every build is scoped around your customers and operation.",
    features: [
      "Business and e-commerce websites",
      "Custom web applications from GHS 15,000",
      "iOS and Android mobile app MVPs from GHS 35,000",
      "APIs, payments, and third-party integrations",
      "Launch support and ongoing improvements",
    ],
    featured: false,
  },
];

const COST_BREAKDOWN = [
  { tag: "One-time", title: "Implementation", body: "Conversation design, approved knowledge, integrations, dashboard work, testing, and launch preparation." },
  { tag: "Usage", title: "Calls and AI", body: "Phone minutes, voice generation, transcription, and language-model use vary with conversation volume." },
  { tag: "Usage", title: "WhatsApp", body: "Messaging charges vary by message type, destination, provider, and the conversations customers start." },
  { tag: "Optional", title: "Ongoing support", body: "Monitoring, prompt updates, new workflows, reporting, and operational improvements can be retained monthly." },
];

export default function PricingPage() {
  return (
    <main>
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Pricing</p>
          <h1 className="mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            Start with one <span className="text-editorial-accent-strong">workflow</span>. Expand after it works.
          </h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Start with one useful workflow, prove it with real conversations, then expand. These are implementation
            starting points; telephony, messaging, and AI usage are billed separately.
          </p>
        </div>
      </header>

      {/* Choose the first useful outcome — hairline archive list */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
            // Choose the first useful outcome
          </span>
          <h2 className="mb-8 max-w-2xl text-3xl font-bold md:text-4xl">Buy a working system, not a technology label.</h2>
          <div className="border-t border-line">
            {OUTCOMES.map((o) => (
              <div
                key={o.title}
                className="grid items-start gap-6 border-b border-line py-8"
                style={{ gridTemplateColumns: "minmax(160px, 0.32fr) minmax(0, 1fr) minmax(130px, 0.22fr)" }}
              >
                <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">{o.tag}</span>
                <div>
                  <h3 className="mb-[0.65rem] text-lg font-bold text-heading">{o.title}</h3>
                  <p className="max-w-[68ch] text-ink-soft">{o.body}</p>
                </div>
                <div className="justify-self-end border-l border-line pl-4 text-right">
                  <strong className="block text-[clamp(1.35rem,3vw,2.1rem)] leading-none text-heading">{o.metric}</strong>
                  <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">{o.metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            {TIERS.map((t) => (
              <div
                key={t.name}
                className={
                  t.featured
                    ? "relative rounded-[22px] border border-editorial-accent p-10 shadow-lg"
                    : "relative rounded-[22px] border border-line p-10 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-1 hover:border-line-strong hover:bg-card"
                }
              >
                {t.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-heading px-3 py-1 text-xs font-semibold text-bg">
                    {t.badge}
                  </span>
                )}
                <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">{t.name}</span>
                <div className="mb-1 text-[2rem] font-extrabold text-heading">{t.price}</div>
                <p className="mb-3 text-ink-soft">{t.tagline}</p>
                <ul className="mb-4">
                  {t.features.map((f) => (
                    <li key={f} className="relative py-[0.35rem] pl-6 text-ink-soft">
                      <span className="absolute left-0 font-bold text-editorial-accent" aria-hidden="true">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {t.checkout && <PricingCheckout />}
                <Button
                  variant={t.featured ? "brand" : "brand-outline"}
                  size="pill"
                  className="w-full text-center"
                  nativeButton={false}
                  render={<a href="/request.html" />}
                >
                  Get a quote
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-line bg-bg-soft p-7">
            <div>
              <strong className="block text-[1.05rem] text-heading">Looking for Lisa specifically?</strong>
              <p className="mt-1 max-w-[55ch] text-[0.9rem] text-editorial-muted">
                She has her own monthly service tiers, priced in GHS and USD, connected to the social media tools,
                apps, and CRMs you already use.
              </p>
            </div>
            <Button variant="brand-outline" size="pill" className="group whitespace-nowrap" nativeButton={false} render={<Link href="/lisa-ai-assistant#lisa-pricing" />}>
              See Lisa&apos;s pricing{" "}
              <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                →
              </span>
            </Button>
          </div>

          <div className="mt-10 text-center">
            <p className="mb-3 text-ink-soft">Not sure which tier fits? Send over the details and I&apos;ll tell you honestly.</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button variant="brand" size="pill" className="group" nativeButton={false} render={<a href="/request.html" />}>
                Request a project{" "}
                <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </Button>
              <Button variant="brand-outline" size="pill" className="group" nativeButton={false} render={<Link href="/builder-os" />}>
                See the system live{" "}
                <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                  →
                </span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* What changes month to month */}
      <section className="border-t border-line bg-bg-soft py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// What changes month to month</p>
              <h2 className="max-w-2xl text-3xl font-bold md:text-4xl">Implementation and usage stay separate.</h2>
            </div>
            <p className="max-w-sm text-ink-soft">
              You can see what you pay to build the system and what increases only when customers actually call,
              message, or use AI.
            </p>
          </div>
          <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
            {COST_BREAKDOWN.map((c) => (
              <article key={c.title} className="border-r border-b border-line p-8">
                <span className="block font-mono text-[0.7rem] font-bold uppercase tracking-[0.09em] text-editorial-accent">{c.tag}</span>
                <h3 className="mb-[0.65rem] mt-8 text-[1.25rem] font-bold text-heading">{c.title}</h3>
                <p className="text-[0.86rem] leading-[1.65] text-editorial-muted">{c.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-3 text-sm text-editorial-muted">
            Third-party prices can change. Current provider rates and expected volume are reviewed before you approve a launch.
          </p>
        </div>
      </section>

      {/* Closing CTA — dark inverted panel */}
      <section className="border-t border-line border-b bg-heading py-20 text-center text-bg">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Want an exact number?</h2>
          <p className="mb-6 text-lg opacity-90">A short discovery call gets your project scoped and quoted properly, no vague ranges.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              variant="brand"
              size="pill"
              className="border-bg bg-bg text-heading hover:text-bg"
              nativeButton={false}
              render={<a href="/book.html" />}
            >
              Book a discovery call
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
