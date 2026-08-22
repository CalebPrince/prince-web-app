"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** How far each word breaks right, as a multiple of --sw-shift. The first
 *  word holds the line so the heading keeps an anchor to read from; the
 *  second and third are the ones that visibly leave. Anything past them
 *  drifts on a repeating figure, so a long heading spreads rather than
 *  flying apart.
 *
 *  The offsets must never decrease from one word to the next. Only the words
 *  move - the whitespace between them is a text node that stays put - so a
 *  word offset further right than the one after it eats the space between
 *  them and the two render as one word. TAIL is therefore a set of
 *  increments added to the running offset, not a set of absolute offsets:
 *  as literals they dropped from the lead's 1.7 back to 0.5, which closed
 *  the gap by ~49px at half progress and read as "Callsinto". */
const LEAD = [0, 1, 1.7];
const TAIL = [0.18, 0.32, 0.1, 0.24];

/** Offsets for one heading's words, in order. Stateful across the heading
 *  rather than a pure function of the index, since each offset depends on the
 *  one before it. */
function makeWeights() {
  let prev = 0;
  return (index: number): number => {
    const next =
      index < LEAD.length
        ? Math.max(LEAD[index], prev)
        : prev + TAIL[(index - LEAD.length) % TAIL.length];
    prev = next;
    return next;
  };
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
  let lastWeight = 0;
  // The first word behaves as though it follows a space: nothing precedes it
  // for punctuation to attach to.
  let afterSpace = true;
  const weightFor = makeWeights();

  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    // A whitespace-only node is the space between two elements - the accent
    // span and the text after it, say. It is left exactly as it is, and only
    // noted, so the punctuation rule below can tell "word." from "word ."
    if (!text.trim()) {
      afterSpace = true;
      continue;
    }

    const fragment = document.createDocumentFragment();
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (!part.trim()) {
        fragment.appendChild(document.createTextNode(part));
        afterSpace = true;
        continue;
      }
      // Punctuation that follows a word with no space between them is part of
      // that word, however the markup happens to be divided up - the accent
      // full stop in "built to perform." is its own span, so the walker meets
      // it as a separate text node. Giving it its own offset floated it ~10px
      // clear of the word at full progress. It rides along instead.
      const glued = !afterSpace && !/[\p{L}\p{N}]/u.test(part);
      if (!glued) lastWeight = weightFor(index++);

      const word = document.createElement("span");
      word.className = "sw-word";
      word.style.setProperty("--w", String(lastWeight));
      word.textContent = part;
      fragment.appendChild(word);
      afterSpace = false;
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
