import { ArrowRight, ArrowUpRight, Star, Rocket, Users, Activity } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { WorkGallery } from "@/components/WorkGallery";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TechStrip } from "@/components/TechStrip";
import { VoiceDemo } from "@/components/VoiceDemo";
import { HeroOrbs } from "@/components/HeroOrbs";
import { TiltCard } from "@/components/TiltCard";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { FaqAccordion } from "@/components/FaqAccordion";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { ImpactGrid } from "@/components/ImpactGrid";

const SERVICES = [
  {
    no: "01",
    title: "Web Design",
    body: "Conversion-focused websites with strong visual identities and exceptional user experiences.",
  },
  {
    no: "02",
    title: "Development",
    body: "Fast, scalable and maintainable web applications and digital platforms built to last.",
  },
  {
    no: "03",
    title: "AI Experiences",
    body: "AI-powered interfaces, automation, intelligent agents and next-generation digital experiences.",
  },
  {
    no: "04",
    title: "Digital Products",
    body: "Custom digital products designed around real business problems and real people.",
  },
];

const PROCESS = [
  { no: "01", title: "Discover", body: "Understand the problem, audience and business objective." },
  { no: "02", title: "Design", body: "Create the visual direction, UX and interface system." },
  { no: "03", title: "Build", body: "Transform the approved design into a fast, responsive experience." },
  { no: "04", title: "Launch", body: "Test, optimize and deploy the final product." },
];

const AI_CAPS = [
  "AI Agents",
  "Intelligent Automation",
  "AI Interfaces",
  "Workflow Automation",
  "Generative Experiences",
  "Human + AI Collaboration",
];

const TESTIMONIALS = [
  {
    quote:
      "Caleb didn’t just build our website, he reframed how we think about our entire digital presence. The result outperformed every projection we set.",
    name: "Elena Marsh",
    role: "Founder",
    company: "Northwind Labs",
  },
  {
    quote:
      "The most fluent designer-developer we’ve worked with. Ideas move from conversation to shipped product without ever losing their edge.",
    name: "Daniel Osei",
    role: "Head of Product",
    company: "Aperture",
  },
  {
    quote:
      "He understood the AI layer better than our own engineers. What he delivered feels three years ahead of the market.",
    name: "Priya Nair",
    role: "CEO",
    company: "Helio",
  },
];

