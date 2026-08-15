"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { api, platformOf, type Project, type Tag } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Ported from public/js's renderGrid() in projects.html (the live function —
// renderLegacyGrid exists in the original file but is dead code, never
// called by init()). Metric/tech fallbacks and the SYS-registry framing
// match verbatim; tag filtering and the ?platform= deep link from the nav's
// Projects mega-menu both reproduce the original client-side logic.
const METRIC_FALLBACKS = ["99.9% uptime", "40% bandwidth reduction", "Sub-2s load target", "48h response loop"];
const TECH_FALLBACKS = ["Vanilla PHP", "FastAPI", "SQLite", "Cloudflare Workers"];

function metricFor(p: Project, i: number) {
  const raw = String(p.outcome_metrics ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  return raw || METRIC_FALLBACKS[i % 4];
}

function techFor(p: Project) {
  const tags = (p.tags ?? []).map((t) => t.name).filter(Boolean);
  return [...new Set([...tags, ...TECH_FALLBACKS])].slice(0, 4);
}

export function ProjectsRegistry() {
  const searchParams = useSearchParams();
  const [allProjects, setAllProjects] = React.useState<Project[] | null>(null);
  const [tags, setTags] = React.useState<Tag[]>([]);
  const [activeTag, setActiveTag] = React.useState("");
  const [liveDemo, setLiveDemo] = React.useState<{ title: string; url: string } | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    Promise.all([api.projects(), api.tags()])
      .then(([projects, fetchedTags]) => {
        setAllProjects(projects);
        setTags(fetchedTags);
      })
      .catch(() => setFailed(true));
  }, []);

  const platform = searchParams.get("platform");

  const visible = React.useMemo(() => {
    if (!allProjects) return null;
    if (activeTag) return allProjects.filter((p) => p.tags?.some((t) => t.slug === activeTag));
    if (platform) return allProjects.filter((p) => platformOf(p) === platform);
    return allProjects;
  }, [allProjects, activeTag, platform]);

  return (
    <main>
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">
            // Builder OS · System Registry
          </p>
          <h1 className="mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            Systems, not <span className="text-editorial-accent-strong">screenshots</span>.
          </h1>
          <p className="mb-4 max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Inspect what each deployment solves, how it operates, which channels it connects, and the engineering
            behind it.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTag("")}
              className={cn(
                "rounded-full border px-[1.05rem] py-[0.48rem] text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-px",
                activeTag === ""
                  ? "border-heading bg-heading text-bg"
                  : "border-line text-ink-soft hover:border-line-strong hover:text-heading",
              )}
            >
              All
            </button>
            {tags.map((t) => (
              <button
                key={t.slug}
                type="button"
                onClick={() => setActiveTag(t.slug)}
                className={cn(
                  "rounded-full border px-[1.05rem] py-[0.48rem] text-sm font-medium transition-[transform,background-color,border-color,color] duration-150 hover:-translate-y-px",
                  activeTag === t.slug
                    ? "border-heading bg-heading text-bg"
                    : "border-line text-ink-soft hover:border-line-strong hover:text-heading",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {visible === null && !failed && (
            <div className="grid gap-3">
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-[120px] animate-pulse rounded-[var(--radius)] bg-bg-soft" />
            </div>
          )}

          {(failed || visible?.length === 0) && (
            <p className="py-20 text-center text-ink-soft">
              {failed ? "Could not load projects right now." : "No projects match this filter yet."}
            </p>
          )}

          {visible && visible.length > 0 && (
            <div className="border-t border-line">
              {visible.map((p, i) => (
                <article key={p.slug} className="border-b border-line py-9">
                  <div
                    className="grid items-center gap-6 max-md:grid-cols-1"
                    style={{ gridTemplateColumns: "minmax(150px, 0.24fr) minmax(0, 1fr) minmax(190px, 0.28fr)" }}
                  >
                    <div>
                      <span className="font-mono text-[0.74rem] uppercase tracking-[0.08em] text-heading">
                        SYS {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="mt-2 flex items-center gap-[0.4rem] font-mono text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[#188452]">
                        <i className="inline-block size-[7px] rounded-full bg-[#29d978] shadow-[0_0_10px_rgba(41,217,120,0.55)]" />
                        STATUS: LIVE
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block font-mono text-[0.64rem] font-bold uppercase tracking-[0.08em] text-editorial-accent">
                        {p.category || "Deployed system"}
                      </span>
                      <h2 className="mb-[0.65rem] text-2xl font-bold text-heading">
                        <Link href={`/projects/${p.slug}`}>{p.title}</Link>
                      </h2>
                      <p className="max-w-[68ch] text-ink-soft">{p.summary}</p>
                      <div className="my-4 flex flex-wrap gap-6 font-mono text-[0.7rem] font-semibold text-heading">
                        <span>
                          <small className="mb-[0.2rem] block text-[0.56rem] tracking-[0.08em] text-editorial-muted">CHANNELS</small>
                          {techFor(p).slice(0, 2).join(" / ")}
                        </span>
                        <span>
                          <small className="mb-[0.2rem] block text-[0.56rem] tracking-[0.08em] text-editorial-muted">MODE</small>
                          {p.is_embeddable ? "INTERACTIVE / LIVE" : "DEPLOYED / MONITORED"}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {techFor(p).map((name) => (
                          <span key={name} className="inline-flex items-center rounded-lg border border-line px-[0.9rem] py-[0.45rem] font-mono text-[0.8rem] text-ink">
                            {name}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <Link href={`/projects/${p.slug}`} className="group inline-flex items-center gap-1 text-sm font-semibold text-heading">
                          View System{" "}
                          <ArrowRight className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true" />
                        </Link>
                        {!!p.is_embeddable && typeof p.live_url === "string" && (
                          <Button
                            type="button"
                            variant="brand-outline"
                            size="pill-sm"
                            onClick={() => setLiveDemo({ title: p.title, url: p.live_url as string })}
                          >
                            Live Demo
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="justify-self-end border-l border-line pl-4 text-right max-md:justify-self-start max-md:border-l-0 max-md:pl-0">
                      <strong className="block text-[clamp(1.1rem,2.4vw,1.6rem)] leading-none text-heading">{metricFor(p, i)}</strong>
                      <span className="mt-[0.45rem] block text-[0.78rem] text-editorial-muted">Performance-oriented signal</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-line border-b bg-heading py-20 text-center text-bg">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Which workflow should work like this?</h2>
          <p className="mb-6 text-lg opacity-90">
            Bring one repetitive customer or operations process. We&apos;ll identify the smallest safe system worth
            testing.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button variant="brand" size="pill" className="border-bg bg-bg text-heading hover:text-bg" nativeButton={false} render={<a href="/book.html" />}>
              Review a workflow
            </Button>
            <Button
              variant="brand-outline"
              size="pill"
              className="border-white/35 text-bg hover:border-bg hover:text-bg"
              nativeButton={false}
              render={<Link href="/contact" />}
            >
              Send a message
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={!!liveDemo} onOpenChange={(open) => !open && setLiveDemo(null)}>
        <DialogContent className="h-[90vh] w-[min(1100px,calc(100%-2rem))] max-w-none p-0">
          <DialogHeader className="border-b border-line p-4">
            <DialogTitle>Live Demo{liveDemo ? ` - ${liveDemo.title}` : ""}</DialogTitle>
          </DialogHeader>
          {liveDemo && <iframe src={liveDemo.url} title="Live demo" className="h-full w-full flex-1 border-0" />}
        </DialogContent>
      </Dialog>
    </main>
  );
}
