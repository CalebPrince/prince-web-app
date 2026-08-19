"use client";

import { motion } from "framer-motion";

export function HeroOrbs() {
  return (
    <>
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.2, 0.3, 0.2],
          x: [0, 30, 0],
          y: [0, -30, 0],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -left-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-accent/20 blur-[140px]"
      />
      <motion.div
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.1, 0.15, 0.1],
          x: [0, -40, 0],
          y: [0, 40, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute -right-32 top-10 h-[28rem] w-[28rem] rounded-full bg-accent/10 blur-[120px]"
      />
    </>
  );
}
