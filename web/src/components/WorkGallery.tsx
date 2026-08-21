"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, MousePointer2 } from "lucide-react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { getFeaturedSystems, type SystemView } from "@/lib/systems";

/**
 * The "Selected Work" gallery — a hand-set masonry of tilted browser mockups.
 *
 * Ported from the Landing Pages Figma file (node 25:4). The design's timings
 * come from its animation annotations and are reproduced exactly:
 *
 *   - the whole section is one scroll trigger (IntersectionObserver, 15%),
 *     so the stagger reads top-left -> bottom-right no matter how tall the
 *     grid gets on the viewport;
 *   - header 600ms, underline sweep 800ms after a 400ms hold,
 *     cards 700ms each on a 150ms stagger starting at 200ms.
 *
 * Colours are the site's own tokens rather than the file's cyan-on-black, so
 * the section reads correctly in both the dark and the light theme.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const EASE_SWEEP = [0.22, 1, 0.36, 1] as const;

/** Per-card rhythm from the design: rotation, column offset, mockup height. */
const SLOTS = [
  { rotate: -2, offset: "pt-0", shot: "h-40" },
  { rotate: 1.5, offset: "pt-5", shot: "h-40" },
  { rotate: -0.5, offset: "pt-12", shot: "h-[220px]", glow: true, pill: true },
  { rotate: 2.2, offset: "pt-4", shot: "h-40" },
  { rotate: -1.8, offset: "pt-2.5", shot: "h-40" },
  { rotate: 3, offset: "pt-10", shot: "h-40", accent: true },
] as const;

const cardVariants = (index: number): Variants => ({
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    // 200ms for the first card, 150ms between each after it.
    transition: { duration: 0.7, delay: 0.2 + index * 0.15, ease: EASE_OUT },
  },
});

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
};

const underlineVariants: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.8, delay: 0.4, ease: EASE_SWEEP } },
};

/** Browser-chrome traffic lights. Fixed hues in both themes, as designed. */
function WindowDots() {
  return (
    <div className="flex h-2 w-9 shrink-0 items-center gap-1.5" aria-hidden="true">
      <span className="block size-2 rounded-full bg-[#ff5f57]" />
      <span className="block size-2 rounded-full bg-[#febc2e]" />
      <span className="block size-2 rounded-full bg-[#28c840]" />
    </div>
  );
}

