"use client";

import * as React from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { api, type SearchResult } from "@/lib/api";
import { Button } from "@/components/ui/button";

// Ported from public/search.html + public/js/search.js. Distinct from
// SearchPopup (the nav's modal): this is the standalone /search page, which
// keeps the original's project-card grid results rather than the popup's
// compact list, and syncs ?q= into the URL like the original did.
export function SearchRegistry() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  const [query, setQuery] = React.useState(initialQ);
  const [status, setStatus] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searched, setSearched] = React.useState(false);

  const runSearch = React.useCallback(async (q: string) => {
    setResults([]);
    setSearched(true);
    if (!q) {
      setStatus("");
      setSearched(false);
      return;
    }
    setStatus("Searching…");
    let found: SearchResult[] = [];
    try {
      const data = await api.search(q);
      found = data.results ?? [];
    } catch {
      found = [];
    }
    setStatus(found.length ? `${found.length} result${found.length === 1 ? "" : "s"} for "${q}"` : "");
    setResults(found);
  }, []);

  React.useEffect(() => {
    if (initialQ) runSearch(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Search</p>
          <h1 className="mb-4 text-5xl font-bold leading-[1.1] md:text-6xl">Find a project or article.</h1>
          <form
            className="flex max-w-[560px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = query.trim();
              const url = new URL(window.location.href);
              if (q) url.searchParams.set("q", q);
              else url.searchParams.delete("q");
              window.history.replaceState({}, "", url);
              runSearch(q);
            }}
          >
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. booking app, SEO, WordPress…"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-line bg-card px-4 py-3 text-base text-ink outline-none focus:border-editorial-accent"
            />
            <Button type="submit" variant="brand" size="pill">
              Search
            </Button>
          </form>
        </div>
      </header>

      <section className="py-[5.5rem]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-3 min-h-6 text-ink-soft">{status}</div>

          {results.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((r) => (
                <a key={r.url} href={r.url} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line transition-[transform,border-color,background-color] duration-[400ms] ease-out hover:-translate-y-1.5 hover:border-line-strong hover:bg-card">
                  {r.image ? (
                    <Image
                      src={r.image}
                      alt={r.title}
                      width={400}
                      height={300}
                      unoptimized
                      className="aspect-[4/3] w-full bg-bg-soft object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
                    />
                  ) : (
                    <div className="aspect-[4/3] w-full bg-bg-soft" />
                  )}
                  <div className="flex grow flex-col p-6">
                    <span className="mb-2 inline-flex w-fit items-center rounded-full border border-line px-[0.62rem] py-[0.28rem] text-[0.72rem] font-semibold text-ink">
                      {r.type === "project" ? "Project" : "Blog Post"}
                    </span>
                    <h5 className="mb-2 leading-[1.2] font-bold text-heading">{r.title}</h5>
                    <p className="mb-0 text-sm text-ink-soft">{r.snippet}</p>
                  </div>
                </a>
              ))}
            </div>
          )}

          {searched && !results.length && !status && (
            <div className="py-20 text-center text-ink-soft">
              No matches yet, try a different word, or{" "}
              <a href="/contact" className="text-editorial-accent hover:text-editorial-accent-strong">
                get in touch
              </a>{" "}
              and ask directly.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
