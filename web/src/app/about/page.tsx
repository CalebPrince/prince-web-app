import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CareerTimeline } from "@/components/career-timeline";
import { GithubActivity } from "@/components/github-activity";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About",
  description:
    "Prince Caleb builds AI voice agents, chatbots, and business automations on 12+ years of custom web & mobile engineering, not templates.",
};

const PRINCIPLES = [
  { tag: "[PERFORMANCE]", title: "Zero bloat by default", body: "If a dependency does not earn its cost in speed, clarity, or reliability, it stays out of the system.", metric: "Lean", metricLabel: "First build mode" },
  { tag: "[SECURITY]", title: "Trust from the first line", body: "Input validation, prepared statements, role boundaries, and least-privilege access are part of the initial architecture.", metric: "Day 01", metricLabel: "Security posture" },
  { tag: "[COMMUNICATION]", title: "Plain-language delivery", body: "You know what is being built, why it matters, what it costs, and what tradeoffs are being made.", metric: "Clear", metricLabel: "Project signal" },
];

const TECH = ["PHP", "JavaScript", "React", "React Native", "WordPress", "MySQL", "PostgreSQL", "REST APIs", "Custom AI Integrations"];

export default function AboutPage() {
  return (
    <main>
      {/* Interior-page hero — a single deliberate text block (unlike the
          homepage's split grid), ported from public/about.html's
          .hero.agency-hero with a col-lg-7/col-lg-5 row: intro copy beside
          the "Operating profile" value panel. */}
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-12 lg:items-center lg:gap-14">
          <div className="lg:col-span-7">
            <p className="hero-animate hero-animate-1 mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// About</p>
            <h1 className="hero-animate hero-animate-2 mb-3 text-5xl font-bold md:text-6xl">
              Hi, I&apos;m <span className="text-editorial-accent-strong">Prince</span> Caleb.
            </h1>
            <p className="hero-animate hero-animate-3 max-w-2xl text-lg leading-[1.65] text-ink-soft">
              I build AI voice agents, chatbots, and business automations, on top of 12+ years of custom web and
              mobile engineering, instead of bending businesses to fit a template. I care about the same three
              things on every project: it has to be fast, it has to be secure, and it has to be something you can
              actually maintain after I hand it over.
            </p>
          </div>
          <div className="hero-animate hero-animate-3 mt-10 max-w-md rounded-2xl border border-line bg-card p-5 lg:col-span-5 lg:mt-0">
            <span className="mb-3 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
              Operating profile
            </span>
            {[
              ["Mode", "Direct builder"],
              ["Bias", "Small, fast, maintainable"],
              ["Standard", "Secure from day one"],
              ["Delivery", "No template dependency"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-t border-line py-[0.9rem] first:border-t-0">
                <strong className="text-[0.9rem] text-heading">{k}</strong>
                <span className="text-right text-[0.86rem] text-ink-soft">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* How I got here */}
      <section className="py-20">
        <div className="reveal mx-auto max-w-[760px] px-4 sm:px-6">
          <h3 className="mb-3 text-2xl font-bold">How I got here</h3>
          <p className="text-ink-soft">
            I started out building small sites and scripts, and quickly found the parts of the job I actually
            loved: figuring out the real shape of a problem, then building the smallest, cleanest thing that solves
            it. Over time that turned into full-stack API work, CMS architecture, and cross-platform mobile
            development, but the core habit never changed: understand the business first, write the code second.
          </p>
          <p className="mt-4 text-ink-soft">
            Today I work directly with founders, small firms, and teams who need something built right the first
            time, not a stack of plugins bolted together, and not a six-month agency engagement for a problem that
            doesn&apos;t need one.
          </p>
        </div>
      </section>

      {/* Engineering principles — hairline list, ported from .archive-list/.archive-entry */}
      <section className="border-t border-line py-20" id="principles">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="reveal reveal-on-scroll mb-8">
            <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
              // Engineering principles
            </span>
            <h2 className="max-w-2xl text-3xl font-bold md:text-4xl">The operating rules behind the work.</h2>
          </div>
          <div className="border-t border-line">
            {PRINCIPLES.map((p, i) => (
              <div
                key={p.title}
                className={cn(
                  "reveal reveal-on-scroll grid items-start gap-6 border-b border-line py-8",
                  i > 0 && `reveal-delay-${i}`
                )}
                style={{ gridTemplateColumns: "minmax(160px, 0.32fr) minmax(0, 1fr) minmax(130px, 0.22fr)" }}
              >
                <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">{p.tag}</span>
                <div>
                  <h3 className="mb-[0.65rem] text-lg font-bold text-heading">{p.title}</h3>
                  <p className="max-w-[68ch] text-ink-soft">{p.body}</p>
                </div>
                <div className="justify-self-end border-l border-line pl-4 text-right">
                  <strong className="block text-[clamp(1.35rem,3vw,2.1rem)] leading-none text-heading">{p.metric}</strong>
                  <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">{p.metricLabel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Career timeline */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-[700px] px-4 sm:px-6">
          <h3 className="mb-2 text-center text-2xl font-bold">How the journey&apos;s gone so far</h3>
          <p className="mb-10 text-center text-ink-soft">Tap a stage to read more.</p>
          <CareerTimeline />
        </div>
      </section>

      {/* Tech I work with */}
      <section className="border-t border-line py-20">
        <div className="reveal mx-auto max-w-6xl px-4 text-center sm:px-6">
          <p className="mb-4 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">Tech I work with</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {TECH.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-[0.4rem] rounded-lg border border-line px-[0.9rem] py-[0.45rem] font-mono text-[0.8rem] text-ink"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      <GithubActivity />

      {/* Closing CTA — dark inverted panel, ported from .agency-cta (distinct
          from the homepage's closing CTA, which stays on the light bg) */}
      <section className="border-t border-line border-b bg-heading py-20 text-center text-bg">
        <div className="reveal mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Want to work together?</h2>
          <p className="mb-6 text-lg opacity-90">A short discovery call is the fastest way to find out if we&apos;re a fit.</p>
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
