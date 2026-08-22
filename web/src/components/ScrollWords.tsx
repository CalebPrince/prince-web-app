"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How far each word breaks right, as a multiple of --sw-shift. The first
 *  word holds the line so the heading keeps an anchor to read from; the
 *  second and third are the ones that visibly leave. Anything past them
 *  takes a smaller offset on a repeating figure, so a long heading drifts
 *  rather than flying apart. */
const LEAD = [0, 1, 1.7];
const TAIL = [0.5, 0.9, 0.3, 0.7];

function weightFor(index: number): number {
  return index < LEAD.length ? LEAD[index] : TAIL[(index - LEAD.length) % TAIL.length];
}

/** Headings are authored as ordinary markup - some carry a <br>, most carry a
 *  span or two for the accent colour - so the words are found by walking the
 *  text nodes rather than by splitting a string. Whitespace between words is
 *  left as its own text node, which is what keeps the heading wrapping and
 *  breaking exactly as it did before. */
function wrapWords(heading: HTMLElement) {
  if (heading.dataset.swDone) return;

  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

  let index = 0;
  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    if (!text.trim()) continue;

    const fragment = document.createDocumentFragment();
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (!part.trim()) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }
      const word = document.createElement("span");
      word.className = "sw-word";
      word.style.setProperty("--w", String(weightFor(index++)));
      word.textContent = part;
      fragment.appendChild(word);
    }
    node.parentNode?.replaceChild(fragment, node);
  }

  heading.dataset.swDone = "1";
}

/**
 * Page headings come apart as they leave the screen: the words break right,
 * furthest for the second and third, and slide back into line as the heading
 * is scrolled back to. It is driven by where the heading actually is rather
 * than by a one-shot trigger, so it is the same movement in both directions
 * and lands exactly where it started.
 *
 * Mounted once for the whole marketing site (MarketingUIWrapper) rather than
 * wrapped around every h1 by hand: the headings are plain markup on twenty-odd
 * pages, and this way a new page gets the behaviour by having a heading.
 */
export function ScrollWords() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const headings = Array.from(
      document.querySelectorAll<HTMLElement>("h1, [data-scroll-words]"),
    );
    if (headings.length === 0) return;

    headings.forEach(wrapWords);

    /** Where each heading sits in the document, taken once. A hero sits half
     *  way down its screen and a page header sits just under the nav, so a
     *  single "starts at 40% of the viewport" rule would have the page header
     *  already half undone before the visitor had scrolled at all. Each
     *  heading rests wherever it actually is, and moves from there. */
    const restOf = new WeakMap<HTMLElement, number>();
    for (const heading of headings) {
      restOf.set(heading, heading.getBoundingClientRect().top + window.scrollY);
    }

    let frame = 0;
    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;

      for (const heading of headings) {
        const rect = heading.getBoundingClientRect();
        // Never later than 40% of the screen: a heading that begins life
        // below the fold should still be settled by the time it is read.
        const rest = Math.min(vh * 0.4, restOf.get(heading) ?? vh * 0.4);
        const travel = rest + rect.height;
        if (travel <= 0) continue;
        const progress = Math.min(1, Math.max(0, (rest - rect.top) / travel));
        heading.style.setProperty("--p", progress.toFixed(3));
      }
    };

    // Coalesced onto a frame: several scroll events can land between two
    // paints, and only the last of them describes where the page actually is.
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      for (const heading of headings) heading.style.removeProperty("--p");
    };
  }, [pathname]);

  return null;
}
