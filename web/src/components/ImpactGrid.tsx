"use client";

import { motion, useReducedMotion } from "framer-motion";

/** A faint network/circuit pattern behind the impact stats - dots on a
 *  diagonal grid with a few connecting lines and slowly pulsing nodes, low
 *  opacity so it reads as texture rather than competing with the numbers.
 *  Same accent-glow language as HeroOrbs, but a "data" motif instead of a
 *  soft blob, since this section is about credibility/proof, not mood. */
const NODES = [
  { cx: 90, cy: 60, r: 3, delay: 0 },
  { cx: 340, cy: 40, r: 2.5, delay: 0.6 },
  { cx: 620, cy: 90, r: 3, delay: 1.2 },
  { cx: 860, cy: 50, r: 2.5, delay: 1.8 },
  { cx: 210, cy: 200, r: 2.5, delay: 0.3 },
  { cx: 480, cy: 230, r: 3, delay: 0.9 },
  { cx: 740, cy: 190, r: 2.5, delay: 1.5 },
  { cx: 1000, cy: 220, r: 3, delay: 2.1 },
];

const LINES = [
  "M90,60 L340,40 L480,230 L210,200 Z",
  "M340,40 L620,90 L740,190 L480,230",
  "M620,90 L860,50 L1000,220 L740,190",
];

export function ImpactGrid() {
  const reduceMotion = useReducedMotion();

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 h-full w-full opacity-[0.14]"
      viewBox="0 0 1100 280"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="impact-dots" width="46" height="46" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" className="text-text-3" />
        </pattern>
      </defs>
      <rect width="1100" height="280" fill="url(#impact-dots)" />
      {LINES.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth="1" fill="none" className="text-accent" />
      ))}
      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.cx}
          cy={n.cy}
          r={n.r}
          className="fill-accent"
          animate={
            reduceMotion
              ? undefined
              : { opacity: [0.3, 1, 0.3], scale: [1, 1.6, 1] }
          }
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: n.delay }}
        />
      ))}
    </svg>
  );
}
