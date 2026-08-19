import type { Metadata } from "next";
import type { IconType } from "react-icons";
import {
  SiFigma,
  SiFramer,
  SiReact,
  SiTypescript,
  SiNodedotjs,
  SiSupabase,
  SiAnthropic,
} from "react-icons/si";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRINCIPLES = [
  {
    no: "01",
    title: "Design is how it works",
    body: "Aesthetics and engineering are the same conversation. I refuse the trade-off between beautiful and fast.",
  },
  {
    no: "02",
    title: "Ship, then sharpen",
    body: "Momentum beats perfection. I build in tight loops, get it live, and let real usage guide the polish.",
  },
  {
    no: "03",
    title: "AI as a collaborator",
    body: "The most interesting products pair human taste with machine leverage. I design that seam deliberately.",
  },
  {
    no: "04",
    title: "Own the whole stack",
    body: "From the first sketch to the deploy pipeline, one person accountable for the entire experience.",
  },
];

type Tool = { name: string; icon?: IconType };

// About page toolkit - brand logos paired with capabilities.
const TOOLKIT: { group: string; items: Tool[] }[] = [
  {
    group: "Design",
    items: [
      { name: "Figma", icon: SiFigma },
      { name: "Motion & prototyping", icon: SiFramer },
      { name: "Design systems" },
      { name: "Brand identity" },
    ],
  },
  {
    group: "Engineering",
    items: [
      { name: "React & Next.js", icon: SiReact },
      { name: "TypeScript", icon: SiTypescript },
      { name: "Node & edge runtimes", icon: SiNodedotjs },
      { name: "Postgres & Supabase", icon: SiSupabase },
    ],
  },
  {
    group: "AI",
    items: [
      { name: "LLM agents & tools", icon: SiAnthropic },
      { name: "RAG pipelines" },
      { name: "Voice interfaces" },
      { name: "Workflow automation" },
    ],
  },
];

const TIMELINE = [
  {
    year: "2014",
    title: "First lines of code",
    body: "Started building small sites for local businesses and never looked back.",
  },
  {
    year: "2018",
    title: "Design meets development",
    body: "Went full-stack and product-minded, owning experiences end to end.",
  },
  {
    year: "2022",
    title: "The AI turn",
    body: "Began shipping AI-native interfaces, agents and automation for clients.",
  },
  {
    year: "2026",
    title: "The studio today",
    body: "A one-person studio partnering with ambitious teams on what comes next.",
  },
];

export const metadata: Metadata = {
  title: "About - Prince Caleb",
  description:
    "Designer, developer and AI tinkerer running a one-person digital studio, turning raw ideas into products people remember using.",
};

export default function About() {
  return (
    <>
      {/* ── HERO / INTRO ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pt-36 pb-24 md:px-10 md:pt-48 md:pb-28">
        <div className="grid gap-14 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Reveal>
              <SectionLabel index="00">About</SectionLabel>
            </Reveal>
            <Reveal delay={80}>
              <h1 className="mt-8 text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
                Hi, I&rsquo;m Caleb.
                <br />
                <span className="text-text-2">I build the</span>{" "}
                <span className="text-accent">web&rsquo;s next</span> chapter.
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-text-2">
                Designer, developer and AI tinkerer running a one-person digital studio. For over
                a decade I&rsquo;ve helped founders and teams turn raw ideas into products people
                actually remember using.
              </p>
            </Reveal>
          </div>

          <Reveal delay={220} className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2">
              <img
                src="https://images.unsplash.com/photo-1450133064473-71024230f91b?w=900&h=1100&fit=crop&auto=format"
                alt="Portrait of Caleb"
                className="aspect-[4/5] w-full object-cover grayscale"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-bg/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-5">
                <span className="label text-text">Prince Caleb</span>
                <span className="label text-accent">Est. 2014</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── STORY ───────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <div className="grid gap-14 lg:grid-cols-12">
            <Reveal className="lg:col-span-4">
              <SectionLabel index="01">The story</SectionLabel>
            </Reveal>
            <div className="space-y-6 text-lg leading-relaxed text-text-2 lg:col-span-8">
              <Reveal delay={60} as="div">
                <p>
                  I started out obsessed with two things that rarely lived together: how something
                  looks, and how it&rsquo;s built. Most people pick a side. I spent years refusing
                  to &mdash; learning to design interfaces and then engineer them to a standard
                  neither discipline would compromise.
                </p>
              </Reveal>
              <Reveal delay={120} as="div">
                <p>
                  That obsession turned into a studio. Today I work with founders, product teams
                  and creative agencies who need someone who can hold the whole picture &mdash;
                  <span className="text-text"> strategy, design, engineering and AI</span> &mdash;
                  without losing the thread between them.
                </p>
              </Reveal>
              <Reveal delay={180} as="div">
                <p>
                  Lately, most of that work lives at the edge of what AI makes possible: agents,
                  automation and interfaces that feel less like tools and more like collaborators.
                  It&rsquo;s the most exciting moment the web has had in years, and I&rsquo;m
                  building squarely for it.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRINCIPLES ──────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="02">How I work</SectionLabel>
          <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            Principles that hold.
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-px overflow-hidden rounded-[var(--radius)] border border-hairline bg-hairline sm:grid-cols-2">
          {PRINCIPLES.map((p, i) => (
            <Reveal
              key={p.no}
              delay={i * 70}
              className="group bg-bg p-8 transition-colors hover:bg-bg-2 md:p-10"
            >
              <span className="label text-accent">{p.no}</span>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-3 text-text-2">{p.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── TOOLKIT ─────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="03">The toolkit</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              What I reach for.
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-12 md:grid-cols-3">
            {TOOLKIT.map(({ group, items }, i) => (
              <Reveal key={group} delay={i * 80}>
                <p className="label text-muted">{group}</p>
                <ul className="mt-6 space-y-4 border-t border-hairline pt-6">
                  {items.map(({ name, icon: Icon }) => (
                    <li
                      key={name}
                      className="group flex items-center gap-3 text-text-2 transition-colors hover:text-text"
                    >
                      {Icon ? (
                        <Icon className="size-5 text-muted transition-colors group-hover:text-accent" aria-hidden="true" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-accent" />
                      )}
                      {name}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIMELINE ────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="04">The path</SectionLabel>
          <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            A decade in motion.
          </h2>
        </Reveal>
        <div className="mt-16 border-t border-hairline">
          {TIMELINE.map((t, i) => (
            <Reveal
              as="div"
              key={t.year}
              delay={i * 70}
              className="grid items-baseline gap-2 border-b border-hairline py-8 md:grid-cols-12 md:gap-8"
            >
              <span className="text-2xl font-bold tracking-tight text-accent md:col-span-2">
                {t.year}
              </span>
              <h3 className="text-xl font-semibold tracking-tight md:col-span-4">{t.title}</h3>
              <p className="max-w-md text-text-2 md:col-span-6">{t.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-hairline">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              Let&rsquo;s build something
              <br />
              <span className="text-accent">worth remembering.</span>
            </h2>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/#contact" className={cn(buttonVariants({ size: "lg" }))}>
                Start a Project{" "}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/#work" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                View My Work
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
