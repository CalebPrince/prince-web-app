"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/** The curtain is a row of columns that drop from the top to cover the page,
 *  hold while the next route swaps in behind them, then lift again. Eight is
 *  enough for the stagger to read as a sweep rather than as one slab, without
 *  the sweep taking so long that navigation feels held up. */
const COLUMNS = 8;
const STAGGER_MS = 32;
const COVER_MS = 400;
const REVEAL_MS = 460;
/** Coverage of each dither band, densest first — the band nearest the solid
 *  edge is the one that has almost filled in. */
const DITHER_STEPS = [75, 50, 25] as const;
/** A column's own travel plus the wait for the last one to start. */
const SWEEP_MS = COVER_MS + (COLUMNS - 1) * STAGGER_MS;
/** Beat of stillness once covered, so the swap does not read as a stutter. */
const HOLD_MS = 160;
/** If a route never commits — a slow server, a thrown error — the curtain
 *  lifts anyway rather than leaving the site behind a locked shutter. */
const STUCK_MS = 3500;

/** The splash runs once a session and is timed against the CSS in globals.css
 *  (.splash-*). Kept just long enough to read the wordmark and watch the
 *  count finish; every ms past that is a ms the visitor waits on their first
 *  impression, which is the one that can least afford to be slow. */
const SPLASH_COUNT_MS = 1400;
const SPLASH_OUT_MS = 1780;
/** How long the splash's contents take to leave before the curtain has it. */
const SPLASH_CONTENT_OUT_MS = 300;

type Phase = "idle" | "cover" | "covered" | "reveal";

/** Nav labels, so the curtain can name where it is going. Anything not listed
 *  gets its slug tidied up, which covers the long tail (blog posts, legal
 *  pages) without keeping a second copy of the sitemap in sync. */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Home",
  "/services": "Services",
  "/website-design": "Website design",
  "/working-together": "Working together",
  "/builder-os": "Builder OS",
  "/work": "Selected work",
  "/pricing": "Pricing",
  "/lisa-ai-assistant": "Lisa",
  "/about": "About",
  "/lab": "Lab",
  "/archive": "Archive",
  "/testimonials": "Testimonials",
  "/contact": "Contact",
  "/ai-adoption-ladder": "AI adoption ladder",
  "/ai-safety": "AI trust & safety",
  "/search": "Search",
};

function labelFor(pathname: string): string {
  const known = ROUTE_LABELS[pathname];
  if (known) return known;
  const slug = pathname.split("/").filter(Boolean).pop() ?? "";
  if (!slug) return "Home";
  return slug.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** Whether this navigation is ours to animate. Everything that is not a plain
 *  left-click onto another page of this site is left alone: the browser's own
 *  behaviours (new tab, download, external host) must survive untouched, and
 *  covering the screen for an in-page hash jump would be a lie. */
function isInternalNavigation(event: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;

  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname) return false;
  // The admin and client apps do not mount this component, so a curtain drawn
  // on the way in would never be lifted on the other side.
  if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/client")) return false;

  return true;
}