function ProjectCard({
  system,
  slot,
}: {
  system: SystemView;
  slot: (typeof SLOTS)[number];
}) {
  const accent = "accent" in slot && slot.accent;
  const tags = system.stack.slice(0, 3);

  return (
    <Link href={`/systems/${system.slug}`} className="group block">
      <div className="[transform-style:preserve-3d]" style={{ rotate: `${slot.rotate}deg` }}>
        <div
          className={cn(
            // 300ms hover lift: scale 1.03 and the shadow blur opening up.
            "relative flex flex-col gap-4 rounded-2xl border bg-bg-2 p-5",
            "shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-300",
            "group-hover:scale-[1.03] group-hover:shadow-[var(--card-shadow-lift)]",
            accent ? "border-accent" : "border-hairline group-hover:border-accent/40",
          )}
        >
          {accent && (
            <span
              aria-hidden="true"
              className="gallery-pulse pointer-events-none absolute inset-0 rounded-2xl"
            />
          )}

          {/* card-meta */}
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
              {system.category}
            </p>
            {"pill" in slot && slot.pill && system.featured && (
              <span className="rounded bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                Featured
              </span>
            )}
          </div>

          {/* browser-mockup */}
          <div
            className={cn(
              "flex w-full flex-col overflow-hidden rounded-lg border border-hairline bg-bg-3",
              slot.shot,
            )}
          >
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline bg-bg-2 px-3">
              <WindowDots />
              <div className="flex h-[18px] w-[180px] items-center justify-center rounded bg-bg px-2">
                <p className="truncate font-mono text-[9px] text-muted">
                  {system.slug}.preview
                </p>
              </div>
              <div className="h-2.5 w-8 shrink-0" />
            </div>
            <div className="relative min-h-0 flex-1">
              {system.img ? (
                <img
                  src={system.img}
                  alt={`${system.name} — ${system.category}`}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                />
              ) : (
                <div className="absolute inset-0 bg-bg-3" />
              )}
            </div>
          </div>

          {/* card-info */}
          <div className="flex flex-col gap-3">
            <h3 className="text-[22px] font-semibold leading-tight tracking-tight">
              {system.name}
            </h3>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag.name}
                    className="rounded bg-bg-3 px-2 py-1 font-mono text-[11px] text-muted"
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            )}
            <div className="h-px w-full bg-hairline" />
            <div
              className={cn(
                "flex items-center gap-1.5 font-mono text-[13px] font-medium",
                accent ? "text-accent" : "text-text",
              )}
            >
              View Project
              <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function WorkGallery() {
  const [systems, setSystems] = useState<SystemView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // One trigger for the whole section, at the annotated 15% threshold.
  const inView = useInView(sectionRef, { once: true, amount: 0.15 });
  const state = reduceMotion || inView ? "show" : "hidden";

  // The scroll cue fades out as the section's end climbs past the viewport.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["end end", "end start"],
  });
  const cueOpacity = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  useEffect(() => {
    getFeaturedSystems(SLOTS.length)
      .then(setSystems)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;

  const cards = systems ?? [];

  return (
    <div ref={sectionRef} className="relative">
      {/* bg-grid-mesh — evenly spaced hairlines behind the whole section. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-50"
        style={{
          backgroundImage: "linear-gradient(to bottom, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "100% 6.6667%",
        }}
      />

      {/* The section's own headings live in page.tsx; what the design's
          header contributes here is the sweeping marker bar under them and
          the line of gallery copy. */}
      <motion.div
        variants={headerVariants}
        initial="hidden"
        animate={state}
        className="flex flex-col gap-4"
      >
        <div className="h-1 w-[120px] overflow-hidden rounded-sm bg-bg-3">
          <motion.span
            variants={underlineVariants}
            initial="hidden"
            animate={state}
            style={{ originX: 0 }}
            className="ml-3 block h-full w-10 bg-accent shadow-[0_0_4px_0_var(--accent)]"
          />
        </div>
        <p className="max-w-[540px] text-base leading-relaxed text-text-2">
          A curated display of high-fidelity interfaces, web applications and digital
          products, each one shipped and running in production.
        </p>
      </motion.div>

      {/* masonry-grid — CSS columns, so cards reflow on resize while keeping
          their own rotation, offset and proportions. */}
      <div className="mt-16 gap-8 [column-fill:balance] md:columns-2 lg:columns-3">
        {systems === null
          ? SLOTS.map((slot, i) => (
              <div key={i} className={cn("mb-9 break-inside-avoid", slot.offset)}>
                <div className="h-[340px] animate-pulse rounded-2xl border border-hairline bg-bg-2/50" />
              </div>
            ))
          : cards.map((system, i) => {
              const slot = SLOTS[i % SLOTS.length];
              const accent = "accent" in slot && slot.accent;
              return (
                <motion.div
                  key={system.slug}
                  variants={cardVariants(i)}
                  initial="hidden"
                  animate={state}
                  className={cn("relative mb-9 break-inside-avoid", slot.offset)}
                >
                  {"glow" in slot && slot.glow && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[480px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[60px]"
                    />
                  )}
                  <ProjectCard system={system} slot={slot} />
                  {accent && (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -bottom-3 right-10 flex items-center gap-2 rounded-full border border-accent bg-bg-2 px-3 py-2 shadow-[var(--card-shadow)]"
                    >
                      <MousePointer2 className="size-4 text-accent" aria-hidden="true" />
                      <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-accent">
                        HOVER
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}
      </div>

      {/* gallery-footer-legend */}
      <div className="flex flex-col items-start justify-between gap-6 pt-10 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-6 font-mono text-xs text-muted">
          <p>[ MAS0{cards.length}: {cards.length} MOCKUP{cards.length === 1 ? "" : "S"} ACTIVE ]</p>
          <p>[ ACCENT: SIGNAL_GREEN ]</p>
        </div>
        <motion.div style={{ opacity: cueOpacity }} className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-[0.12em]">SCROLL TO EXPLORE</span>
          <ArrowDown className="gallery-bounce size-3 text-accent" aria-hidden="true" />
        </motion.div>
      </div>
    </div>
  );
}
