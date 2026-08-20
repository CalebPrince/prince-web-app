"use client";

import { motion, useReducedMotion } from "framer-motion";

// Travel has to be large relative to the blur radius to read as movement: a
// 150px-blurred blob sliding 30px over 16s changes about 2px a second, which
// the eye files as "static". These amplitudes move the glow across a visible
// arc and breathe its brightness, which is what actually sells the motion.
const ORBS = [
  {
    className:
      "absolute -left-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-accent/25 blur-[150px]",
    animate: {
      scale: [1, 1.3, 1],
      x: [0, 180, 0],
      y: [0, -130, 0],
      opacity: [0.55, 1, 0.55],
    },
    duration: 11,
  },
  {
    className:
      "absolute -right-32 top-10 h-[28rem] w-[28rem] rounded-full bg-accent/18 blur-[130px]",
    animate: {
      scale: [1, 1.35, 1],
      x: [0, -200, 0],
      y: [0, 160, 0],
      opacity: [1, 0.5, 1],
    },
    duration: 14,
  },
];

export function HeroOrbs() {
  // Matches TiltCard: the ambient background motion is decorative, so an OS
  // "reduce motion" preference parks the orbs instead of animating them. The
  // CSS drift/glow keyframes are disabled by the media query in globals.css.
  const reduceMotion = useReducedMotion();

  return (
    <>
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          className={orb.className}
          animate={reduceMotion ? undefined : orb.animate}
          transition={{
            duration: orb.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}
