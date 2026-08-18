"use client";

import * as React from "react";
import Link from "next/link";
import { api, type BlogPost } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Ported from public/archive.html's renderGrid()/renderPagination() (the
// live functions — renderLegacyGrid exists in the original but is dead
// code, never called by init()). Same 10-per-page pagination, same
// category-derived filter pills, same metricFor() heuristic and excerpt
// suffix text.
const PAGE_SIZE = 10;

function publishedDate(p: BlogPost) {
  const raw = String(p.published_at || p.created_at || "").replace(" ", "T");
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function metricFor(p: BlogPost, i: number) {
  const category = String(p.category || "System Architecture").toLowerCase();
  if (category.includes("ai")) return "1.5s AI routing";
  if (category.includes("dashboard")) return "40% faster reporting";
  if (category.includes("automation")) return "60% manual work removed";
  return ["99.9% uptime", "40% bandwidth reduction", "Sub-2s page loads"][i % 3];
}

export function ArchiveRegistry() {
  const [allPosts, setAllPosts] = React.useState<BlogPost[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [activeCategory, setActiveCategory] = React.useState("");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    api.blog().then(setAllPosts).catch(() => setFailed(true));
  }, []);

  const categories = React.useMemo(
    () => [...new Set((allPosts ?? []).map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [allPosts],
  );

  const filtered = React.useMemo(() => {
    if (!allPosts) return null;
    return activeCategory ? allPosts.filter((p) => p.category === activeCategory) : allPosts;
  }, [allPosts, activeCategory]);

  const totalPages = filtered ? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)) : 1;
  const pageItems = filtered ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : null;

  function goToPage(p: number) {
    setPage(p);
    document.getElementById("blog-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main>
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="hero-animate hero-animate-1 mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Technical Archive</p>
          <h1 className="hero-animate hero-animate-2 mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            Case <span className="text-editorial-accent-strong">studies</span> for engineered systems.
          </h1>
          <p className="hero-animate hero-animate-3 mb-4 max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Practical guides on custom software, automation, and web/mobile development, filter by topic, or browse
            everything.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveCategory("");
                setPage(1);
              }}
              className={cn(
                "rounded-full border px-[1.05rem] py-[0.48rem] text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-px",
                activeCategory === "" ? "border-heading bg-heading text-bg" : "border-line text-ink-soft hover:border-line-strong hover:text-heading",
              )}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setActiveCategory(c);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-[1.05rem] py-[0.48rem] text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-px",
                  activeCategory === c ? "border-heading bg-heading text-bg" : "border-line text-ink-soft hover:border-line-strong hover:text-heading",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="py-20">
        <div id="blog-grid" className="mx-auto max-w-6xl px-4 sm:px-6">
          {pageItems === null && !failed && (
            <div className="grid gap-3">
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
            </div>
          )}

          {(failed || pageItems?.length === 0) && (
            <p className="py-20 text-center text-ink-soft">
              {failed ? "Could not load articles right now." : "No articles match this filter yet."}
            </p>
          )}

          {pageItems && pageItems.length > 0 && (
            <>
              <div className="border-t border-line">
                {pageItems.map((p, i) => (
                  <article
                    key={p.slug}
                    className={cn("reveal reveal-on-scroll group grid items-start gap-6 border-b border-line py-8 max-md:grid-cols-1", `reveal-delay-${(i % 4) + 1}`)}
                    style={{ gridTemplateColumns: "minmax(160px, 0.32fr) minmax(0, 1fr) minmax(130px, 0.22fr)" }}
                  >
                    <div>
                      <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">[{p.category || "System Architecture"}]</span>
                      {publishedDate(p) && <div className="mt-2 text-sm text-editorial-muted">{publishedDate(p)}</div>}
                      <div className="mt-1 text-sm text-editorial-muted">{p.reading_time} min technical read</div>
                    </div>
                    <div>
                      <h2 className="mb-[0.65rem] text-lg font-bold text-heading">
                        <Link href={`/archive/${p.slug}`}>{p.title}</Link>
                      </h2>
                      <p className="max-w-[68ch] text-ink-soft">
                        {p.excerpt} Built with lean HTML, CSS variables, Bootstrap utilities, and vanilla JavaScript patterns.
                      </p>
                      <Link href={`/archive/${p.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-heading">
                        Open technical breakdown
                        <span className="font-mono transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                          -&gt;
                        </span>
                      </Link>
                    </div>
                    <div className="justify-self-end border-l border-line pl-4 text-right max-md:justify-self-start max-md:border-l-0 max-md:pl-0">
                      <strong className="block text-[clamp(1.35rem,3vw,2.1rem)] leading-none text-heading">{metricFor(p, i)}</strong>
                      <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">Key validation metric</span>
                    </div>
                  </article>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-10 flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => goToPage(page - 1)}
                    className="group rounded-full border border-line px-[0.85rem] py-[0.4rem] text-sm font-medium text-ink-soft transition-all duration-150 enabled:hover:border-editorial-accent enabled:hover:text-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="inline-block transition-transform duration-150 ease-out group-hover:-translate-x-1" aria-hidden="true">
                      ←
                    </span>{" "}
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      className={cn(
                        "rounded-full border px-[0.85rem] py-[0.4rem] text-sm font-medium transition-all duration-150",
                        p === page ? "border-heading bg-heading text-bg" : "border-line text-ink-soft hover:border-editorial-accent hover:text-editorial-accent",
                      )}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => goToPage(page + 1)}
                    className="group rounded-full border border-line px-[0.85rem] py-[0.4rem] text-sm font-medium text-ink-soft transition-all duration-150 enabled:hover:border-editorial-accent enabled:hover:text-editorial-accent disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next{" "}
                    <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                      →
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <NewsletterSection />
    </main>
  );
}

function NewsletterSection() {
  const [email, setEmail] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [msg, setMsg] = React.useState<{ type: "success" | "danger"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSubmitting(true);
    try {
      await api.subscribeNewsletter({ email, website, attribution: {} });
      setEmail("");
      setMsg({ type: "success", text: "Subscribed, you'll get the next post by email." });
    } catch (err) {
      setMsg({ type: "danger", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="border-t border-line bg-bg-soft py-20 text-center">
      <div className="mx-auto max-w-[560px] px-4 sm:px-6">
        <h3 className="mb-2 text-2xl font-bold text-heading">Get new posts by email</h3>
        <p className="mb-4 text-ink-soft">One email whenever there&apos;s a new practical guide, no spam, unsubscribe any time.</p>
        <form onSubmit={handleSubmit} className="flex flex-col justify-center gap-2 sm:flex-row">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="max-w-[320px] rounded-lg border border-line bg-bg px-4 py-3 text-ink outline-none focus:border-editorial-accent"
          />
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor="newsletter-website">Website</label>
            <input type="text" id="newsletter-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>
          <Button type="submit" variant="brand" size="pill" disabled={submitting}>
            {submitting ? "Subscribing…" : "Subscribe"}
          </Button>
        </form>
        {msg && (
          <p
            className={cn(
              "mx-auto mt-3 max-w-[400px] rounded-lg px-3 py-2 text-sm",
              msg.type === "success" ? "bg-status-ok-bg text-status-ok-text" : "bg-status-danger-bg text-status-danger-text",
            )}
          >
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
