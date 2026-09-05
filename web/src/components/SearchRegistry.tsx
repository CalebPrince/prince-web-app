"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, type SearchResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";

// The standalone /search page - a project-card grid of results, with ?q=
// synced into the URL so a search is shareable.
export function SearchRegistry() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";

  // Seeded from ?q= so a shared search URL renders its pending state on the
  // first paint, without the effect below having to set it synchronously.
  const [query, setQuery] = React.useState(initialQ);
  const [status, setStatus] = React.useState(initialQ ? "Searching…" : "");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [searched, setSearched] = React.useState(Boolean(initialQ));

  const fetchResults = React.useCallback(async (q: string) => {
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

  const runSearch = React.useCallback(
    (q: string) => {
      setResults([]);
      if (!q) {
        setStatus("");
        setSearched(false);
        return;
      }
      setSearched(true);
      setStatus("Searching…");
      void fetchResults(q);
    },
    [fetchResults],
  );

  React.useEffect(() => {
    if (!initialQ) return;
    // Resolves the ?q= that was present on mount.
    api
      .search(initialQ)
      .then((data) => data.results ?? [])
      .catch(() => [] as SearchResult[])
      .then((found) => {
        setStatus(
          found.length ? `${found.length} result${found.length === 1 ? "" : "s"} for "${initialQ}"` : "",
        );
        setResults(found);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {/* ── HERO + SEARCH ───────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-hairline">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-20 md:px-10 md:pt-36 md:pb-24">
          <Reveal>
            <SectionLabel>Search</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 text-[clamp(2.4rem,6.5vw,5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Find a project or article.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <form
              className="mt-10 flex max-w-[560px] flex-col gap-3 sm:flex-row"
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
                aria-label="Search projects and articles"
                className="h-13 min-w-0 flex-1 rounded-full border border-hairline-strong bg-bg/60 px-5 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
              />
              <Button type="submit" size="lg">
                Search
              </Button>
            </form>
          </Reveal>
        </div>
      </section>

      {/* ── RESULTS ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-28">
        <div className="mb-6 min-h-6 label text-muted">{status}</div>

        {results.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((r) => (
              <Link
                key={r.url}
                href={r.url}
                className="group flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2/40 transition-colors hover:border-accent/40 glass"
              >
                <div className="aspect-[4/3] w-full overflow-hidden bg-bg-2">
                  {r.image && (
                    <img
                      src={r.image}
                      alt={r.title}
                      className="h-full w-full object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    />
                  )}
                </div>
                <div className="flex grow flex-col p-6">
                  <span className="label w-fit rounded-full border border-hairline px-3 py-1.5 text-muted">
                    {r.type === "project" ? "Project" : "Blog Post"}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold leading-tight tracking-tight text-text transition-colors group-hover:text-accent">
                    {r.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-2">{r.snippet}</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {searched && !results.length && !status && (
          <div className="py-20 text-center text-text-2">
            No matches yet, try a different word, or{" "}
            <Link href="/contact" className="text-accent underline underline-offset-4 hover:text-accent-strong">
              get in touch
            </Link>{" "}
            and ask directly.
          </div>
        )}
      </section>
    </>
  );
}
