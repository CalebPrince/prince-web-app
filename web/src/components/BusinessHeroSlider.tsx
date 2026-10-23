"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, MessageCircle, Pause, Play, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { WebsiteDesignPreview } from "@/components/WebsiteDesignPreview";
import { ElonPosHeroMockup } from "@/components/ElonPosHeroMockup";
import { cn } from "@/lib/utils";
import type { ManagedContent } from "@/components/ProjectStandards";

const HERO = {
  eyebrow: "Business websites built for real work",
  title: "Websites that help your business **sell and serve**.",
  subtitle: "Custom business websites with ordering, payments, booking, WhatsApp and the tools your customers need to take the next step.",
};

// Elon POS, the business software Caleb sells and installs as an authorised agent. Enquiries come to him, so the
// button opens his contact form with Elon POS already chosen. The figures are the ones the Elon POS system has
// recorded (Caleb, 23 Oct 2026); the offer is ElonPOS's own launch offer.
const ELONPOS = {
  eyebrow: "Now available: Elon POS",
  title: "Run your whole business **from your phone**.",
  subtitle: "Track sales, stock, staff and payments live from anywhere. Instant payment alerts, WhatsApp orders and smart insights, built for businesses in Ghana.",
  proof: [
    { value: "GH¢ 10M+", label: "sales recorded" },
    { value: "100K+", label: "transactions" },
    { value: "100K+", label: "products tracked" },
  ],
};

const SLIDE_MS = 8000;
const SLIDES = ["Business websites", "Elon POS"];

function Title({ value }: { value: string }) {
  const match = value.match(/\*\*([^*]+)\*\*/);
  if (!match) return value;
  const start = match.index ?? 0;
  return <>{value.slice(0, start)}<span className="text-accent">{match[1]}</span>{value.slice(start + match[0].length)}</>;
}

export function BusinessHeroSlider({ content }: { content?: ManagedContent }) {
  const [index, setIndex] = useState(0);
  // stopped: the visitor pressed pause. focused: keyboard focus is inside the hero. The hero fills the screen, so
  // pausing on hover would stop it whenever the mouse is anywhere on the page; the pause button covers that instead.
  const [stopped, setStopped] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const paused = stopped || focused;
  const rootRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: number) => setIndex((next + SLIDES.length) % SLIDES.length), []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // advance on a timer, unless the visitor paused it, has focus inside the hero, or prefers less motion
  useEffect(() => {
    if (paused || reduced) return;
    const id = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, reduced, go]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
  };

  return (
    <div
      ref={rootRef}
      className="relative flex w-full flex-1 flex-col"
      role="region"
      aria-roledescription="carousel"
      aria-label="Highlights"
      onFocus={(e) => { if (e.target.matches(":focus-visible")) setFocused(true); }}
      onBlur={(e) => { if (!rootRef.current?.contains(e.relatedTarget as Node)) setFocused(false); }}
      onKeyDown={onKeyDown}
    >
      <div className="hero-slides flex-1">
        {/* slide 1: business websites */}
        <div
          className="hero-slide mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-12 px-6 pb-28 pt-32 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16"
          data-active={index === 0}
          aria-hidden={index !== 0}
          role="group"
          aria-roledescription="slide"
          aria-label={`1 of ${SLIDES.length}: ${SLIDES[0]}`}
          inert={index !== 0}
        >
          <div className="max-w-3xl">
            <div>
              <p className="portfolio-eyebrow mb-6">{HERO.eyebrow}</p>
              {/* the page's one h1 belongs to the first slide; the others use h2 */}
              <h1 className="portfolio-hero-title"><Title value={HERO.title} /></h1>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">{HERO.subtitle}</p>
            </div>

            <Link
              href="/working-together#security"
              className="group mt-8 inline-flex max-w-full items-center gap-3 text-sm text-text-2 transition-colors hover:text-text"
            >
              <span className="grid size-8 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-semibold text-text">
                  {content?.hero_security_title || "Secure by design."}
                  <ArrowRight className="size-3.5 shrink-0 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
                <span className="mt-0.5 block leading-relaxed">
                  {content?.hero_security_text || "Risk-led scope, minimum access and verified handover."}
                </span>
              </span>
            </Link>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link href="/request?service=business-website" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Start your business website <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="https://wa.me/233535801359" className="portfolio-text-link">
                <MessageCircle className="size-4" /> Chat on WhatsApp
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl lg:ml-auto lg:mr-0">
            <WebsiteDesignPreview />
          </div>
        </div>

        {/* slide 2: Elon POS */}
        <div
          className="hero-slide mx-auto grid w-full max-w-[1400px] grid-cols-1 items-center gap-12 px-6 pb-28 pt-32 md:px-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14"
          data-active={index === 1}
          aria-hidden={index !== 1}
          role="group"
          aria-roledescription="slide"
          aria-label={`2 of ${SLIDES.length}: ${SLIDES[1]}`}
          inert={index !== 1}
        >
          <div className="max-w-3xl">
            <span className="elonpos-chip mb-6">
              <img src="/images/elonpos-mark.png" alt="" />
              Elon POS <span>Smart. Simple. Powerful.</span>
            </span>
            <p className="portfolio-eyebrow mb-6">{ELONPOS.eyebrow}</p>
            <h2 className="portfolio-hero-title"><Title value={ELONPOS.title} /></h2>
            <p className="mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">{ELONPOS.subtitle}</p>

            <div className="elonpos-offer mt-7 max-w-xl">
              <span aria-hidden="true" className="text-xl">&#9733;</span>
              <span><b>Launch offer:</b> the software is free. You only pay for installation, with no monthly subscription.</span>
            </div>

            <div className="elonpos-proof mt-5 max-w-xl">
              {ELONPOS.proof.map((p) => (
                <div key={p.label}><b>{p.value}</b><span>{p.label}</span></div>
              ))}
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link href="/contact?interest=elon-pos#contact-form" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Get Elon POS <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="https://wa.me/233535801359?text=Hello%2C%20I%27d%20like%20to%20know%20more%20about%20Elon%20POS." className="portfolio-text-link">
                <MessageCircle className="size-4" /> Ask about Elon POS on WhatsApp
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-2xl lg:ml-auto lg:mr-0">
            <ElonPosHeroMockup />
          </div>
        </div>
      </div>

      {/* controls: previous, a dot per slide, next */}
      <div className="absolute inset-x-0 bottom-16 z-10 flex items-center justify-center gap-4 md:bottom-20">
        <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide"
          className="grid size-9 place-items-center rounded-full border border-hairline text-text-2 transition-colors hover:border-accent/50 hover:text-accent">
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          {SLIDES.map((name, i) => (
            <button key={name} type="button" onClick={() => go(i)} aria-label={`Show slide ${i + 1}: ${name}`}
              aria-current={i === index} className="hero-dot" />
          ))}
        </div>
        <button type="button" onClick={() => go(index + 1)} aria-label="Next slide"
          className="grid size-9 place-items-center rounded-full border border-hairline text-text-2 transition-colors hover:border-accent/50 hover:text-accent">
          <ChevronRight className="size-4" />
        </button>
        {!reduced && (
          <button type="button" onClick={() => setStopped(!stopped)} aria-label={stopped ? "Play the slides" : "Pause the slides"}
            className="grid size-9 place-items-center rounded-full border border-hairline text-text-2 transition-colors hover:border-accent/50 hover:text-accent">
            {stopped ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
