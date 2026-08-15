"use client";

import * as React from "react";
import Image from "next/image";
import { api, type SearchResult } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Ported from public/js/utility-dock.js's search popup + public/css/app.css's
// .site-search-* rules — a live-search modal, not a navigation to /search.
export function SearchPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searched, setSearched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function runSearch(q: string) {
    setSearched(true);
    setResults([]);
    if (!q) {
      setStatus("");
      setSearched(false);
      return;
    }
    setStatus("Searching...");
    try {
      const data = await api.search(q);
      const found = data.results ?? [];
      if (!found.length) {
        setStatus("");
      } else {
        setStatus(`${found.length} result${found.length === 1 ? "" : "s"} for "${q}"`);
      }
      setResults(found);
    } catch {
      setStatus("Search is unavailable right now. Please try again in a moment.");
    }
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[2500] grid justify-items-center px-4 pb-8 transition-opacity duration-[280ms]",
        open ? "visible pointer-events-auto opacity-100" : "invisible pointer-events-none opacity-0",
      )}
      style={{ paddingTop: "clamp(5rem, 12vh, 8rem)", alignItems: "start" }}
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(10,11,13,0.42)] backdrop-blur-[8px]"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="site-search-title"
        className={cn(
          "relative w-[min(680px,100%)] overflow-auto rounded-[18px] border border-line bg-card p-5 shadow-[0_28px_80px_rgba(0,0,0,0.26)] sm:p-8",
          open && "[animation:search-panel-pop_0.42s_var(--ease-out)_forwards]",
        )}
        style={{ maxHeight: "min(720px, calc(100vh - 7rem))" }}
      >
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="absolute right-[0.85rem] top-[0.85rem] inline-flex size-[2.35rem] items-center justify-center rounded-full border border-line bg-transparent text-xl leading-none text-ink transition-transform duration-300 hover:rotate-90 hover:border-line-strong"
        >
          &times;
        </button>
        <p className="mb-2 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-muted">// Search</p>
        <h2 id="site-search-title" className="mb-3 text-xl font-bold">
          Find a project or article.
        </h2>
        <form
          className="grid grid-cols-[1fr_auto] gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            runSearch(query.trim());
          }}
        >
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. booking app, SEO, WordPress..."
            autoComplete="off"
            className="min-w-0 rounded-lg border border-line bg-bg px-4 py-3 text-base text-ink outline-none focus:border-editorial-accent"
          />
          <Button type="submit" variant="brand" size="pill-sm" className="hover:translate-y-0">
            Search
          </Button>
        </form>
        <div className="mt-4 min-h-6 text-sm">{status}</div>
        {results.length > 0 && (
          <div className="mt-2 grid gap-3">
            {results.map((r, i) => (
              <a
                key={r.url}
                href={r.url}
                className="grid grid-cols-[76px_1fr] items-center gap-[0.9rem] rounded-xl border border-line bg-bg p-3 text-ink-soft opacity-0 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-line-strong"
                style={{ animation: `search-result-in 0.34s var(--ease-out) forwards`, animationDelay: `${i * 0.04}s` }}
              >
                {r.image ? (
                  <Image src={r.image} alt={r.title} width={76} height={58} className="h-[58px] w-[76px] rounded-lg bg-bg-soft object-cover" unoptimized />
                ) : (
                  <div className="h-[58px] w-[76px] rounded-lg bg-bg-soft" />
                )}
                <span>
                  <small className="block text-[0.72rem] uppercase tracking-[0.08em] text-editorial-muted">
                    {r.type === "project" ? "Project" : "Blog Post"}
                  </small>
                  <strong className="mt-[0.1rem] block text-heading">{r.title}</strong>
                  <em className="mt-[0.18rem] line-clamp-2 text-[0.86rem] not-italic text-editorial-muted">{r.snippet}</em>
                </span>
              </a>
            ))}
          </div>
        )}
        {searched && !results.length && !status && (
          <div className="mt-3 rounded-xl border border-dashed border-line-strong p-4 text-center text-editorial-muted">
            No matches yet. Try a different word, or{" "}
            <a href="/contact" className="text-editorial-accent">
              ask directly
            </a>
            .
          </div>
        )}
      </section>
    </div>
  );
}
