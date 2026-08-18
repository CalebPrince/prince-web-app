import { ArrowRight, ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TechStrip } from "@/components/TechStrip";
import { cn } from "@/lib/utils";

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

const PROJECTS = [
  {
    name: "Aurora Commerce",
    category: "E-Commerce",
    desc: "A headless storefront and checkout system engineered for scale.",
    year: "2026",
    span: "lg:col-span-7",
    ratio: "aspect-[16/10]",
    img: "https://images.unsplash.com/photo-1757301714935-c8127a21abc6?w=1400&h=900&fit=crop&auto=format",
  },
  {
    name: "Helio AI",
    category: "AI",
    desc: "An agentic workspace that turns intent into finished work.",
    year: "2026",
    span: "lg:col-span-5",
    ratio: "aspect-[4/5]",
    img: "https://images.unsplash.com/photo-1709377195538-5522ed0f9e10?w=1000&h=1200&fit=crop&auto=format",
  },
  {
    name: "Meridian Studio",
    category: "Web Design",
    desc: "A cinematic brand site for an architecture practice.",
    year: "2025",
    span: "lg:col-span-5",
    ratio: "aspect-[4/5]",
    img: "https://images.unsplash.com/photo-1634084462412-b54873c0a56d?w=1000&h=1200&fit=crop&auto=format",
  },
  {
    name: "Nova Platform",
    category: "Web Development",
    desc: "A real-time analytics platform with a bespoke design system.",
    year: "2025",
    span: "lg:col-span-7",
    ratio: "aspect-[16/10]",
    img: "https://images.unsplash.com/photo-1648134859211-4a1b57575f4e?w=1400&h=900&fit=crop&auto=format",
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
      "Caleb didn’t just build our website — he reframed how we think about our entire digital presence. The result outperformed every projection we set.",
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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="label mt-1 text-muted">{label}</p>
    </div>
  );
}

