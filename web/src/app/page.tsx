import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PoweredBySection,
  ServicesSection,
  ProcessSection,
  CaseStudiesSection,
  TestimonialsSection,
  FaqSection,
  ClosingCtaSection,
} from "@/components/home-sections";

// title.absolute bypasses the root layout's "%s, Prince Caleb" template —
// the original home.html's <title> already leads with "Prince Caleb",
// so applying the template would duplicate it at the end.
export const metadata: Metadata = {
  title: { absolute: "Prince Caleb, AI Voice Agents, Chatbots & Automation" },
  description: "Prince Caleb builds AI voice agents that answer business calls, chatbots, and workflow automations, engineered on 12+ years of custom web & mobile development.",
};

export default function HomePage() {
  return (
    <main>
      {/* Full-viewport hero — ported from public/home.html's
          .hero.agency-hero.hero-glow.hero-orbit section. Ambient glow orbs
          + headline + CTAs + trust rail match the original exactly; the
          hero-side-stack voice-demo mockup's live ElevenLabs wiring is
          follow-up work (tracked separately) — its static shell is ported
          here so the layout and visual weight match now. */}
      <header className="relative flex min-h-svh items-center overflow-hidden border-b border-line bg-bg pt-[clamp(6.6rem,11vh,8.4rem)] pb-[clamp(2rem,4vh,3rem)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-[4%] -top-[18%] size-[38vw] rounded-full bg-editorial-accent opacity-[0.16] blur-[120px] [animation:hero-glow-drift_11s_ease-in-out_infinite_alternate] motion-reduce:hidden"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[22%] -right-[10%] size-[38vw] rounded-full bg-editorial-accent opacity-[0.16] blur-[120px] [animation:hero-glow-drift_11s_ease-in-out_infinite_alternate] [animation-delay:-5.5s] motion-reduce:hidden"
        />

        {/* Desktop: two-column grid (text | voice-demo mockup), mockup
            vertically centered beside the copy — ported from app.css's
            `.home-page .agency-hero > .container` grid (≥992px). Below that
            breakpoint everything stacks, mockup last. */}
        <div className="relative z-[1] mx-auto max-w-6xl px-4 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(21rem,0.48fr)] lg:items-center lg:gap-[clamp(2rem,5vw,5rem)]">
          <div>
            <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
              // Stop losing enquiries to missed calls and slow follow-up
            </p>
            <h1 className="mb-4 max-w-4xl text-5xl font-bold md:text-6xl">
              Turn more enquiries into <span className="text-editorial-accent-strong">booked customers</span>, without
              adding more admin.
            </h1>
            <p className="mb-4 max-w-2xl text-lg leading-[1.65] text-ink-soft">
              I build AI voice agents, chat assistants and automations that answer quickly, capture the right details
              and move serious enquiries towards a booking.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="brand" size="pill" nativeButton={false} render={<a href="/book.html" />}>
                Book a 20-minute call
              </Button>
              <Button variant="brand-outline" size="pill" nativeButton={false} render={<Link href="/projects" />}>
                See client work
              </Button>
            </div>

            <div className="mt-4 grid max-w-2xl grid-cols-3 gap-[0.7rem]">
              <TrustStat value="12+" label="years shipping production software" />
              <TrustStat value="30+" label="projects delivered" />
              <TrustStat value="98%" label="client satisfaction" />
            </div>
          </div>

          <div className="mt-12 max-w-md lg:mt-0 lg:max-w-[27rem] lg:justify-self-end">
            <VoiceDemoMockup />
          </div>
        </div>
      </header>

      <PoweredBySection />
      <ServicesSection />
      <ProcessSection />
      <CaseStudiesSection />
      <TestimonialsSection />
      <FaqSection />
      <ClosingCtaSection />
    </main>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="grid gap-[0.2rem] rounded-xl border border-line bg-card/80 p-[0.72rem_0.8rem] text-[0.72rem] leading-[1.35] text-editorial-muted">
      <strong className="font-mono text-[0.98rem] font-extrabold text-heading">{value}</strong>
      {label}
    </span>
  );
}

function VoiceDemoMockup() {
  return (
    <article
      aria-label="Mockup of an AI voice agent handling a live booking call"
      className="relative w-full max-w-[27rem] overflow-hidden rounded-[20px] border border-line-strong bg-card shadow-lg md:ml-auto"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="inline-flex items-center gap-[0.55rem] text-heading">
          <span className="inline-block size-[0.48rem] rounded-full bg-[#20a36a] shadow-[0_0_0_4px_rgba(32,163,106,0.13)]" aria-hidden="true" />
          Voice demo ready
        </span>
        <span className="font-mono text-xs text-editorial-muted">00:00</span>
      </header>
      <div className="relative">
        <div className="flex items-center gap-3 p-4">
          <span
            aria-label="Lisa AI assistant"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-editorial-accent/50 bg-navy text-editorial-accent shadow-[0_0_0_4px_rgba(98,255,152,0.08)]"
          >
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-8">
              <circle cx="24" cy="24" r="18" />
              <path d="M15 25h3l2.4-8 4.4 15 3.4-11 2.1 6H34" />
              <path d="M18 37c3.8 2.1 8.2 2.1 12 0" />
            </svg>
          </span>
          <div className="flex-1">
            <strong className="block text-heading">Prince&apos;s Assistant</strong>
            <small className="text-editorial-muted">Try the live system with a real business question</small>
          </div>
          <span className="font-mono text-[0.68rem] font-semibold uppercase text-[#16835a]">Ready</span>
        </div>
        <div className="flex h-16 items-center justify-center gap-1 border-y border-line" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <i
              key={i}
              className="w-[3px] rounded-full bg-heading opacity-20"
              style={{ height: i % 3 === 2 ? "85%" : i % 2 === 0 ? "55%" : "20%" }}
            />
          ))}
        </div>
        <div className="p-4">
          <span className="block text-xs font-semibold uppercase tracking-wide text-editorial-muted">Voice agent</span>
          <p className="mt-1 text-sm text-ink-soft">
            Tap &ldquo;Start voice demo,&rdquo; then ask me what an AI voice agent could handle for your business.
          </p>
        </div>
        <div className="mx-4 mb-4 flex flex-wrap gap-[0.45rem]">
          {["After-hours calls", "Lead qualification", "Voice + WhatsApp handoff"].map((label) => (
            <Button key={label} type="button" variant="chip" size="chip">
              {label}
            </Button>
          ))}
        </div>
      </div>
    </article>
  );
}
