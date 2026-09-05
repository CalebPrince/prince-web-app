import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { WebsiteDesignPreview } from "@/components/WebsiteDesignPreview";
import { ProjectStandards } from "@/components/ProjectStandards";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { IntakeCta } from "@/components/IntakeCta";

export const metadata: Metadata = {
  title: "Website Design & Development",
  description:
    "Custom website design and development by Prince Caleb in Accra, Ghana, working worldwide. Business websites, landing pages, redesigns and online stores, each with a written scope.",
};

// The page a visitor who only wants a website should be able to land on. It
// exists because the site read as an AI-and-automation practice, and a client
// said as much: they could not tell that website design is the core work.
const WORK = [
  {
    title: "Business websites",
    body: "Introduce your business, explain your services and make it easy for a customer to get in touch.",
  },
  {
    title: "Landing pages",
    body: "Give one product, service or campaign a single clear message and a focused path to an enquiry.",
  },
  {
    title: "Website redesigns",
    body: "Improve page structure, visual consistency, mobile usability and the way visitors find what they came for.",
  },
  {
    title: "Online stores and custom features",
    body: "Scope a product catalogue, checkout, bookings or an integration around what your business actually needs.",
  },
];

const INCLUDED = [
  "Page planning and clear navigation",
  "Typography, colour and a visual direction for your brand",
  "Layouts designed for phones, tablets and desktop",
  "Forms and integrations included in your agreed scope",
  "Accessibility, performance and browser checks",
  "Launch and handover arranged in the project agreement",
];

export default function WebsiteDesign() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-[1400px] items-center gap-14 px-6 pb-20 pt-28 md:px-10 md:pt-36 lg:grid-cols-2">
        <Reveal>
          <SectionLabel>Website designer &amp; developer &middot; Accra, Ghana</SectionLabel>
          <h1 className="page-hero-title mt-8">
            Your business deserves <span className="text-accent">a considered website.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">
            I design and develop custom websites, from page structure and visual direction through to
            a responsive, working build. You work directly with me, and you review the design before
            it becomes code.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <IntakeCta kind="project" openHref="/request?service=website-design">
              Discuss your website
            </IntakeCta>
            <Link
              href="/work"
              className="label group inline-flex min-h-12 items-center gap-2 text-text-2 hover:text-text"
            >
              View my work
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </Reveal>

        <Reveal delay={140}>
          <WebsiteDesignPreview />
        </Reveal>
      </section>

      {/* ── 01 · WHAT I DESIGN ──────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="max-w-2xl">
            <SectionLabel index="01">What I can design for you</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              A new website. A better first impression.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2">
            {WORK.map((item, i) => (
              <Reveal
                key={item.title}
                delay={(i % 2) * 80}
                className="rounded-[var(--radius)] border border-hairline bg-bg p-7 transition-colors hover:border-accent/30"
              >
                <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-text-2">{item.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 · HOW THE DESIGN WORK RUNS ───────────────────── */}
      <section className="mx-auto grid max-w-[1400px] gap-12 px-6 py-24 md:grid-cols-2 md:px-10 md:py-32">
        <Reveal>
          <SectionLabel index="02">Design is part of the work</SectionLabel>
          <h2 className="mt-6 text-[clamp(1.8rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.03em]">
            Structure first. Visual direction next. Then development.
          </h2>
          <p className="mt-6 max-w-lg leading-relaxed text-text-2">
            We settle the pages and the content, review layouts and responsive designs, and agree the
            direction before I build. Your agreement sets the review stages and how many rounds of
            revisions are included.
          </p>
        </Reveal>

        <Reveal delay={120}>
          <ul className="divide-y divide-hairline border-t border-hairline">
            {INCLUDED.map((item) => (
              <li key={item} className="py-4 text-text-2">
                {item}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <ProjectStandards />

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <Reveal>
          <h2 className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-[-0.03em]">
            Tell me what your website needs to do.
          </h2>
          <p className="mx-auto my-6 max-w-xl text-text-2">
            Share your goals, the pages you need, examples you like and your budget. I review the
            brief and, if we are a good fit, prepare a written scope and quote.
          </p>
          <IntakeCta kind="project" openHref="/request?service=website-design">
            Request a website quote
          </IntakeCta>
        </Reveal>
      </section>
    </>
  );
}
