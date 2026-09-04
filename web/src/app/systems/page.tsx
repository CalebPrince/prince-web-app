"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { TiltCard } from "@/components/TiltCard";
import { ProjectMasonry } from "@/components/ProjectMasonry";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { getSystems, categoriesOf, type SystemView } from "@/lib/systems";

const SIGNALS = [
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
      "The voice agent books calls while we sleep. We stopped losing after-hours leads almost overnight, it paid for itself in the first month.",
    name: "Lena M.",
    role: "Director, home services company",
  },
];

export default function Systems() {
  const [systems, setSystems] = useState<SystemView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    getSystems()
      .then(setSystems)
      .catch(() => setFailed(true));
  }, []);

  const filters = useMemo(() => ["All", ...categoriesOf(systems ?? [])], [systems]);
  const shown = useMemo(
    () => (systems ?? []).filter((s) => filter === "All" || s.category === filter),
    [systems, filter],
  );

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Systems</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Proof, not promises.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              See what has already shipped &mdash; real systems, running in real businesses, with results worth
              measuring.
            </p>
          </Reveal>

          {/* Filter */}
          {filters.length > 1 && (
            <Reveal delay={240} className="mt-12 flex flex-wrap gap-2.5">
              {filters.map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "label rounded-full border px-4 py-2.5 transition-colors",
                    filter === f
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-hairline text-text-2 hover:border-hairline-strong hover:text-text",
                  )}
                >
                  {f}
                </button>
              ))}
            </Reveal>
          )}
        </div>
      </section>

      {/* ── SYSTEMS GRID ────────────────────────────────────── */}
      {/* The homepage's Selected Work cards, same component — the index is
          just the unfiltered version of the same gallery. */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        {failed && (
          <p className="py-20 text-center text-text-2">Could not load systems right now.</p>
        )}

        {systems !== null && !failed && shown.length === 0 && (
          <p className="py-20 text-center text-text-2">No systems match this filter yet.</p>
        )}

        {!failed && (
          <ProjectMasonry
            // Remounting on a filter change lets the incoming cards play
            // their entrance rather than snapping into place.
            key={filter}
            systems={systems === null ? null : shown}
            trigger="item"
          />
        )}
      </section>

      {/* ── PROOF · CLIENT SIGNALS ──────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel>Client signals</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              What clients say after launch.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {SIGNALS.map((t, i) => (
              <Reveal key={t.name} delay={i * 90} className={cn(i === 1 && "md:mt-10")}>
                <TiltCard className="flex h-full flex-col justify-between rounded-[var(--radius)] border border-hairline bg-bg/60 p-8 transition-colors hover:border-accent/30 glass">
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
                    <p className="label mt-1 text-muted">{t.role}</p>
                  </div>
                </TiltCard>
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
              Your business could be
              <br />
              <span className="text-accent">the next system.</span>
            </h2>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <IntakeCta kind="booking">Book a Call</IntakeCta>
              <Link href="/services" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Explore services
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
