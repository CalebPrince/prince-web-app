"use client";

import { useEffect, useRef } from "react";

/** Replaces the OS pointer with a small dot plus a larger ring that trails
 *  it slightly (the ring's transform transition does the trailing - no
 *  spring library needed) and grows over anything clickable. Desktop/mouse
 *  only: pointer:coarse devices (touch) never get it, so nothing here can
 *  strand a dead cursor on mobile or block tap targets. */
export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    document.documentElement.classList.add("custom-cursor-active");

    const place = (el: HTMLDivElement, x: number, y: number) => {
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };

    const move = (e: MouseEvent) => {
      // Not just mouseenter: if the page loads with the mouse already
      // resting over the content, mouseenter never fires, so the first real
      // movement is what has to reveal the cursor.
      dot.classList.remove("is-hidden");
      ring.classList.remove("is-hidden");
      place(dot, e.clientX, e.clientY);
      place(ring, e.clientX, e.clientY);
    };

    const isInteractive = (el: EventTarget | null) =>
      el instanceof Element &&
      !!el.closest('a, button, [role="button"], input, textarea, select, summary, label');

    const over = (e: MouseEvent) => {
      if (isInteractive(e.target)) ring.classList.add("is-hovering");
    };
    const out = (e: MouseEvent) => {
      if (isInteractive(e.target)) ring.classList.remove("is-hovering");
    };

    const hide = () => {
      dot.classList.add("is-hidden");
      ring.classList.add("is-hidden");
    };
    const show = () => {
      dot.classList.remove("is-hidden");
      ring.classList.remove("is-hidden");
    };

    window.addEventListener("mousemove", move, { passive: true });
    document.addEventListener("mouseover", over, { passive: true });
    document.addEventListener("mouseout", out, { passive: true });
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mouseenter", show);

    return () => {
      document.documentElement.classList.remove("custom-cursor-active");
      window.removeEventListener("mousemove", move);
      document.removeEventListener("mouseover", over);
      document.removeEventListener("mouseout", out);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("mouseenter", show);
    };
  }, []);

  return (
    <>
      <div ref={ringRef} className="custom-cursor-ring is-hidden" aria-hidden="true" />
      <div ref={dotRef} className="custom-cursor-dot is-hidden" aria-hidden="true" />
    </>
  );
}
