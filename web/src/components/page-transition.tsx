"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

// Ported from public/js/cinematic-nav.js — a full-screen "loading system"
// overlay shown briefly on internal navigation, matching the PHP site's
// feel of moving between pages. Same 430ms hold before the destination
// actually loads, same per-route label lookup, same skip rules (modified
// clicks, new tab, download, external origin, in-page anchors, home as the
// destination). Mounted once in the root layout, so it needs no per-page
// wiring — any <a>/<Link> click anywhere is intercepted.
//
// .html hrefs (not-yet-migrated PHP pages, see site-nav.tsx's MegaLink
// comment) get a real navigation; everything else uses the Next.js router
// for a soft transition.
const LABELS: Record<string, string> = {
  "/builder-os": "Loading Builder OS topology…",
  "/projects": "Opening system registry…",
  "/project.html": "Inspecting deployed system…",
  "/agent.html": "Opening agent dossier…",
  "/services": "Loading capabilities…",
  "/contact": "Opening workflow request…",
};

export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = React.useState(false);
  const [label, setLabel] = React.useState("Loading next system…");
  const pendingHref = React.useRef<string | null>(null);

  React.useEffect(() => {
    // Destination has rendered — drop the overlay (equivalent of the
    // original's `pageshow` handler for soft navigations).
    if (pendingHref.current) {
      setVisible(false);
      pendingHref.current = null;
    }
  }, [pathname]);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target || link.hasAttribute("download")) return;

      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.href === location.href) return;
      if (url.hash && url.pathname === location.pathname) return;
      if (url.pathname === "/") return;

      event.preventDefault();
      setLabel(LABELS[url.pathname] || "Loading next system…");
      setVisible(true);
      pendingHref.current = url.href;

      window.setTimeout(() => {
        if (url.pathname.endsWith(".html")) {
          location.href = url.href;
        } else {
          router.push(url.pathname + url.search + url.hash);
        }
      }, 430);
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  return (
    <div className={`system-page-transition${visible ? " show" : ""}`} aria-hidden="true">
      <span>BUILDER OS</span>
      <strong>{label}</strong>
      <i />
    </div>
  );
}
