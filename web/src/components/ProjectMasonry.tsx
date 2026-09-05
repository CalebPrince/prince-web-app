"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { DeviceShowcase } from "@/components/DeviceShowcase";
import { cn } from "@/lib/utils";
import { type SystemView } from "@/lib/systems";

/**
 * The work gallery: one project shown large, the rest in masonry columns
 * beside and beneath it.
 *
 * Every card shows the project on a laptop with its phone view standing in
 * front of it (DeviceShowcase, shared with the homepage hero), so a card
 * reads as a site someone can visit rather than a thumbnail in a box. It
 * replaces the tilted equal-sized tiles from the original Figma layout,
 * where six small mockups gave every project the same weight and none of
 * them room to be seen.
 *
 * Shared by the homepage and the /work index; what differs between them is
 * how the entrance is triggered, see `trigger` below.
 */

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** 200ms before the first card, then 150ms between each. */
const sectionVariants = (index: number): Variants => ({
  hidden: { opacity: 0, y: 40 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: 0.2 + index * 0.15, ease: EASE_OUT },
  },
});

/** How many cards the homepage asks for: one feature, two beside it, the
 *  rest in the masonry underneath. */
export const GALLERY_COUNT = 6;

/** The address bar. A project with a live site shows its real host; one
 *  without shows the slug, so the bar never invents a domain that resolves
 *  somewhere it should not. */
function addressFor(system: SystemView): string {
  if (system.live) {
    try {
      return new URL(system.live).host.replace(/^www\./, "");
    } catch {
      /* fall through to the slug */
    }
  }
  return `${system.slug}.preview`;
}

/** The seeded sample projects point at /uploads/placeholder-N.svg, a flat
 *  drawing of a browser that reads as a broken screenshot inside a real
 *  browser frame. Treat those as no image at all. */
function hasShot(system: SystemView): boolean {
  return Boolean(system.img) && !system.img.includes("/placeholder-");
}

function Shot({ system }: { system: SystemView }) {
  if (!hasShot(system)) {
    // No screenshot on file. An invented one would be a fabricated picture
    // of real client work, so the frame says what it is instead.
    return (
      <DeviceShowcase
        address={addressFor(system)}
        className="rounded-none border-0 border-b border-hairline"
        laptop={
          <div className="absolute inset-0 flex flex-col justify-end gap-1 p-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted">
              {system.category}
            </span>
            <span className="text-[11px] text-text-2">Screenshot to come</span>
          </div>
        }
      />
    );
  }

  // One screenshot, two screens: the laptop shows the page as captured, the
  // phone the same capture cropped to its left column, which is the part a
  // narrow viewport keeps. It is the project's own pixels either way.
  return (
    <DeviceShowcase
      address={addressFor(system)}
      className="rounded-none border-0 border-b border-hairline"
      laptop={
        <img
          src={system.img}
          alt={`${system.name}, ${system.category}`}
          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]"
        />
      }
      phone={
        <img
          src={system.img}
          alt=""
          aria-hidden="true"
          className="absolute left-0 top-0 h-full w-[220%] max-w-none object-cover object-left-top"
        />
      }
    />
  );
}

function CardShell({
  system,
  children,
  className,
}: {
  system: SystemView;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/work/${system.slug}`}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-bg-2 glass",
        "shadow-[var(--card-shadow)] transition-[transform,box-shadow,border-color] duration-300",
        "hover:-translate-y-1 hover:border-accent/40 hover:shadow-[var(--card-shadow-lift)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Everything under the image: what it is, what it was built with, and the
 *  way in. Laid out like the card it sits in, tags and link on one line. */
function CardBody({ system, large }: { system: SystemView; large?: boolean }) {
  const tags = system.stack.slice(0, large ? 4 : 2);

  return (
    <div className={cn("flex flex-1 flex-col gap-3", large ? "p-6 md:p-7" : "p-5")}>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
          {system.category}
        </p>
        {large && system.featured && (
          <span className="rounded bg-accent-soft px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
            Featured
          </span>
        )}
      </div>

      <h3
        className={cn(
          "font-semibold leading-tight tracking-tight",
          large ? "text-[clamp(1.6rem,2.5vw,2.2rem)]" : "text-[19px]",
        )}
      >
        {system.name}
      </h3>

      {system.desc && (
        <p className={cn("leading-relaxed text-text-2", large ? "max-w-xl" : "text-sm")}>
          {system.desc}
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag.name}
              className="rounded-full bg-bg-3 px-2.5 py-1 font-mono text-[11px] text-muted"
            >
              {tag.name}
            </span>
          ))}
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[13px] font-medium text-text group-hover:text-accent">
          View Project
          <ArrowUpRight className="size-3.5 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

function FeatureCard({ system }: { system: SystemView }) {
  return (
    <CardShell system={system}>
      <Shot system={system} />
      <CardBody system={system} large />
    </CardShell>
  );
}

function SmallCard({ system }: { system: SystemView }) {
  return (
    <CardShell system={system}>
      <Shot system={system} />
      <CardBody system={system} />
    </CardShell>
  );
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl border border-hairline bg-bg-2/50 glass",
        className,
      )}
    />
  );
}

interface ProjectMasonryProps {
  /** null renders the loading skeleton. */
  systems: SystemView[] | null;
  /**
   * "section" - every card waits on `state` and cascades 150ms apart, the
   * annotated behaviour for the homepage gallery.
   *
   * "item" - each card animates as it scrolls into view, staggered by column
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
  skeletonCount = GALLERY_COUNT,
}: ProjectMasonryProps) {
  if (systems === null) {
    return (
      <div className="flex flex-col gap-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <Skeleton className="h-[520px] lg:col-span-2" />
          <div className="hidden flex-col gap-8 lg:flex">
            <Skeleton className="h-[244px]" />
            <Skeleton className="h-[244px]" />
          </div>
        </div>
        <div className="gap-8 [column-fill:balance] md:columns-2 lg:columns-3">
          {Array.from({ length: Math.max(0, skeletonCount - 3) }, (_, i) => (
            <Skeleton key={i} className="mb-8 h-[380px] break-inside-avoid" />
          ))}
        </div>
      </div>
    );
  }

  const [feature, ...rest] = systems;
  if (!feature) return null;

  // Two cards ride beside the feature on a wide screen; everything after
  // that flows into the masonry below, which is where a long /work index
  // spends most of its length.
  const beside = rest.slice(0, 2);
  const below = rest.slice(2);

  const animation = (index: number) =>
    trigger === "section"
      ? { variants: sectionVariants(index), initial: "hidden" as const, animate: state }
      : {
          initial: { opacity: 0, y: 40 },
          whileInView: { opacity: 1, y: 0 },
          viewport: { once: true, amount: 0.15 },
          transition: { duration: 0.7, delay: (index % 3) * 0.15, ease: EASE_OUT },
        };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8 lg:grid-cols-3">
        <motion.div {...animation(0)} className="relative lg:col-span-2">
          {/* The one bloom in the section, behind the card that earns it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[520px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-[70px]"
          />
          <FeatureCard system={feature} />
        </motion.div>

        {beside.length > 0 && (
          <div className="flex flex-col gap-8">
            {beside.map((system, i) => (
              <motion.div key={system.slug} {...animation(i + 1)} className="flex-1">
                <SmallCard system={system} />
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {below.length > 0 && (
        <div className="gap-8 [column-fill:balance] md:columns-2 lg:columns-3">
          {below.map((system, i) => (
            <motion.div
              key={system.slug}
              {...animation(i + 3)}
              className="mb-8 break-inside-avoid"
            >
              <SmallCard system={system} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
