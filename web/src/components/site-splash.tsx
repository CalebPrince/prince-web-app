"use client";

import * as React from "react";

// Ported from home.html's #site-splash: a once-per-session intro curtain
// (focus-pull entrance, two-panel horizontal split exit) gated by
// sessionStorage so returning visitors within the same session skip it.
// Homepage-only — rendered by page.tsx, not the root layout.
//
// The bootstrap <script> below runs synchronously as the browser parses the
// initial HTML (same as the original's <head> script), adding
// "splash-pending" to <html> before first paint so globals.css's
// `html:not(.splash-pending) #site-splash { display: none }` doesn't cause
// a flash of the real page first. suppressHydrationWarning is already set
// on <html> in layout.tsx (next-themes relies on the same class-mutation
// pattern), so this class getting added/removed outside React's control
// doesn't trigger a hydration mismatch.
const BOOTSTRAP_SCRIPT = `(function(){try{if(!sessionStorage.getItem("prince_splash_played")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("splash-pending");}}catch(_){}})();`;

export function SiteSplash() {
  React.useEffect(() => {
    if (!document.documentElement.classList.contains("splash-pending")) return;

    let finished = false;
    function finishSplash() {
      if (finished) return;
      finished = true;
      try {
        sessionStorage.setItem("prince_splash_played", "1");
      } catch {
        // sessionStorage unavailable (private mode, etc.) — fine to no-op.
      }
      document.documentElement.classList.remove("splash-pending");
      document.getElementById("site-splash")?.remove();
    }

    // Any interaction skips straight past the intro — it's a first
    // impression, never a gate.
    const events: (keyof DocumentEventMap)[] = ["click", "keydown", "touchstart", "scroll"];
    events.forEach((evt) => window.addEventListener(evt, finishSplash, { passive: true }));

    document.getElementById("splash-word")?.classList.add("focus");
    const timers = [
      window.setTimeout(() => document.getElementById("splash-eyebrow")?.classList.add("in"), 700),
      window.setTimeout(() => document.getElementById("splash-ring")?.classList.add("ping"), 1300),
      window.setTimeout(() => document.getElementById("splash-center")?.classList.add("fade"), 1900),
      window.setTimeout(() => {
        document.getElementById("splash-panel-left")?.classList.add("split");
        document.getElementById("splash-panel-right")?.classList.add("split");
      }, 2100),
      window.setTimeout(finishSplash, 3100),
    ];

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, finishSplash));
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />
      <div id="site-splash" aria-hidden="true">
        <div className="splash-panel splash-panel-left" id="splash-panel-left" />
        <div className="splash-panel splash-panel-right" id="splash-panel-right" />
        <div className="splash-center" id="splash-center">
          <div className="splash-ring" id="splash-ring" />
          <div className="splash-word" id="splash-word">
            Prince Caleb<span className="dot">.</span>
          </div>
          <div className="splash-eyebrow" id="splash-eyebrow">
            AI voice agents · chatbots · automations
          </div>
        </div>
      </div>
    </>
  );
}
