"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Workflow, Globe } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { api, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";

const LOGOS = [
  { file: "deepseek.svg", name: "DeepSeek", w: 18 },
  { file: "anthropic.svg", name: "Anthropic", w: 18 },
  { file: "openrouter.svg", name: "OpenRouter", w: 18 },
  { file: "groq.svg", name: "Groq", w: 63 },
  { file: "elevenlabs.svg", name: "ElevenLabs", w: 18 },
  { file: "google.svg", name: "Google", w: 18 },
  { file: "meta.svg", name: "Meta", w: 18 },
  { file: "whapi.svg", name: null, w: 77 },
  { file: "composio.svg", name: null, w: 93 },
  { file: "apify.svg", name: null, w: 66 },
  { file: "paystack.svg", name: null, w: 101 },
  { file: "hunter.svg", name: null, w: 99 },
  { file: "heygen.png", name: "HeyGen", w: 26 },
  { file: "flydotio.svg", name: "Fly.io", w: 27 },
];

export function PoweredBySection() {
  return (
    <section className="border-b border-line py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-8 text-center text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // Built on real, proven infrastructure
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 opacity-70">
          {LOGOS.map((logo) => (
            <span key={logo.file} className="inline-flex items-center gap-2">
              <Image
                src={`/img/logos/${logo.file}`}
                alt={logo.name ?? ""}
                width={logo.w}
                height={18}
                className="powered-by-logo h-[18px] w-auto"
              />
              {logo.name && <span className="text-sm font-medium text-ink-soft">{logo.name}</span>}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

const SERVICES = [
  {
    icon: Bot,
    title: "AI agents",
    body: "Voice and chat agents that answer customers, qualify enquiries, manage bookings and hand over to your team when human judgement matters.",
    href: "/services#track-01",
    cta: "Explore AI agents",
  },
  {
    icon: Workflow,
    title: "Business Automations",
    body: "Connect the tools you already use and kill the manual work between them — enquiries into your CRM, bookings into invoices, events into email, running quietly on schedule.",
    href: "/services#track-03",
    cta: "Explore this service",
  },
  {
    icon: Globe,
    title: "Custom Websites & Mobile Apps",
    body: "Fast websites, focused web platforms and mobile applications built around how your customers and team actually work.",
    href: "/services#track-05",
    cta: "Explore digital products",
  },
];

// Ported from public/css/app.css's .service-columns/.deck-card (edge-to-edge
// hairline grid, not individually bordered/rounded/shadowed cards): the grid
// carries the top+left border, each cell adds its own right+bottom border,
// so the whole block reads as one bordered sheet divided by hairlines.
export function ServicesSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-8 text-center text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // What I build
        </p>
        <div className="grid grid-cols-1 border-t border-l border-line sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <div
              key={s.title}
              className="flex flex-col gap-4 border-r border-b border-line p-8 transition-[background-color,transform] duration-200 hover:z-10 hover:-translate-y-[3px] hover:bg-bg-soft"
            >
              <div className="mb-2 flex size-12 items-center justify-center rounded-[10px] border border-line text-heading">
                <s.icon className="size-5" aria-hidden="true" />
              </div>
              <h3 className="max-w-[18ch] text-xl font-bold">{s.title}</h3>
              <p className="text-ink-soft">{s.body}</p>
              <Link href={s.href} className="group mt-auto inline-flex items-center gap-1 font-semibold text-heading hover:text-editorial-accent">
                {s.cta} <ArrowRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROCESS_STEPS = [
  { n: "01", title: "Discover", body: "We identify the bottleneck, the people affected and the result worth measuring." },
  { n: "02", title: "Build", body: "I create the smallest dependable system, connect it to your tools and test the real workflow." },
  { n: "03", title: "Improve", body: "We review performance, remove friction and expand only after the first workflow proves useful." },
];

export function ProcessSection() {
  return (
    <section className="border-t border-line py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // How we work
        </span>
        <h2 className="mb-12 max-w-2xl text-3xl font-bold md:text-4xl">From a costly problem to a working system.</h2>
        <div className="grid gap-8 md:grid-cols-3 md:gap-10">
          {PROCESS_STEPS.map((step) => (
            <article key={step.n} className="border-t border-line pt-7">
              <span className="mb-3 block font-mono text-[0.8rem] tracking-[0.12em] text-editorial-accent">{step.n}</span>
              <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
              <p className="text-ink-soft">{step.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// Ported from public/js/home.js's #case-rows renderer: featured projects
// first, top 3, alternating image/copy sides (odd index flips), a
// browser-chrome mockup of the cover image when one exists, and a
// terminal-style fallback card when it doesn't — not a uniform card grid.
export function CaseStudiesSection() {
  const [projects, setProjects] = React.useState<Project[] | null>(null);
  React.useEffect(() => {
    api.projects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const picks = projects
    ? [...projects.filter((p) => p.is_featured), ...projects.filter((p) => !p.is_featured)].slice(0, 3)
    : null;

  return (
    <section className="border-t border-line py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // Proof, not promises
        </span>
        <h2 className="mb-10 max-w-2xl text-3xl font-bold md:text-4xl">See what has already shipped.</h2>

        <div>
          {picks
            ? picks.map((p, i) => {
                const num = String(i + 1).padStart(2, "0");
                const tag = p.tags?.[0]?.name ?? "Deployment";
                const badges = (p.tags ?? []).slice(0, 3);
                const flip = i % 2 === 1;
                const coverImage = typeof p.cover_image_path === "string" ? p.cover_image_path : null;

                return (
                  <div key={p.slug} className="group border-b border-line py-14 last:border-b-0">
                    <div className={cn("grid items-center gap-10 lg:grid-cols-2", flip && "lg:[&>*:first-child]:order-2")}>
                      <div className="border-l-2 border-heading pl-6">
                        <span className="mb-2 block font-mono text-[0.78rem] uppercase tracking-[0.08em] text-editorial-muted">
                          {num} / {tag}
                        </span>
                        <h3 className="mb-3 text-2xl font-bold">
                          <Link href={`/projects/${p.slug}`} className="text-heading">
                            {p.title}
                          </Link>
                        </h3>
                        <p className="text-ink-soft">{p.summary}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(badges.length ? badges.map((t) => t.name) : ["Vanilla PHP", "SQLite", "Bootstrap 5"]).map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded-lg border border-line px-[0.9rem] py-[0.45rem] font-mono text-[0.8rem] text-ink"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                        <Link href={`/projects/${p.slug}`} className="mt-4 inline-block text-sm font-semibold text-heading">
                          View case study <ArrowRight className="inline size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
                        </Link>
                      </div>

                      {coverImage ? (
                        <Link
                          href={`/projects/${p.slug}`}
                          aria-label={`View ${p.title} system`}
                          className="block overflow-hidden rounded-[var(--radius)] border border-line bg-card shadow-lg transition-transform duration-300 hover:-translate-y-1"
                        >
                          <span className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line bg-bg-soft/90 px-[0.8rem] py-[0.65rem]">
                            <span className="flex gap-[0.32rem]" aria-hidden="true">
                              <i className="size-[0.48rem] rounded-full bg-[#ff6258]" />
                              <i className="size-[0.48rem] rounded-full bg-[#f4bd3f]" />
                              <i className="size-[0.48rem] rounded-full bg-[#2dcf66]" />
                            </span>
                            <span className="overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-line px-[0.7rem] py-[0.38rem] text-center font-mono text-[0.62rem] font-semibold text-editorial-muted">
                              princecaleb.dev/systems/{p.slug}
                            </span>
                            <span className="inline-flex items-center gap-[0.35rem] font-mono text-[0.6rem] font-bold uppercase tracking-[0.04em] text-[#188452]">
                              <i className="size-[0.42rem] rounded-full bg-[#29d978] shadow-[0_0_9px_rgba(41,217,120,0.55)]" /> Live
                            </span>
                          </span>
                          <span className="grid min-h-[13rem] place-items-center bg-gradient-to-br from-bg-soft/90 to-card p-[0.65rem] md:min-h-[21rem]">
                            <Image
                              src={coverImage}
                              alt={`${p.title} system interface`}
                              width={800}
                              height={500}
                              unoptimized
                              className="h-auto max-h-96 w-full rounded-[0.35rem] border border-line object-contain"
                            />
                          </span>
                        </Link>
                      ) : (
                        <Link
                          href={`/projects/${p.slug}`}
                          className="block rounded-[var(--radius)] border border-line bg-bg-soft px-8 py-16 text-center transition-transform duration-300 hover:-translate-y-1"
                        >
                          <code className="mb-2 block text-[0.85rem] text-heading">{tag}</code>
                          <div className="font-mono text-[0.78rem] text-editorial-muted">architecture summary</div>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            : Array.from({ length: 1 }).map((_, i) => (
                <div key={i} className="grid gap-10 border-b border-line py-14 lg:grid-cols-2">
                  <div className="h-56 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
                  <div className="h-56 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
                </div>
              ))}
        </div>

        <div className="mt-10">
          <Button variant="brand-outline" size="pill" className="group" nativeButton={false} render={<Link href="/projects" />}>
            See all projects <ArrowRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}

const TESTIMONIALS = [
  {
    quote:
      "Prince took a vague idea and turned it into a real product in weeks, not months. He asked the right questions upfront so we never had to backtrack.",
    name: "Amara K.",
    role: "Founder, boutique retail brand",
  },
  {
    quote:
      "The performance difference was night and day. Our old site felt sluggish everywhere; the new one just feels instant, even on mobile.",
    name: "David O.",
    role: "Operations Lead, accounting firm",
  },
  {
    quote:
      "Clear communication the entire way through, and the app has needed almost zero maintenance since launch. Exactly what we needed.",
    name: "Maya T.",
    role: "Studio Owner, wellness & bookings",
  },
];

export function TestimonialsSection() {
  return (
    <section className="border-t border-line py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // Client signals
        </span>
        <h2 className="mb-10 text-3xl font-bold md:text-4xl">What clients say after launch.</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name} className="rounded-[var(--radius)] border-line p-6 shadow-none ring-0">
              <CardContent className="flex flex-col gap-3 p-0">
                <div className="text-[#f59e0b] tracking-[2px]">★★★★★</div>
                <p className="text-ink-soft">&ldquo;{t.quote}&rdquo;</p>
                <div>
                  <div className="font-semibold text-heading">{t.name}</div>
                  <div className="text-sm text-editorial-muted">{t.role}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="mt-8">
          <Button variant="brand-outline" size="pill" className="group" nativeButton={false} render={<Link href="/testimonials" />}>
            Read more reviews <ArrowRight className="size-4 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "How quickly can we launch the first useful version?",
    a: "Most projects start with one focused workflow and ship in 2 to 6 weeks depending on integrations, approvals, and how much existing process cleanup is needed.",
  },
  {
    q: "Do you only build AI agents, or full systems too?",
    a: "Both. I build voice and chat agents, automation pipelines, and the custom websites, dashboards, and portals those workflows need to run reliably.",
  },
  {
    q: "Can this integrate with our current tools?",
    a: "Yes. Typical integrations include calendars, CRMs, WhatsApp, email, payment tools, and internal reporting workflows. We map integration risk before implementation.",
  },
  {
    q: "What happens after launch?",
    a: "We review real usage, fix weak points, and iterate in small steps. The goal is measurable business outcomes, not shipping features and disappearing.",
  },
];

export function FaqSection() {
  return (
    <section className="border-t border-line py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
          // Frequently asked
        </span>
        <h2 className="mb-10 max-w-2xl text-3xl font-bold md:text-4xl">Questions people ask before we start.</h2>
        <Accordion defaultValue={["item-0"]} className="max-w-3xl">
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`item-${i}`} className="border-line">
              <AccordionTrigger className="text-base font-semibold">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-ink-soft">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

export function ClosingCtaSection() {
  return (
    <section className="border-t border-line py-24 text-center">
      <div className="mx-auto max-w-2xl px-4 sm:px-6">
        <h2 className="mb-3 text-3xl font-bold md:text-4xl">Stop letting good enquiries go cold.</h2>
        <p className="mb-6 text-lg text-ink-soft">
          Book a focused call. We&apos;ll identify one workflow worth improving and the smallest useful system to
          solve it.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button variant="brand" size="pill" nativeButton={false} render={<Link href="/book" />}>
            Book a 20-minute call
          </Button>
          <Button
            variant="brand-outline"
            size="pill"
            nativeButton={false}
            render={<a href="https://wa.me/233208049962" target="_blank" rel="noopener" />}
          >
            Ask on WhatsApp
          </Button>
        </div>
        <p className="mt-4 text-sm text-editorial-muted">No obligation. You&apos;ll leave with a clearer next step.</p>
      </div>
    </section>
  );
}
