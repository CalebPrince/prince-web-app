"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { WebsiteDesignPreview } from "@/components/WebsiteDesignPreview";
import { cn } from "@/lib/utils";
import type { ManagedContent } from "@/components/ProjectStandards";

const serviceSlides = [
  {
    eyebrow: "Business websites built for real work",
    title: "Websites that help your business **sell and serve**.",
    subtitle: "Custom business websites with ordering, payments, booking, WhatsApp and the tools your customers need to take the next step.",
  },
  {
    eyebrow: "WhatsApp business automation",
    title: "Turn more conversations into **customers**.",
    subtitle: "Capture enquiries, answer common questions, send payment links and follow up without making your team copy information between apps.",
  },
  {
    eyebrow: "AI customer service",
    title: "Respond even when your team is **busy**.",
    subtitle: "Give customers useful answers across your website, WhatsApp and phone, then hand important conversations to a person at the right moment.",
  },
  {
    eyebrow: "Business automation",
    title: "Stop repeating work your systems can **handle**.",
    subtitle: "Connect enquiries, orders, payments and follow-up into one dependable workflow built around how your business already operates.",
  },
];

function Title({ value }: { value: string }) {
  const match = value.match(/\*\*([^*]+)\*\*/);
  if (!match) return value;
  const start = match.index ?? 0;
  return <>{value.slice(0, start)}<span className="text-accent">{match[1]}</span>{value.slice(start + match[0].length)}</>;
}

export function BusinessHeroSlider({ content }: { content?: ManagedContent }) {
  const slides = serviceSlides;
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const slide = slides[active];

  return (
    <div className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-12 px-6 pb-20 pt-32 md:px-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <div className="max-w-3xl">
        <div key={active} className="hero-slide-fade">
          <p className="portfolio-eyebrow mb-6">{slide.eyebrow}</p>
          <h1 className="portfolio-hero-title"><Title value={slide.title} /></h1>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-text-2 md:text-xl">{slide.subtitle}</p>
        </div>

        <div className="mt-8 flex items-center gap-2" aria-label="Choose a hero message">
          {slides.map((item, index) => (
            <button
              key={item.eyebrow}
              type="button"
              aria-label={`Show ${item.eyebrow}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
              className={cn("h-1.5 rounded-full transition-all duration-300", active === index ? "w-10 bg-accent" : "w-5 bg-text-3/40 hover:bg-text-3")}
            />
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <Link href="/request?service=business-website" className={cn(buttonVariants({ size: "lg" }), "group")}>
            Start your business website <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <Link href="https://wa.me/233535801359" className="portfolio-text-link">
            <MessageCircle className="size-4" /> Chat on WhatsApp
          </Link>
        </div>

        <Link
          href="/working-together#security"
          className="group mt-8 inline-flex items-center gap-3 border-t border-hairline pt-5 text-sm text-text-2 transition-colors hover:text-text"
        >
          <span className="grid size-8 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <span>
            <strong className="font-semibold text-text">{content?.hero_security_title || "Secure by design."}</strong>{" "}
            {content?.hero_security_text || "Risk-led scope, minimum access and verified handover."}
          </span>
          <ArrowRight className="ml-1 size-3.5 shrink-0 text-accent transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="relative mx-auto w-full max-w-2xl lg:ml-auto lg:mr-0">
        <WebsiteDesignPreview />
      </div>
    </div>
  );
}
