import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PortfolioShowcase } from "@/components/PortfolioShowcase";
import { SplitServices } from "@/components/SplitServices";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TechStrip } from "@/components/TechStrip";
import { VoiceDemo } from "@/components/VoiceDemo";
import { HeroOrbs } from "@/components/HeroOrbs";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { FaqAccordion } from "@/components/FaqAccordion";
import { GoogleRatingStrip } from "@/components/GoogleRatingStrip";
import { GoogleReviewCard } from "@/components/GoogleReviewCard";
import { QuarterlyAvailability } from "@/components/QuarterlyAvailability";
import { IntakeCta } from "@/components/IntakeCta";
import { PROJECT_STEPS as PROCESS, ProjectStandards } from "@/components/ProjectStandards";
import { WebsiteDesignPreview } from "@/components/WebsiteDesignPreview";
import { resolveQuarterlyIntake } from "@/lib/quarterly";


// Static fallback, used when /api/v1/content is unreachable, when no
// positioning override is set, and when today's generated headline has not
// been written yet. This is the plain statement of what the business does,
// so it is safe to show on any day the AI headline is missing.
const FALLBACK_HERO = {
  eyebrow: "Website Design • Development • AI",
  title: "Website design. Thoughtful development. **Clear commitments**.",
  subtitle:
    "I'm Prince Caleb, a website designer and developer in Accra, working worldwide. I create custom websites, applications and AI tools, with a written scope, agreed costs and a clear delivery process.",
};

// database/generate_daily_headline.php writes one AI-generated
// eyebrow/title/subtitle set per day; SettingsController::publicContent()
// overrides the static hero_* Site Content values with today's row when
// present, so this page has to re-render to pick a new headline up.
//
// Rendered per request rather than with `export const revalidate`, which
// took the homepage down on 2026-08-21. ISR writes the rendered page to
// nextjs-web/.next/server/app/index.html ON THE SERVER, and that file
// outlives the build that produced it. The deploy is a plain FTP sync plus
// a tmp/restart.txt touch, so there is a window after the new files land
// where the still-running OLD process can revalidate this route and write
// its OLD html back over the freshly uploaded copy. The new process then
// boots, serves that html, and every /_next/static/* chunk it references
// was deleted by the same sync -> stylesheet and scripts all 404 and the
// homepage renders as unstyled markup. It does not self-heal, because the
// accompanying .meta marks the entry as freshly generated.
//
// Every other route is either static (overwritten by the sync on each
// deploy) or force-dynamic, which is why only `/` broke. Rendering on
// demand costs two loopback calls to the PHP API per hit and keeps the
// markup permanently in lockstep with the running build's asset hashes.
export const dynamic = "force-dynamic";

// Renders a hero_title's single `**phrase**` marker (see
// generate_daily_headline.php's prompt) as the same accent-colored span the
// static fallback copy uses.
function renderHeroTitle(title: string): ReactNode {
  const match = title.match(/\*\*([^*]+)\*\*/);
  if (!match) return title;
  const start = match.index ?? 0;
  const before = title.slice(0, start);
  const after = title.slice(start + match[0].length);
  return (
    <>
      {before}
      <span className="text-accent">{match[1]}</span>
      {after}
    </>
  );
}