// Static fallback — used only if /api/v1/content is unreachable, or before
// today's row exists yet. Matches the copy database/migrate.php seeds as the
// hero_eyebrow/hero_title/hero_subtitle Site Content defaults.
const FALLBACK_HERO = {
  eyebrow: "Digital Design • Development • AI",
  title: "Digital experiences, built to **perform**.",
  subtitle:
    "I design and build high-performance websites, digital products and AI-powered experiences that help ambitious businesses move forward.",
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
/** Site Content stat values are free-text fields, and the natural thing to
 *  type into one is the whole figure — "98.9%", "4.5/5", "12,000+" — with the
 *  separate suffix field left alone. `Number()` returns NaN for every one of
 *  those, and NaN is falsy, so the page quietly rendered its hardcoded
 *  placeholder instead of the figure that was entered: real numbers typed by
 *  an admin were displayed as invented ones, with nothing to indicate it.
 *  Strip the decoration and read the number rather than discarding the input. */
/** Matches the FIRST number in the string rather than stripping out every
 *  non-digit: "4.5/5" has to read as 4.5, and deleting the "/" would leave
 *  "4.55". Tolerates thousands separators so "12,000+" works too. */
function firstNumber(raw: string | undefined): string | null {
  return (raw ?? "").match(/-?\d[\d,]*(?:\.\d+)?/)?.[0] ?? null;
}

function statValue(raw: string | undefined, fallback: number): number {
  const token = firstNumber(raw);
  if (token === null) return fallback;
  const parsed = Number(token.replace(/,/g, ""));
  // Number.isFinite, not `|| fallback`: 0 is a legitimate figure to publish.
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Keeps however many decimal places were actually typed, so "98.9" renders
 *  as 98.9 rather than being rounded to 99. */
function statDecimals(raw: string | undefined, fallback: number): number {
  const token = firstNumber(raw);
  if (token === null) return fallback;
  const dot = token.indexOf(".");
  return dot === -1 ? 0 : token.length - dot - 1;
}

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
  const content = await api.content().catch(() => null);
  const hero = {
    eyebrow: content?.hero_eyebrow || FALLBACK_HERO.eyebrow,
    title: content?.hero_title || FALLBACK_HERO.title,
    subtitle: content?.hero_subtitle || FALLBACK_HERO.subtitle,
  };

  // Apps launched defaults to the real published-project count rather than a
  // made-up number - stat_1_value in Site Content overrides it if set.
  // stat_2/stat_3/stat_4 (users served, uptime, client rating) have no
  // equivalent live source in this app - real approved testimonials would be
  // the honest source for a rating, but none exist yet (/api/v1/testimonials
  // returns an empty array locally) - so all three fall back to placeholders
  // an admin needs to replace with real figures under Admin -> Site Content
  // before this is trustworthy.
  const publishedProjects = await api.projects().catch(() => []);
  const impactStats = [
    {
      icon: Rocket,
      label: content?.stat_1_label || "Apps launched",
      target: statValue(content?.stat_1_value, publishedProjects.length || 30),
      suffix: content?.stat_1_suffix ?? "+",
      decimals: statDecimals(content?.stat_1_value, 0),
    },
    {
      icon: Users,
      label: content?.stat_2_label || "Users served",
      target: statValue(content?.stat_2_value, 5000),
      suffix: content?.stat_2_suffix ?? "+",
      decimals: statDecimals(content?.stat_2_value, 0),
    },
    {
      icon: Activity,
      label: content?.stat_3_label || "Uptime",
      target: statValue(content?.stat_3_value, 99.9),
      suffix: content?.stat_3_suffix ?? "%",
      decimals: statDecimals(content?.stat_3_value, 1),
    },
    {
      icon: Star,
      label: content?.stat_4_label || "Client rating",
      target: statValue(content?.stat_4_value, 4.5),
      prefix: content?.stat_4_prefix ?? "",
      suffix: content?.stat_4_suffix ?? "/5",
      // At least one decimal - a rating reads as "4.5", never "5".
      decimals: Math.max(1, statDecimals(content?.stat_4_value, 1)),
    },
  ];
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
      <section id="top" className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10">
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

        <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-12 px-6 pb-16 pt-32 md:px-10 lg:grid-cols-2 lg:gap-8">
          <div className="max-w-3xl">
            <p className="rise label mb-8 text-text-2" style={{ animationDelay: "0.1s" }}>
              {hero.eyebrow}
            </p>
            <h1
              className="rise text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.03em]"
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
                View My Work{" "}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="#contact" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Let&rsquo;s Talk
              </Link>
            </div>
          </div>
          <div className="rise relative mx-auto w-full max-w-md lg:ml-auto lg:mr-0" style={{ animationDelay: "0.6s" }}>
            <VoiceDemo />
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <div className="flex items-center gap-3">
            <span className="label text-muted">Scroll to explore</span>
            <span className="text-accent [animation:scrollcue_2s_ease-in-out_infinite]">&darr;</span>
          </div>
        </div>
      </section>

      {/* ── IMPACT ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-y border-hairline bg-bg-2/50 py-20 md:py-28">
        <ImpactGrid />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg-2/60 via-transparent to-bg-2/60" />
        <div className="relative mx-auto grid max-w-[1400px] grid-cols-2 gap-12 px-6 sm:grid-cols-4 md:px-10">
          {impactStats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 120} className="flex flex-col items-center text-center">
              <div className="flex items-center justify-center gap-4">
                <stat.icon
                  className="h-[clamp(2.25rem,5vw,4rem)] w-[clamp(2.25rem,5vw,4rem)] shrink-0 text-accent"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="text-[clamp(2.25rem,5vw,4rem)] font-extrabold leading-none tracking-tight">
                  <AnimatedCounter
                    target={stat.target}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals}
                  />
                </p>
              </div>
              <p className="label mt-3 text-muted">{stat.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── TECH STRIP ──────────────────────────────────────── */}
      <TechStrip />

      {/* ── 01 · SERVICES ───────────────────────────────────── */}
      <section id="services" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <SectionLabel index="01">Capabilities</SectionLabel>
              <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
                What I build
              </h2>
            </div>
          </Reveal>

          <div className="mt-16 border-t border-hairline">
            {SERVICES.map((s, i) => (
              <Reveal as="div" key={s.no} delay={i * 60}>
                <a
                  href="#contact"
                  className="group grid items-center gap-4 border-b border-hairline py-9 transition-colors hover:bg-white/[0.015] md:grid-cols-12 md:gap-8 md:px-4"
                >
                  <span className="label col-span-1 text-muted">{s.no}</span>
                  <h3 className="col-span-4 text-3xl font-semibold tracking-tight transition-transform duration-500 group-hover:translate-x-2 md:text-4xl">
                    {s.title}
                  </h3>
                  <p className="col-span-6 max-w-md text-text-2">{s.body}</p>
                  <ArrowUpRight className="col-span-1 size-6 text-muted transition-all duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-accent md:justify-self-end" />
                </a>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 · SELECTED WORK ──────────────────────────────── */}
      <section
        id="work"
        className="relative overflow-hidden px-6 py-28 md:px-10 md:py-40"
      >
        <div className="mx-auto max-w-[1400px]">
          <WorkGallery />

          <div className="mt-16 flex justify-center">
            <Link href="/systems" className={cn(buttonVariants({ variant: "secondary" }))}>
              See all systems <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── 03 · PROCESS ────────────────────────────────────── */}
      <section id="lab" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <SectionLabel index="03">Process</SectionLabel>
            <h2 className="mt-6 max-w-3xl text-[clamp(2.2rem,5vw,4.5rem)] font-bold leading-[1.02] tracking-[-0.03em]">
              From idea to launch.
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

      {/* ── 04 · AI / FUTURE ────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[160px]" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #f5f5f2 1px, transparent 1px), linear-gradient(to bottom, #f5f5f2 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-44">
          <Reveal className="mx-auto max-w-4xl text-center">
            <SectionLabel index="04">The Future</SectionLabel>
            <h2 className="mt-8 text-[clamp(2.2rem,6vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              The web is changing.
              <br />
              <span className="text-text-2">I&rsquo;m building for</span>{" "}
              <span className="text-accent">what&rsquo;s next.</span>
            </h2>
          </Reveal>
          <Reveal delay={150} className="mx-auto mt-14 flex max-w-3xl flex-wrap justify-center gap-3">
            {AI_CAPS.map((cap) => (
              <span
                key={cap}
                className="label rounded-full border border-hairline bg-bg-2/50 px-5 py-3 text-text-2 backdrop-blur-sm transition-colors hover:border-accent/50 hover:text-text"
              >
                {cap}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── 05 · TESTIMONIALS ───────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <SectionLabel index="05">Client signals</SectionLabel>
            <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
              What clients say after launch.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 90} className={cn(i === 1 && "md:mt-10")}>
                <TiltCard className="flex h-full flex-col justify-between rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-8 transition-colors hover:border-accent/30">
                  <div>
                    <div className="flex gap-0.5 text-accent">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star key={s} className="size-4 fill-current" aria-hidden="true" />
                      ))}
                    </div>
                    <p className="mt-5 text-lg leading-relaxed text-text">
                      <span className="mr-1 text-3xl leading-none text-accent">&ldquo;</span>
                      {t.quote}
                    </p>
                  </div>
                  <div className="mt-10 border-t border-hairline pt-6">
                    <p className="font-semibold text-text">{t.name}</p>
                    <p className="label mt-1 text-muted">
                      {t.role} &bull; {t.company}
                    </p>
                  </div>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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
              Tell me what you&rsquo;re trying to build, and let&rsquo;s turn the idea into
              something real.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Book a Call{" "}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/contact"
                className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
              >
                Start a Project
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
