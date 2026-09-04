"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeaderUtilityDock } from "@/components/HeaderUtilityDock";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { label: string; to: string; note: string }[] = [
  { label: "Services", to: "/services", note: "Agents, automations, builds" },
  { label: "Builder OS", to: "/builder-os", note: "How the work runs" },
  { label: "Systems", to: "/systems", note: "What has shipped" },
  { label: "Pricing", to: "/pricing", note: "What it costs" },
  { label: "About", to: "/about", note: "Who you are hiring" },
  { label: "Lab", to: "/lab", note: "Experiments in the open" },
  { label: "Contact", to: "/contact", note: "Start something" },
];

/** The short links under the list — the pages that matter but do not deserve
 *  a line of 5rem type. */
const SECONDARY: { label: string; to: string }[] = [
  { label: "Lisa, the AI assistant", to: "/lisa-ai-assistant" },
  { label: "AI adoption ladder", to: "/ai-adoption-ladder" },
  { label: "Testimonials", to: "/testimonials" },
  { label: "Search", to: "/search" },
];

const CONTACT = "/contact";

/** Columns in the menu's curtain, and the beat between each one starting.
 *  Kept in step with the route curtain (PageTransition) so the site has one
 *  way of covering itself, not two. */
const COLUMNS = 8;

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** The page behind must not scroll under the menu, and Escape must close it
   *  — a cover with no keyboard way out is a trap. */
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    if (!menuOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    closeButton.current?.focus();

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /** A route landing closes the menu — including a back/forward the visitor
   *  made while it was open, which no click handler would ever see. Adjusted
   *  during render rather than in an effect: an effect would paint one frame
   *  of the new page with the old menu still over it. */
  const [routeAtOpen, setRouteAtOpen] = useState(pathname);
  if (pathname !== routeAtOpen) {
    setRouteAtOpen(pathname);
    setMenuOpen(false);
  }

  /** Focus goes back to the button that opened it, not to the top of the
   *  document. */
  const close = () => {
    setMenuOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500",
          scrolled
            ? "border-b border-hairline bg-bg"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-6 md:px-10">
          <div className="flex items-center gap-3">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <Logo animate />
            </Link>
            <HeaderUtilityDock />
          </div>

          {/* The whole navigation, at every width, is this one button. The
              header carries the mark and the way in; everything else lives
              behind the cover. */}
          <button
            ref={trigger}
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => (menuOpen ? close() : setMenuOpen(true))}
            className="menu-trigger group"
          >
            <span className="label hidden text-text-2 transition-colors group-hover:text-text sm:inline">
              {menuOpen ? "Close" : "Menu"}
            </span>
            <span className="menu-bars" data-open={menuOpen ? "" : undefined} aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </header>

      {/* ── The menu ─────────────────────────────────────────
          Covered by a curtain of columns on the route transition's own
          easing, with the pixel dither running ahead of each one, then the
          list rises into the middle of the screen. */}
      <div
        id="site-menu"
        className="site-menu"
        data-open={menuOpen ? "" : undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        inert={!menuOpen}
        // The column count is on the cover as well as on the curtain: the
        // cover has to stay visible for exactly as long as the last column
        // takes to leave, and that is a function of how many there are.
        style={{ "--n": COLUMNS } as React.CSSProperties}
      >
        <div className="site-menu-curtain">
          {Array.from({ length: COLUMNS }, (_, i) => (
            <span key={i} className="site-menu-col" style={{ "--i": i } as React.CSSProperties}>
              {[75, 50, 25].map((d, k) => (
                <span
                  key={d}
                  className="pt-dither"
                  data-d={d}
                  style={{ "--k": k } as React.CSSProperties}
                />
              ))}
            </span>
          ))}
        </div>

        <div className="site-menu-body">
          {/* The header is under the cover now, so the mark comes with it. */}
          <Link href="/" onClick={() => setMenuOpen(false)} className="site-menu-mark">
            <Logo />
          </Link>

          <button
            ref={closeButton}
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="site-menu-close label"
          >
            Close
            <span className="menu-bars" data-open="" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>

          <nav className="site-menu-list" aria-label="Primary">
            {NAV.map((item, i) => (
              <Link
                key={item.label}
                href={item.to}
                onClick={() => setMenuOpen(false)}
                className={cn("site-menu-link group", pathname === item.to && "is-current")}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="site-menu-no label">{String(i + 1).padStart(2, "0")}</span>
                <span className="site-menu-label">{item.label}</span>
                <span className="site-menu-note label">{item.note}</span>
              </Link>
            ))}
          </nav>

          <div className="site-menu-foot">
            <div className="site-menu-secondary">
              {SECONDARY.map((item) => (
                <Link
                  key={item.label}
                  href={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="label group inline-flex items-center gap-1.5 text-text-3 transition-colors hover:text-text"
                >
                  {item.label}
                  <ArrowUpRight className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>

            <Link
              href={CONTACT}
              onClick={() => setMenuOpen(false)}
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
            >
              Let&rsquo;s Build <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
