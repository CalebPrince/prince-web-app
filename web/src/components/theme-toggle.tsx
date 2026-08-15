"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check } from "lucide-react";

const THEMES = [
  { id: "light", label: "Light", swatch: "#fbfbfa" },
  { id: "dark", label: "Dark", swatch: "#0b0c0e" },
  { id: "midnight", label: "Midnight", swatch: "#060a14" },
  { id: "paper", label: "Paper", swatch: "#f5efe0" },
] as const;

// Hand-rolled to match public/css/app.css's .theme-toggle/.theme-menu exactly
// (bordered icon button + a small popover with swatches and a checkmark on
// the active theme) rather than shadcn's DropdownMenu, whose own visual and
// interaction model would need overriding piece by piece to look identical.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Choose theme appearance"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg border border-line bg-transparent p-[0.4rem_0.6rem] leading-none text-ink transition-colors hover:border-primary hover:text-primary"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          focusable="false"
          className="block size-[18px]"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-[2000] flex min-w-[180px] origin-top-right flex-col gap-[0.15rem] rounded-[14px] border border-line bg-card p-[0.4rem] shadow-lg [animation:theme-menu-in_0.18s_ease]"
        >
          {THEMES.map((t) => {
            const active = mounted && theme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-[0.6rem] rounded-lg border-0 bg-transparent p-[0.5rem_0.6rem] text-left text-[0.85rem] text-ink hover:bg-editorial-accent-soft"
              >
                <span
                  className="size-[18px] shrink-0 rounded-full border border-line"
                  style={{ background: t.swatch }}
                  aria-hidden="true"
                />
                <span className="flex-1">{t.label}</span>
                <Check
                  className="size-[15px] shrink-0 text-primary"
                  style={{ visibility: active ? "visible" : "hidden" }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
