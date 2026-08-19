"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Sun, Moon, Search, Lock, CircleUserRound } from "lucide-react";
import { cn } from "@/lib/utils";

// Small utility cluster glued next to the logo - ported from the PHP
// pages' .utility-dock (public/js/utility-dock.js + theme.js): a trigger
// that reveals appearance / search / admin / client-portal shortcuts.
// The appearance toggle here is a straight light/dark switch (the legacy
// picker's extra Midnight/Paper states aren't part of this app's design
// system), reusing the same `theme` localStorage key so a choice made on
// either half of the site carries over to the other.
export function HeaderUtilityDock() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", next);
    setTheme(next);
  }

  return (
    // Pinned to the very top of the viewport: the header is fixed at top 0 and
    // 5rem tall, and the 2rem trigger is centred inside it, so lifting it by
    // half the leftover space ((5rem - 2rem) / 2 = 1.5rem) sits it flush
    // against the top edge while it stays in the flex row beside the logo.
    <div ref={rootRef} className="relative -mt-6 self-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Quick actions"
        aria-haspopup="true"
        aria-expanded={open}
        // Sits flush against the top of the viewport, so it drops its top
        // border and the corners that would curve away from it.
        className="grid size-8 place-items-center rounded-b-lg border border-t-0 border-hairline text-text-2 transition-colors hover:border-accent/40 hover:text-text"
      >
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>

      <div
        role="menu"
        className={cn(
          "absolute left-0 top-full z-10 flex items-center gap-1 rounded-xl border border-hairline bg-bg/95 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.25)] backdrop-blur-xl transition-all duration-200",
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="grid size-8 place-items-center rounded-full text-text-2 transition-colors hover:bg-bg hover:text-accent"
        >
          {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
        <Link
          href="/search"
          onClick={() => setOpen(false)}
          aria-label="Search"
          title="Search"
          className="grid size-8 place-items-center rounded-full text-text-2 transition-colors hover:bg-bg hover:text-accent"
        >
          <Search className="size-4" />
        </Link>
        <a
          href="/admin"
          aria-label="Admin login"
          title="Admin login"
          className="grid size-8 place-items-center rounded-full text-text-2 transition-colors hover:bg-bg hover:text-accent"
        >
          <Lock className="size-4" />
        </a>
        <a
          href="/client/login"
          aria-label="Client portal"
          title="Client portal"
          className="grid size-8 place-items-center rounded-full text-text-2 transition-colors hover:bg-bg hover:text-accent"
        >
          <CircleUserRound className="size-4" />
        </a>
      </div>
    </div>
  );
}
