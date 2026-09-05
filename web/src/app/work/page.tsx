"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { ProjectMasonry } from "@/components/ProjectMasonry";
import { buttonVariants } from "@/components/ui/button";
import { IntakeCta } from "@/components/IntakeCta";
import { cn } from "@/lib/utils";
import { getSystems, categoriesOf, type SystemView } from "@/lib/systems";


export default function SelectedWork() {
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
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-16 md:px-10 md:pt-36 md:pb-20">
          <Reveal>
            <SectionLabel>Selected work</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              Proof, not promises.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Websites, applications and AI tools built for real businesses, with results worth
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

      {/* ── WORK GRID ───────────────────────────────────────── */}
      {/* The homepage's Selected Work cards, same component — the index is
          just the unfiltered version of the same gallery. */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        {failed && (
          <p className="py-20 text-center text-text-2">Could not load this work right now.</p>
        )}

        {systems !== null && !failed && shown.length === 0 && (
          <p className="py-20 text-center text-text-2">Nothing matches this filter yet.</p>
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
              <span className="text-accent">the next project.</span>
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