export default async function Home() {
  const [content, liveGoogleRating, landingGoogleReviews] = await Promise.all([
    api.content().catch(() => null),
    api.googleRating().catch(() => null),
    api.googleReviews("landing").catch(() => []),
  ]);
  // Three sources, in order of authority. A positioning_* value is something
  // typed by hand to pin the headline, so it wins. Otherwise today's
  // generated headline runs, but only while hero_is_daily says the hero_*
  // values really are today's - the static Site Content defaults underneath
  // them describe an older positioning and must never surface as if fresh.
  const daily = content?.hero_is_daily === "1";
  const hero = {
    eyebrow:
      content?.positioning_eyebrow ||
      (daily ? content?.hero_eyebrow : "") ||
      FALLBACK_HERO.eyebrow,
    title: content?.positioning_title || (daily ? content?.hero_title : "") || FALLBACK_HERO.title,
    subtitle:
      content?.positioning_subtitle ||
      (daily ? content?.hero_subtitle : "") ||
      FALLBACK_HERO.subtitle,
  };

  const googleRating = liveGoogleRating?.rating ?? 0;
  const googleReviewCount = liveGoogleRating?.reviewCount ?? 0;
  const googleReviewUrl = content?.google_review_url || "https://g.page/r/CfBZ-YWdgM_UEBI/review";
  const quarterlyIntake = resolveQuarterlyIntake(content);
  const faqCount = parseInt(content?.faq_count || "0");
  const faqs = [];
  for (let i = 1; i <= faqCount; i++) {
    const q = content?.[`faq_${i}_question`];
    const a = content?.[`faq_${i}_answer`];
    if (q && a) faqs.push({ question: q, answer: a });
  }

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section id="top" className="portfolio-hero relative flex min-h-screen flex-col overflow-hidden">
        {/* bg-bg on the layer itself, not just the photograph: the fixed
            The hero provides the opening page surface and is the one
            section that must never show it through — including if the image
            fails to load. */}
        <div className="absolute inset-0 -z-10 bg-bg">
          <img
            src="/img/backgrounds/hero-abstract-3d.webp"
            alt="Abstract cinematic 3D digital environment with glowing objects"
            className="h-full w-full object-cover [animation:drift_16s_ease-in-out_infinite]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/40 to-bg" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />
          {/* Painted after the two scrims, not before: the left-hand one reaches
              bg/85 exactly where the orbs sit, so underneath them the drifting
              accent glow was scrubbed down to nothing. */}
          <HeroOrbs />
        </div>

        <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-12 px-6 pb-20 pt-32 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div className="max-w-3xl">
            <p className="portfolio-eyebrow rise mb-6" style={{ animationDelay: "0.1s" }}>
              {hero.eyebrow}
            </p>
            <h1
              className="portfolio-hero-title rise"
              style={{ animationDelay: "0.2s" }}
            >
              {renderHeroTitle(hero.title)}
            </h1>
            <p
              className="rise mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl"
              style={{ animationDelay: "0.35s" }}
            >
              {hero.subtitle}
            </p>
            <div className="rise mt-10 flex flex-col gap-4 sm:flex-row" style={{ animationDelay: "0.5s" }}>
              <Link href="#work" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Explore my work{" "}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/contact" className="portfolio-text-link">
                Start a project <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <div className="rise relative mx-auto w-full max-w-2xl lg:ml-auto lg:mr-0" style={{ animationDelay: "0.6s" }}>
            <WebsiteDesignPreview />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <div className="flex items-center gap-3">
            <span className="label text-muted">Scroll to explore</span>
            <span className="text-accent [animation:scrollcue_2s_ease-in-out_infinite]">&darr;</span>
          </div>
        </div>
      </section>

      <GoogleRatingStrip rating={googleRating} reviewCount={googleReviewCount} reviewUrl={googleReviewUrl} />

      <QuarterlyAvailability
        isOpen={quarterlyIntake.isOpen}
        slots={quarterlyIntake.slots}
        quarter={quarterlyIntake.quarter}
        nextOpening={quarterlyIntake.nextOpening}
      />

      {/* ── TECH STRIP ──────────────────────────────────────── */}
      <TechStrip />

      {/* ── 01 · SERVICES ───────────────────────────────────── */}
      <section id="services" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 pt-28 md:px-10 md:pt-36">
          <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <SectionLabel index="01">Capabilities</SectionLabel>
              <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
                What I build
              </h2>
            </div>
          </Reveal>

        </div>

        {/* The three services, one screen each, on the route curtain's own
            vocabulary - see SplitServices. */}
        <div className="mt-16">
          <SplitServices />
        </div>
      </section>

      {/* ── 02 · SELECTED WORK ──────────────────────────────── */}
      <section
        id="work"
        className="relative overflow-hidden px-6 py-28 md:px-10 md:py-40"
      >
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <SectionLabel index="02">Proof, not promises</SectionLabel>
              <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
                See what has already shipped.
              </h2>
            </div>
            <Link
              href="/work"
              className="label group hidden items-center gap-2 text-text-2 hover:text-text md:flex"
            >
              View all work
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>

          <div className="mb-16 flex flex-col gap-4">
            <div className="h-1 w-[120px] overflow-hidden rounded-sm bg-bg-3">
              <span className="ml-3 block h-full w-10 bg-accent shadow-[0_0_4px_0_var(--accent)]" />
            </div>
            <p className="max-w-[540px] text-base leading-relaxed text-text-2">
              A curated display of high-fidelity interfaces, web applications and digital
              products, each one shipped and running in production.
            </p>
          </div>

          <PortfolioShowcase featured />

          <Reveal className="mt-16 flex justify-center md:hidden">
            <Link href="/work" className={cn(buttonVariants({ variant: "secondary" }))}>
              View all work <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── 03 · PROCESS ────────────────────────────────────── */}
      <section id="lab" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <SectionLabel index="03">Process</SectionLabel>
            <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em]">
              From brief to agreement to launch.
            </h2>
          </Reveal>

          <div className="relative mt-20 grid gap-y-12 md:grid-cols-4 md:gap-x-8">
            <div className="absolute left-0 right-0 top-2 hidden h-px bg-hairline md:block" />
            {PROCESS.map((step, i) => (
              <Reveal key={step.no} delay={i * 90} className="relative">
                <div className="mb-6 flex items-center gap-4 md:block">
                  <span className="relative z-10 block size-4 rounded-full border border-accent bg-bg">
                    <span className="absolute inset-1 rounded-full bg-accent" />
                  </span>
                </div>
                <span className="label text-accent">{step.no}</span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 max-w-xs text-text-2">{step.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <ProjectStandards compact />

      {/* ── 04 · BEYOND THE WEBSITE ─────────────────────────── */}
      <section id="ai-automation" className="relative overflow-hidden border-t border-hairline">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[160px]" />
        </div>
        <div className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 py-28 md:px-10 md:py-40 lg:grid-cols-2">
          <Reveal>
            <SectionLabel index="04">Beyond the website</SectionLabel>
            <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em]">
              Make the next conversation easier.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-2">
              Once a site is live, the work often continues: voice assistants, chat, follow-up and
              the automations behind them. Try the demo: it answers, qualifies and books like it
              would for a clinic.
            </p>
            <Link href="/services" className="label group mt-8 inline-flex items-center gap-2 text-accent">
              Explore AI and automation
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
          <Reveal delay={140} className="mx-auto w-full max-w-md">
            <VoiceDemo />
          </Reveal>
        </div>
      </section>

      {/* ── 05 · CLIENT REVIEWS ─────────────────────────────── */}
      {landingGoogleReviews.length > 0 && (
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
            <Reveal>
              <SectionLabel index="05">Client reviews</SectionLabel>
              <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
                Shared by clients on Google.
              </h2>
            </Reveal>

            <div className="mt-16 grid gap-6 md:grid-cols-3">
              {landingGoogleReviews.map((review, i) => (
                <Reveal key={review.id} delay={i * 90} className={cn(i === 1 && "md:mt-10")}>
                  <GoogleReviewCard review={review} className="p-8" />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ─────────────────────────────────────────────── */}
      {faqs.length > 0 && (
        <section id="faq" className="border-t border-hairline bg-bg py-28 md:py-40">
          <div className="mx-auto max-w-[1400px] px-6 md:px-10">
            <div className="mx-auto max-w-3xl text-center">
              <Reveal>
                <span className="mb-2 block font-mono text-sm tracking-wide text-text-2">
                  {content?.faq_eyebrow || "// Frequently asked"}
                </span>
                <h2 className="text-[clamp(1.8rem,4vw,3.5rem)] font-bold tracking-tight">
                  {content?.faq_title || "Questions people ask before we start."}
                </h2>
              </Reveal>
            </div>
            
            <div className="mx-auto mt-16 max-w-3xl">
              <Reveal delay={200}>
                <FaqAccordion faqs={faqs} />
              </Reveal>
            </div>
          </div>
        </section>
      )}

      {/* ── 07 · FINAL CTA ──────────────────────────────────── */}
      <section id="contact" className="relative overflow-hidden border-t border-hairline">
        <div className="absolute inset-0 -z-10">
          <img
            src="/img/backgrounds/cta-abstract-dark.webp"
            alt="Cinematic dark abstract environment"
            className="h-full w-full object-cover opacity-40 [animation:drift_22s_ease-in-out_infinite]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/80 to-bg" />
          <div className="absolute left-1/3 top-1/2 h-[30rem] w-[30rem] -translate-y-1/2 rounded-full bg-accent/20 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-32 text-center md:px-10 md:py-52">
          <Reveal>
            <h2 className="mx-auto max-w-4xl text-[clamp(2.6rem,8vw,7rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Have an idea?
              <br />
              <span className="text-accent">Let&rsquo;s build it.</span>
            </h2>
            <p className="mx-auto mt-8 max-w-xl text-lg text-text-2">
              Tell me about your website, app or workflow. Scope, cost and the initial payment
              are agreed in writing before work starts.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Book a Call</IntakeCta>
              <IntakeCta kind="project" openVariant="secondary">
                Request a project
              </IntakeCta>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
