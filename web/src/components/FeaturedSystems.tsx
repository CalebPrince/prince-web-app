"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { TiltCard } from "@/components/TiltCard";
import { cn } from "@/lib/utils";
import { getFeaturedSystems, type SystemView } from "@/lib/systems";

// Three cards, so the grid gets its own rhythm rather than the Systems
// page's repeating one: two side by side, then a full-width closer.
const LAYOUT = [
  { span: "lg:col-span-7", ratio: "aspect-[16/10]" },
  { span: "lg:col-span-5", ratio: "aspect-[4/5]" },
  { span: "lg:col-span-12", ratio: "aspect-[21/9]" },
];

/**
 * The homepage showcase. Which projects appear is controlled from the admin
 * Projects form - tick "Display on homepage" and set sort order; the first
 * three win.
 */
export function FeaturedSystems() {
  const [systems, setSystems] = useState<SystemView[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getFeaturedSystems()
      .then(setSystems)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  if (systems === null) {
    return (
      <div className="grid gap-x-6 gap-y-16 lg:grid-cols-12">
        {LAYOUT.map((l, i) => (
          <div
            key={i}
            className={cn(
              "animate-pulse rounded-[var(--radius)] border border-hairline bg-bg-2/50",
              l.span,
              l.ratio,
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-x-6 gap-y-16 lg:grid-cols-12">
      {systems.map((p, i) => {
        const layout = LAYOUT[i] ?? LAYOUT[LAYOUT.length - 1];
        return (
          <Reveal key={p.slug} className={layout.span} delay={(i % 2) * 100}>
            <Link href={`/systems/${p.slug}`} className="group block">
              <TiltCard
                maxTilt={5}
                className={cn(
                  "relative overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2",
                  layout.ratio,
                )}
              >
                {p.img && (
                  <img
                    src={p.img}
                    alt={`${p.name} - ${p.category}`}
                    className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-bg/60 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                {p.result && (
                  <span className="absolute left-5 top-5 rounded-full border border-accent/40 bg-bg/50 px-3 py-1.5 text-[0.7rem] font-medium text-accent backdrop-blur-md">
                    {p.result}
                  </span>
                )}
                <div className="absolute right-5 top-5 flex size-11 items-center justify-center rounded-full border border-text/20 bg-bg/40 opacity-0 backdrop-blur-md transition-all duration-500 group-hover:opacity-100">
                  <ArrowUpRight className="size-5 text-text" />
                </div>
              </TiltCard>
              <div className="mt-6 flex items-start justify-between gap-6">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="label text-accent">{p.category}</span>
                    {p.year && <span className="label text-muted">/ {p.year}</span>}
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight md:text-3xl">{p.name}</h3>
                  <p className="mt-2 max-w-md text-text-2">{p.desc}</p>
                </div>
              </div>
            </Link>
          </Reveal>
        );
      })}
    </div>
  );
}
