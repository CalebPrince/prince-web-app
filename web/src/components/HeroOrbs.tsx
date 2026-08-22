"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

// Travel has to be large relative to the orb's softness to read as movement:
// a blob sliding 30px over 16s changes about 2px a second, which the eye
// files as "static". These amplitudes move the glow across a visible arc and
// breathe its brightness, which is what actually sells the motion.
//
// The softness is a radial gradient rather than filter: blur(). A 150px blur
// on a 36rem circle has to be re-rendered every frame the orb scales, which
// cost the hero roughly 13ms a frame on its own - the single most expensive
// thing on the page. A gradient reaches the same softness in one paint and
// then only ever gets moved.
const ORBS = [
  {
    className: "hero-orb -left-40 top-1/3 h-[36rem] w-[36rem]",
    style: { opacity: 0.55 },
    animate: {
      scale: [1, 1.3, 1],
      x: [0, 180, 0],
      y: [0, -130, 0],
      opacity: [0.55, 1, 0.55],
    },
    duration: 11,
  },
  {
    className: "hero-orb -right-32 top-10 h-[28rem] w-[28rem]",
    style: { opacity: 0.4 },
    animate: {
      scale: [1, 1.35, 1],
      x: [0, -200, 0],
      y: [0, 160, 0],
      opacity: [0.75, 0.38, 0.75],
    },
    duration: 14,
  },
];

export function HeroOrbs() {
  // Matches TiltCard: the ambient background motion is decorative, so an OS
  // "reduce motion" preference parks the orbs instead of animating them. The
  // CSS drift/glow keyframes are disabled by the media query in globals.css.
  const reduceMotion = useReducedMotion();

  // Nothing animates while the hero is off screen. The orbs are the tallest
  // thing on the page's frame budget, and the visitor reading the section
  // below should not be paying for motion nobody can see.
  const stage = useRef<HTMLDivElement>(null);
  const inView = useInView(stage, { amount: 0 });
  const running = inView && !reduceMotion;

  return (
    <div ref={stage} className="pointer-events-none absolute inset-0">
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className={orb.className}
          style={orb.style}
          animate={running ? orb.animate : undefined}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