export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();

  const [phase, setPhase] = useState<Phase>("idle");
  const [label, setLabel] = useState("");

  /** The route we are covering the screen for, held so the pathname effect
   *  below can tell our own navigation from a back/forward the visitor made,
   *  which arrives with no curtain to lift. */
  const pending = useRef<string | null>(null);
  const timers = useRef<number[]>([]);

  const after = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);

  const clearTimers = useCallback(() => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** The splash decision is made pre-paint by the inline script in layout.tsx,
   *  which stamps data-splash on <html> — the markup has to be covering in the
   *  very first frame, or the visitor sees the page before the thing that is
   *  supposed to introduce it. All this does is read the verdict and run the
   *  clock, then hand over to the curtain's own exit. */
  useEffect(() => {
    if (document.documentElement.dataset.splash !== "on") return;

    const counter = document.getElementById("splash-count");
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / SPLASH_COUNT_MS);
      // Eased so the count slows into 100 instead of stopping dead.
      const eased = 1 - Math.pow(1 - t, 3);
      if (counter) counter.textContent = String(Math.round(eased * 100)).padStart(3, "0");
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    after(SPLASH_OUT_MS, () => document.documentElement.setAttribute("data-splash", "out"));

    // Hand the reveal to the curtain rather than lifting the splash itself.
    // "covered" has no transition, so the columns snap shut underneath while
    // the splash is still opaque over them — same background, nothing to see
    // — and the site ends up with one way of uncovering itself.
    after(SPLASH_OUT_MS + SPLASH_CONTENT_OUT_MS, () => {
      setPhase("covered");
      document.documentElement.removeAttribute("data-splash");
      // A frame between the two states, or the browser coalesces them and
      // there is no start position for the lift to animate from.
      after(40, () => {
        setPhase("reveal");
        after(REVEAL_MS + (COLUMNS - 1) * STAGGER_MS, () => setPhase("idle"));
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [after]);

  /** Warm the destination before the click. The curtain hides the route swap,
   *  but it cannot hide a route that is still being fetched when the columns
   *  have finished lifting — so the moment a link is pointed at or focused,
   *  its payload is already on its way. Delegated, and once per path per
   *  session: prefetch is a no-op after the router has the route cached, but
   *  the bookkeeping here keeps us from asking on every mouse move. */
  useEffect(() => {
    const asked = new Set<string>();

    const warm = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname.startsWith("/admin") || url.pathname.startsWith("/client")) return;
      if (url.pathname === window.location.pathname) return;
      if (asked.has(url.pathname)) return;

      asked.add(url.pathname);
      router.prefetch(url.pathname);
    };

    document.addEventListener("pointerenter", warm, true);
    document.addEventListener("focusin", warm, true);
    return () => {
      document.removeEventListener("pointerenter", warm, true);
      document.removeEventListener("focusin", warm, true);
    };
  }, [router]);

  /** Intercept in the capture phase, before Link's own handler, so the cover
   *  plays first and the route is pushed into a screen the visitor cannot see
   *  changing. Document-level rather than a prop on every Link: this then also
   *  covers plain anchors and anything rendered by components that know
   *  nothing about the transition. */
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !isInternalNavigation(event, anchor as HTMLAnchorElement)) return;

      event.preventDefault();
      const url = new URL((anchor as HTMLAnchorElement).href, window.location.href);
      const target = url.pathname + url.search + url.hash;

      clearTimers();
      // Asked for again here in case the visitor arrived by keyboard or touch
      // without ever hovering: it costs nothing once the route is cached.
      router.prefetch(url.pathname);
      pending.current = url.pathname;
      setLabel(labelFor(url.pathname));
      setPhase("cover");

      // Pushed at the end of the sweep, not the start: navigation re-renders
      // the tree, and a heavy route doing that mid-sweep drops frames from the
      // one animation the visitor is actually looking at.
      after(SWEEP_MS, () => {
        setPhase("covered");
        router.push(target);
      });
      after(SWEEP_MS + STUCK_MS, () => {
        pending.current = null;
        setPhase("reveal");
        after(REVEAL_MS + (COLUMNS - 1) * STAGGER_MS, () => setPhase("idle"));
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [after, clearTimers, router]);

  /** The route has landed: hold a beat, then lift. */
  useEffect(() => {
    if (!pending.current || pending.current !== pathname) return;
    pending.current = null;
    clearTimers();

    after(HOLD_MS, () => {
      setPhase("reveal");
      after(REVEAL_MS + (COLUMNS - 1) * STAGGER_MS, () => setPhase("idle"));
    });
  }, [pathname, after, clearTimers]);

  /** Each column carries a three-step ordered-dither band past its leading
   *  edge: 75%, 50% then 25% coverage, in fixed-pixel checks. The panel is
   *  solid, so the band is what does the covering as far as the eye is
   *  concerned — the screen fills in as pixels rather than as a hard line. */
  const columns = Array.from({ length: COLUMNS }, (_, i) => (
    <span key={i} className="pt-col" style={{ "--i": i } as React.CSSProperties}>
      {DITHER_STEPS.map((d, k) => (
        <span
          key={k}
          className="pt-dither"
          data-d={d}
          style={{ "--k": k } as React.CSSProperties}
        />
      ))}
    </span>
  ));

  return (
    <>
      {/* Route curtain. aria-hidden and inert to pointers: it is scenery, and
          the page behind it stays the thing being read by assistive tech. */}
      <div
        className="pt-curtain"
        data-phase={phase}
        style={{ "--n": COLUMNS } as React.CSSProperties}
        aria-hidden="true"
      >
        {columns}
        <div className="pt-label">
          <span className="label pt-label-text">{label}</span>
        </div>
      </div>

      {/* Splash. Server-rendered so it is already covering in the first frame;
          the inline script in layout.tsx decides whether it is ever shown. */}
      <div className="splash" aria-hidden="true">
        <div className="splash-grid" />
        <div className="splash-mark">
          <span className="splash-word" style={{ "--w": 0 } as React.CSSProperties}>
            Prince
          </span>{" "}
          <span className="splash-word" style={{ "--w": 1 } as React.CSSProperties}>
            Caleb<span className="splash-dot">.</span>
          </span>
        </div>
        <div className="splash-foot">
          <span className="label splash-meta">Digital design, development &amp; AI</span>
          <span className="splash-rule" />
          <span className="label splash-count" id="splash-count">
            000
          </span>
        </div>
      </div>
    </>
  );
}
