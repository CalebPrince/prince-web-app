"use client";

import Link from "next/link";
import { ArrowUpRight, MousePointer2 } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";
import { type SystemView } from "@/lib/systems";

/**
 * The tilted browser-mockup cards from the Landing Pages Figma file
 * (node 25:4), laid out as a masonry.
 *
 * Shared by the homepage's Selected Work gallery and the Systems index, so
 * the two read as one design. The card is identical in both; what differs is
 * how the entrance is triggered — see `trigger` below.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

interface Slot {
  rotate: number;
  offset: string;
  shot: string;
  /** Accent bloom behind the card. */
  glow?: boolean;
  /** Shows the Featured pill, when the project is actually flagged. */
  pill?: boolean;
  /** The design's one highlighted card: accent border, pulse, HOVER cue. */
  accent?: boolean;
}

/** Per-card rhythm from the design: rotation, column offset, mockup height.
 *  Grids longer than six cards cycle back through it. */
export const CARD_SLOTS: Slot[] = [
  { rotate: -2, offset: "pt-0", shot: "h-40" },
  { rotate: 1.5, offset: "pt-5", shot: "h-40" },
  { rotate: -0.5, offset: "pt-12", shot: "h-[220px]", glow: true, pill: true },
  { rotate: 2.2, offset: "pt-4", shot: "h-40" },
  { rotate: -1.8, offset: "pt-2.5", shot: "h-40" },
  { rotate: 3, offset: "pt-10", shot: "h-40", accent: true },
];

/** The rhythm repeats past six cards, but the one-off flourishes do not: a
 *  long index would otherwise sprout an accent card and a HOVER cue every
 *  sixth tile. Later cycles keep only the geometry. */
function slotFor(index: number): Slot {
  const base = CARD_SLOTS[index % CARD_SLOTS.length];
  if (index < CARD_SLOTS.length) return base;
  return { rotate: base.rotate, offset: base.offset, shot: base.shot };
}

/** 200ms before the first card, then 150ms between each, as annotated. */
const sectionVariants = (index: number): Variants => ({
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.7, delay: 0.2 + index * 0.15, ease: EASE_OUT },
  },
});

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

function ProjectCard({ system, slot }: { system: SystemView; slot: Slot }) {
  const accent = slot.accent;
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
            {slot.pill && system.featured && (
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
                <p className="truncate font-mono text-[9px] text-muted">{system.slug}.preview</p>
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

interface ProjectMasonryProps {
  /** null renders the loading skeleton. */
  systems: SystemView[] | null;
  /**
   * "section" — every card waits on `state` and cascades 150ms apart, the
   * annotated behaviour for the homepage's six-card gallery.
   *
   * "item" — each card animates as it scrolls into view, staggered by column
   * only. A full index can run to dozens of cards, and one cascade across all
   * of them would leave the last waiting seconds after it was already on
   * screen.
   */
  trigger: "section" | "item";
  /** Required by trigger="section": the parent's in-view state. */
  state?: "hidden" | "show";
  skeletonCount?: number;
}

export function ProjectMasonry({
  systems,
  trigger,
  state = "show",
  skeletonCount = CARD_SLOTS.length,
}: ProjectMasonryProps) {
  // CSS columns, so cards reflow on resize while keeping their own rotation,
  // offset and proportions.
  return (
    <div className="gap-8 [column-fill:balance] md:columns-2 lg:columns-3">
      {systems === null
        ? Array.from({ length: skeletonCount }, (_, i) => (
            <div key={i} className={cn("mb-9 break-inside-avoid", slotFor(i).offset)}>
              <div className="h-[340px] animate-pulse rounded-2xl border border-hairline bg-bg-2/50" />
            </div>
          ))
        : systems.map((system, i) => {
            const slot = slotFor(i);
            const motionProps =
              trigger === "section"
                ? { variants: sectionVariants(i), initial: "hidden" as const, animate: state }
                : {
                    initial: { opacity: 0, y: 40, scale: 0.95 },
                    whileInView: { opacity: 1, y: 0, scale: 1 },
                    viewport: { once: true, amount: 0.15 },
                    transition: {
                      duration: 0.7,
                      delay: (i % 3) * 0.15,
                      ease: EASE_OUT,
                    },
                  };

            return (
              <motion.div
                key={system.slug}
                {...motionProps}
                className={cn("relative mb-9 break-inside-avoid", slot.offset)}
              >
                {slot.glow && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[480px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[60px]"
                  />
                )}
                <ProjectCard system={system} slot={slot} />
                {slot.accent && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -bottom-3 right-10 flex items-center gap-2 rounded-full border border-accent bg-bg-2 px-3 py-2 shadow-[var(--card-shadow)]"
                  >
                    <MousePointer2 className="size-4 text-accent" />
                    <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-accent">
                      HOVER
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
    </div>
  );
}
