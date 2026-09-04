import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { SERVICES } from "@/lib/services";


const PROCESS = [
  {
    no: "01",
    title: "Discover",
    body: "We identify the bottleneck, the people affected and the result worth measuring.",
  },
  {
    no: "02",
    title: "Build",
    body: "I create the smallest dependable system, connect it to your tools and test the real workflow.",
  },
  {
    no: "03",
    title: "Improve",
    body: "We review performance, remove friction and expand only after the first workflow proves useful.",
  },
];

export const metadata: Metadata = {
  title: "Services",
  description:
    "AI voice agents, business automations, and custom websites and mobile apps built around how your customers and team actually work.",
};

export default function Services() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-20 md:px-10 md:pt-48 md:pb-24">
          <Reveal>
            <SectionLabel index="00">Services</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Turn missed calls into
              <br />
              <span className="text-accent">booked appointments.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              AI voice agents answer, qualify, and book callers directly into your calendar &mdash;
              while automations follow up with every missed lead instantly.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-8 flex flex-wrap gap-3">
            {["AI voice agents", "Chatbots", "Automations"].map((t) => (
              <span
                key={t}
                className="label rounded-full border border-hairline bg-bg-2/50 px-4 py-2.5 text-text-2 glass"
              >
                {t}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── SERVICE BLOCKS ──────────────────────────────────── */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-[1400px] px-6 md:px-10">
          {SERVICES.map((s) => {
            return (
              <Reveal
                as="div"
                key={s.id}
                id={s.id}
                className="grid scroll-mt-28 gap-10 border-b border-hairline py-16 md:grid-cols-12 md:gap-8 md:py-24"
              >
                <div className="md:col-span-5">
                  <span className="label text-muted">{s.no} &middot; {s.tagline}</span>
                  <h2 className="mt-7 text-[clamp(1.8rem,3.5vw,3rem)] font-bold leading-[1.05] tracking-[-0.02em]">
                    {s.title}
                  </h2>
                  <p className="mt-5 max-w-md text-lg leading-relaxed text-text-2">{s.body}</p>
                  <Link
                    href="/contact"
                    className="label group mt-8 inline-flex items-center gap-2 text-accent"
                  >
                    Explore this service
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>

                <ul className="grid gap-px self-start overflow-hidden rounded-[var(--radius)] border border-hairline bg-hairline sm:grid-cols-2 md:col-span-7">
                  {s.features.map((f) => (
                    <li
                      key={f.label}
                      className="group bg-bg p-6 text-text-2 transition-colors hover:bg-bg-2 hover:text-text"
                    >
                      {f.label}
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── HOW WE WORK ─────────────────────────────────────── */}
      <section className="border-b border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="04">How we work</SectionLabel>
            <h2 className="mt-6 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.02] tracking-[-0.03em]">
              From a costly problem to a working system.
            </h2>
          </Reveal>

          <div className="relative mt-16 grid gap-y-12 md:grid-cols-3 md:gap-x-8">
            <div className="absolute left-0 right-0 top-2 hidden h-px bg-hairline md:block" />
            {PROCESS.map((step, i) => (
              <Reveal key={step.no} delay={i * 90} className="relative">
                <span className="relative z-10 mb-6 block size-4 rounded-full border border-accent bg-bg">
                  <span className="absolute inset-1 rounded-full bg-accent" />
                </span>
                <span className="label text-accent">{step.no}</span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-3 max-w-sm text-text-2">{step.body}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120} className="mt-16 flex items-center gap-3 text-text-2">
            <Check className="size-5 text-accent" aria-hidden="true" />
            <p>
              Most systems ship in{" "}
              <span className="text-text">2 to 6 weeks</span>, depending on integrations, approvals
              and how much existing process cleanup is needed.
            </p>
          </Reveal>
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
              Not sure what your business
              <br />
              <span className="text-accent">actually needs?</span>
            </h2>
            <p className="mx-auto mt-8 max-w-xl text-lg text-text-2">
              Book a 20-minute call and get a straight read on scope, cost and timeline &mdash; no
              obligation.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Book a Call</IntakeCta>
              <Link
                href="/#work"
                className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
              >
                See what has shipped <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