export default function Home() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section id="top" className="relative flex min-h-screen flex-col overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1622737133809-d95047b9e673?w=2200&h=1400&fit=crop&auto=format"
            alt="Abstract cinematic 3D digital environment with glowing objects"
            className="h-full w-full object-cover [animation:drift_28s_ease-in-out_infinite]"
          />
          <div className="absolute -left-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-accent/20 blur-[140px] [animation:glowpulse_16s_ease-in-out_infinite]" />
          <div className="absolute -right-32 top-10 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-[120px] [animation:glowpulse_20s_ease-in-out_infinite_reverse]" />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/40 to-bg" />
          <div className="absolute inset-0 bg-gradient-to-r from-bg/85 via-bg/30 to-transparent" />
        </div>

        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col justify-center px-6 pt-28 pb-16 md:px-10">
          <div className="max-w-4xl">
            <p className="rise label mb-8 text-text-2" style={{ animationDelay: "0.1s" }}>
              Digital Design <span className="text-accent">&bull;</span> Development{" "}
              <span className="text-accent">&bull;</span> AI
            </p>
            <h1
              className="rise text-[clamp(2.6rem,8vw,7rem)] font-extrabold leading-[0.95] tracking-[-0.03em]"
              style={{ animationDelay: "0.2s" }}
            >
              Digital experiences,
              <br />
              <span className="text-text-2">built to</span> perform.
            </h1>
            <p
              className="rise mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl"
              style={{ animationDelay: "0.35s" }}
            >
              I design and build high-performance websites, digital products and AI-powered
              experiences that help ambitious businesses move forward.
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
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center">
          <div className="flex items-center gap-3">
            <span className="label text-muted">Scroll to explore</span>
            <span className="text-accent [animation:scrollcue_2s_ease-in-out_infinite]">&darr;</span>
          </div>
        </div>
      </section>

      {/* ── TECH STRIP ──────────────────────────────────────── */}
      <TechStrip />

      {/* ── 01 · THE STUDIO ─────────────────────────────────── */}
      <section id="about" className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
        <Reveal>
          <SectionLabel index="01">The Studio</SectionLabel>
        </Reveal>
        <div className="mt-12 grid gap-14 lg:grid-cols-12">
          <Reveal className="lg:col-span-8" delay={80}>
            <h2 className="text-[clamp(1.9rem,4.5vw,4rem)] font-bold leading-[1.02] tracking-[-0.025em]">
              I turn ideas into digital <br className="hidden md:block" />
              experiences people <span className="italic text-accent">remember.</span>
            </h2>
          </Reveal>
          <Reveal className="lg:col-span-4 lg:pt-3" delay={200}>
            <p className="text-base leading-relaxed text-text-2">
              PrinceCaleb combines design, development, AI and strategy to create digital
              experiences from first concept through launch &mdash; and everything in between.
            </p>
            <div className="mt-8 flex gap-10">
              <Stat value="12+" label="Years" />
              <Stat value="30+" label="Projects" />
              <Stat value="98%" label="Satisfaction" />
            </div>
          </Reveal>
        </div>

        <Reveal delay={120} className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            "photo-1697292859724-0d2501966448",
            "photo-1660824340595-abee9c790d85",
            "photo-1634084462412-b54873c0a56d",
            "photo-1709625862266-014ef072fd93",
          ].map((id, i) => (
            <div
              key={id}
              className={cn(
                "relative overflow-hidden rounded-sm border border-hairline bg-bg-2",
                i % 2 === 0 ? "aspect-[3/4]" : "aspect-[3/4] md:mt-10",
              )}
            >
              <img
                src={`https://images.unsplash.com/${id}?w=500&h=650&fit=crop&auto=format`}
                alt="Interface fragment"
                className="h-full w-full object-cover opacity-80 grayscale transition-all duration-700 hover:scale-105 hover:opacity-100 hover:grayscale-0"
              />
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── 02 · SERVICES ───────────────────────────────────── */}
      <section id="services" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <SectionLabel index="02">Capabilities</SectionLabel>
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

      {/* ── 03 · SELECTED WORK ──────────────────────────────── */}
      <section id="work" className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
        <Reveal className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <SectionLabel index="03">Proof, not promises</SectionLabel>
            <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
              See what has already shipped.
            </h2>
          </div>
          <Link
            href="/systems"
            className="label group hidden items-center gap-2 text-text-2 hover:text-text md:flex"
          >
            See all systems
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <div className="mt-16 grid gap-x-6 gap-y-16 lg:grid-cols-12">
          {PROJECTS.map((p, i) => (
            <Reveal key={p.name} className={p.span} delay={(i % 2) * 100}>
              <a href="#work" className="group block">
                <div
                  className={cn(
                    "relative overflow-hidden rounded-sm border border-hairline bg-bg-2",
                    p.ratio,
                  )}
                >
                  <img
                    src={p.img}
                    alt={`${p.name} — ${p.category}`}
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-bg/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                  <div className="absolute right-5 top-5 flex size-11 items-center justify-center rounded-full border border-text/20 bg-bg/40 backdrop-blur-md opacity-0 transition-all duration-500 group-hover:opacity-100">
                    <ArrowUpRight className="size-5 text-text" />
                  </div>
                </div>
                <div className="mt-6 flex items-start justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="label text-accent">{p.category}</span>
                      <span className="label text-muted">/ {p.year}</span>
                    </div>
                    <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">
                      {p.name}
                    </h3>
                    <p className="mt-2 max-w-md text-text-2">{p.desc}</p>
                  </div>
                </div>
              </a>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 flex justify-center md:hidden">
          <Link href="/systems" className={cn(buttonVariants({ variant: "secondary" }))}>
            See all systems <ArrowRight className="size-4" />
          </Link>
        </Reveal>
      </section>

      {/* ── 04 · PROCESS ────────────────────────────────────── */}
      <section id="lab" className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <SectionLabel index="04">Process</SectionLabel>
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

      {/* ── 05 · AI / FUTURE ────────────────────────────────── */}
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
            <SectionLabel index="05">The Future</SectionLabel>
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

      {/* ── 06 · TESTIMONIALS ───────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-[1400px] px-6 py-28 md:px-10 md:py-40">
          <Reveal>
            <SectionLabel index="06">Client signals</SectionLabel>
            <h2 className="mt-6 text-[clamp(2.2rem,5vw,4.5rem)] font-bold tracking-[-0.03em]">
              What clients say after launch.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => (
              <Reveal
                key={t.name}
                delay={i * 90}
                className={cn(
                  "flex flex-col justify-between rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-8 transition-colors hover:border-accent/30",
                  i === 1 && "md:mt-10",
                )}
              >
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
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 07 · FINAL CTA ──────────────────────────────────── */}
      <section id="contact" className="relative overflow-hidden border-t border-hairline">
        <div className="absolute inset-0 -z-10">
          <img
            src="https://images.unsplash.com/photo-1709377195538-5522ed0f9e10?w=2000&h=1200&fit=crop&auto=format"
            alt="Cinematic dark abstract environment"
            className="h-full w-full object-cover opacity-40 [animation:drift_32s_ease-in-out_infinite]"
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
