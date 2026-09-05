"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import {
  motion,
  useInView,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "framer-motion";
import { CARD_SLOTS, ProjectMasonry } from "@/components/ProjectMasonry";
import { getFeaturedSystems, type SystemView } from "@/lib/systems";

/**
 * The homepage's "Selected Work" gallery — the marker bar, the masonry of
 * tilted browser mockups (ProjectMasonry, shared with the /work index) and
 * the specs legend.
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

const headerVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE_OUT } },
};

const underlineVariants: Variants = {
  hidden: { scaleX: 0 },
  show: { scaleX: 1, transition: { duration: 0.8, delay: 0.4, ease: EASE_SWEEP } },
};

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
    getFeaturedSystems(CARD_SLOTS.length)
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
        className="mb-16 flex flex-col gap-4"
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

      <ProjectMasonry systems={systems} trigger="section" state={state} />

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
