"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Formats the mid-animation float the same way regardless of decimals: no
 *  decimals gets thousand separators (38 -> "38", 1200 -> "1,200"); any
 *  decimals round to that many places without separators (the numbers this
 *  is used for are small enough that it doesn't matter). */
function formatValue(value: number, decimals: number): string {
  if (decimals > 0) return value.toFixed(decimals);
  return Math.round(value).toLocaleString();
}

export function AnimatedCounter({
  target,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.8,
}: {
  target: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // once: true - a stat that already counted up shouldn't re-run every time
  // it scrolls back into view.
  const inView = useInView(ref, { once: true, margin: "0px 0px -15% 0px" });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(target);

  useEffect(() => {
    if (!inView) return;
    if (reduceMotion) {
      setDisplay(target);
      return;
    }
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    });
    return () => controls.stop();
  }, [inView, target, duration, reduceMotion]);

  return (
    <span ref={ref}>
      {prefix}
      {formatValue(display, decimals)}
      {suffix}
    </span>
  );
}
