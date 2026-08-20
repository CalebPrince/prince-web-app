"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";

const SPRING = { stiffness: 260, damping: 24, mass: 0.4 };

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees at the card's edge. */
  maxTilt?: number;
  /** Cursor-tracking sheen over the surface. */
  glare?: boolean;
}

/**
 * Wraps a card so it tilts toward the cursor in 3D (perspective + rotateX/Y),
 * lifts with a matching drop shadow, and catches a soft glare. Mouse only —
 * touch pointers and prefers-reduced-motion both fall back to a flat card.
 */
export function TiltCard({ children, className, maxTilt = 7, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const tilt = reduceMotion ? 0 : maxTilt;

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);

  const rotateX = useSpring(useTransform(py, [0, 1], [tilt, -tilt]), SPRING);
  const rotateY = useSpring(useTransform(px, [0, 1], [-tilt, tilt]), SPRING);
  const scale = useSpring(useTransform(hover, [0, 1], [1, reduceMotion ? 1 : 1.015]), SPRING);
  const liftY = useSpring(useTransform(hover, [0, 1], [0, reduceMotion ? 0 : -4]), SPRING);

  const shadowOpacity = useSpring(useTransform(hover, [0, 1], [0, 0.45]), SPRING);
  const shadowX = useTransform(px, [0, 1], [14, -14]);
  const shadowY = useTransform(py, [0, 1], [10, -10]);
  const boxShadow = useTransform(
    [shadowX, shadowY, shadowOpacity],
    ([sx, sy, so]: number[]) => `${sx}px ${sy + 22}px 44px -14px rgba(0,0,0,${so})`,
  );

  const glareBackground = useTransform(
    [px, py],
    ([gx, gy]: number[]) =>
      `radial-gradient(circle at ${gx * 100}% ${gy * 100}%, var(--accent-soft), transparent 60%)`,
  );

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
  }

  function handlePointerEnter(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "mouse") return;
    hover.set(1);
  }

  function handlePointerLeave() {
    hover.set(0);
    px.set(0.5);
    py.set(0.5);
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointerMove}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      style={{ rotateX, rotateY, scale, y: liftY, boxShadow, transformPerspective: 1200 }}
      className={cn("relative isolate", className)}
    >
      {glare && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: glareBackground, opacity: shadowOpacity }}
        />
      )}
      {children}
    </motion.div>
  );
}
