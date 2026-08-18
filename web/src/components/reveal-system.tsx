"use client";

import * as React from "react";

// Ported from public/js/animations.js — same framework-agnostic DOM-scanning
// approach (not a per-component React hook), so any page opts in just by
// rendering elements with these class names/attributes; no page needs to
// import or wire anything itself. Mounted once in the root layout.
//
// Covers: .reveal/.reveal-on-scroll fade-slide-in on scroll (+ .reveal-delay-N,
// .reveal-card, .reveal-cta variants via CSS in globals.css), [data-count-to]
// number count-up, and .depth-card pointer-tilt on fine-pointer devices. A
// MutationObserver picks up elements added later (e.g. CaseStudiesSection's
// fetch-driven project cards) without those components needing to know
// anything about this system.
export function RevealSystem() {
  React.useEffect(() => {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsFinePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const noIO = !("IntersectionObserver" in window);

    const revealObserver =
      !prefersReducedMotion && !noIO
        ? new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  entry.target.classList.add("is-visible");
                  revealObserver!.unobserve(entry.target);
                }
              });
            },
            { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
          )
        : null;

    function watchReveal(el: Element) {
      if (prefersReducedMotion || noIO) {
        el.classList.add("is-visible");
      } else {
        revealObserver!.observe(el);
      }
    }

    function animateCount(el: HTMLElement) {
      const target = Number(el.dataset.countTo);
      const prefix = el.dataset.countPrefix || "";
      const suffix = el.dataset.countSuffix || "";

      if (prefersReducedMotion) {
        el.textContent = `${prefix}${target}${suffix}`;
        return;
      }

      const duration = 1200;
      const start = performance.now();
      function tick(now: number) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    const countObserver = noIO
      ? null
      : new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                animateCount(entry.target as HTMLElement);
                countObserver!.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.5 }
        );

    function watchCount(el: HTMLElement) {
      if (noIO) {
        animateCount(el);
      } else {
        countObserver!.observe(el);
      }
    }

    function addDepthCard(el: HTMLElement) {
      if (prefersReducedMotion || !supportsFinePointer || el.dataset.depthReady === "1") return;
      el.dataset.depthReady = "1";

      el.addEventListener("pointermove", (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
        el.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
        el.classList.add("is-depth-active");
      });

      el.addEventListener("pointerleave", () => {
        el.style.setProperty("--tilt-x", "0deg");
        el.style.setProperty("--tilt-y", "0deg");
        el.classList.remove("is-depth-active");
      });
    }

    function watchDepth(root: ParentNode) {
      if (prefersReducedMotion || !supportsFinePointer) return;
      if ((root as Element).matches?.(".depth-card")) addDepthCard(root as HTMLElement);
      root.querySelectorAll<HTMLElement>(".depth-card").forEach(addDepthCard);
    }

    function scan(root: ParentNode) {
      root.querySelectorAll(".reveal, .reveal-on-scroll").forEach(watchReveal);
      root.querySelectorAll<HTMLElement>("[data-count-to]").forEach(watchCount);
      watchDepth(root);
    }

    scan(document);

    const mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          const el = node as Element;
          if (el.matches?.(".reveal, .reveal-on-scroll")) watchReveal(el);
          if (el.matches?.("[data-count-to]")) watchCount(el as HTMLElement);
          if (el.matches?.(".depth-card")) addDepthCard(el as HTMLElement);
          scan(el);
        });
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      revealObserver?.disconnect();
      countObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return null;
}
