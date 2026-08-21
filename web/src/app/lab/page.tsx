import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { IconType } from "react-icons";
import { SiAnthropic, SiThreedotjs, SiWebgl, SiFramer, SiReact, SiSupabase } from "react-icons/si";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getArchiveEntries } from "@/lib/archive";

// Lab page - open experiments and prototypes, not client work.

type Status = "Live" | "Prototype" | "Exploring";

interface Experiment {
  no: string;
  title: string;
  blurb: string;
  status: Status;
  icon: IconType;
  tags: string[];
  span: string;
}

const EXPERIMENTS: Experiment[] = [
  {
    no: "01",
    title: "Voice agent playground",
    blurb:
      "A sandbox for real-time voice agents, testing latency, interruption handling and natural hand-off to a human.",
    status: "Live",
    icon: SiAnthropic,
    tags: ["Realtime", "LLM", "Audio"],
    span: "lg:col-span-7",
  },
  {
    no: "02",
    title: "WebGL depth fields",
    blurb: "Shader studies exploring parallax, grain and light for cinematic hero backdrops.",
    status: "Prototype",
    icon: SiWebgl,
    tags: ["GLSL", "Three.js"],
    span: "lg:col-span-5",
  },
  {
    no: "03",
    title: "Motion primitives kit",
    blurb: "A small library of spring-based transitions I reuse across builds to keep motion coherent.",
    status: "Live",
    icon: SiFramer,
    tags: ["Motion", "DX"],
    span: "lg:col-span-5",
  },
  {
    no: "04",
    title: "Local-first sync layer",
    blurb:
      "Testing offline-first data with instant UI and conflict-free sync back to Postgres when the network returns.",
    status: "Exploring",
    icon: SiSupabase,
    tags: ["Local-first", "Sync"],
    span: "lg:col-span-7",
  },
  {
    no: "05",
    title: "Generative UI blocks",
    blurb: "Prompting a model to assemble on-brand section layouts from a design-token contract.",
    status: "Exploring",
    icon: SiReact,
    tags: ["LLM", "Design systems"],
    span: "lg:col-span-7",
  },
  {
    no: "06",
    title: "Procedural product scenes",
    blurb: "Interactive 3D product staging with configurable materials and lighting rigs.",
    status: "Prototype",
    icon: SiThreedotjs,
    tags: ["Three.js", "3D"],
    span: "lg:col-span-5",
  },
];

const STATUS_STYLES: Record<Status, string> = {
  Live: "border-accent/50 bg-accent/10 text-accent",
  Prototype: "border-hairline-strong bg-white/[0.03] text-text-2",
  Exploring: "border-hairline bg-transparent text-muted",
};

export const metadata: Metadata = {
  title: "Lab",
  description:
    "Open experiments, prototypes and half-finished ideas, where new techniques get proven before they reach client work.",
};

// The "latest writing" strip links into /archive, so it reads the same
// published posts that page does rather than a separate hardcoded list.
export const dynamic = "force-dynamic";

export default async function Lab() {
  const latestArticles = (await getArchiveEntries()).slice(0, 3);

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Lab</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Where I break things
              <br />
              <span className="text-accent">on purpose.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Open experiments, prototypes and half-finished ideas. This is where new techniques get
              proven before they ever reach client work.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── EXPERIMENTS GRID ────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="grid gap-6 lg:grid-cols-12">
          {EXPERIMENTS.map(({ no, title, blurb, status, icon: Icon, tags, span }, i) => (
            <Reveal key={no} className={span} delay={(i % 2) * 90}>
              <article className="group flex h-full flex-col justify-between rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 transition-colors hover:border-accent/40 md:p-10 glass">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex size-12 items-center justify-center rounded-[var(--radius)] border border-hairline bg-bg text-accent transition-colors group-hover:border-accent/40">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <span
                      className={cn(
                        "label rounded-full border px-3 py-1.5 text-[0.65rem]",
                        STATUS_STYLES[status],
                      )}
                    >
                      {status}
                    </span>
                  </div>
                  <div className="mt-8 flex items-center gap-3">
                    <span className="label text-muted">{"//"} {no}</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">{title}</h3>
                  <p className="mt-3 max-w-md text-text-2">{blurb}</p>
                </div>
                <div className="mt-8 flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="label rounded-full border border-hairline px-3 py-1.5 text-[0.65rem] text-muted"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── FIELD NOTES ─────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <SectionLabel index="07">Field notes</SectionLabel>
              <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                Notes from the workbench.
              </h2>
            </div>
            <Link
              href="/archive"
              className="label inline-flex items-center gap-2 text-text-2 transition-colors hover:text-accent"
            >
              Full archive
              <ArrowUpRight className="size-4" />
            </Link>
          </Reveal>

          <div className="mt-16 divide-y divide-hairline border-y border-hairline">
            {latestArticles.map((n, i) => (
              <Reveal key={n.slug} delay={i * 70}>
                <Link
                  href={`/archive/${n.slug}`}
                  className="group flex flex-col gap-3 py-8 transition-colors sm:flex-row sm:items-center sm:gap-10"
                >
                  <span className="label w-24 shrink-0 text-muted">{n.date}</span>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold tracking-tight transition-colors group-hover:text-accent md:text-2xl">
                      {n.title}
                    </h3>
                    <p className="mt-1.5 max-w-2xl text-text-2">{n.excerpt}</p>
                  </div>
                  <ArrowUpRight className="size-5 shrink-0 text-muted transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-accent" />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              Got a wild idea
              <br />
              <span className="text-accent">worth prototyping?</span>
            </h2>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Let&rsquo;s Build
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/systems" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                See shipped systems
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
