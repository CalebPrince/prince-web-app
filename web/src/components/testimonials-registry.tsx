"use client";

import * as React from "react";
import Link from "next/link";
import { api, type Testimonial } from "@/lib/api";
import { SAMPLE_PROJECTS } from "@/lib/sample-projects-data";
import { SampleWireframeScene } from "@/components/sample-wireframe-scene";

// Ported from public/js/testimonials-list.js: a review only counts as a
// case study once it's linked to a published project with a real,
// admin-entered outcome_metrics line — otherwise it renders as a plain
// quote card. Same split logic, same "more reviews" heading gating.
export function TestimonialsRegistry() {
  const [rows, setRows] = React.useState<Testimonial[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    api
      .testimonials()
      .then(setRows)
      .catch(() => setFailed(true));
  }, []);

  const caseStudies: (Testimonial & { signals: string[] })[] = [];
  const plain: Testimonial[] = [];
  (rows ?? []).forEach((t) => {
    const signals = String(t.outcome_metrics || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (signals.length && t.project_slug) {
      caseStudies.push({ ...t, signals });
    } else {
      plain.push(t);
    }
  });

  return (
    <main>
      <header className="border-b border-line bg-bg pt-40 pb-16 md:pt-44">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Client signals</p>
          <h1 className="mb-3 max-w-4xl text-5xl font-bold md:text-6xl">
            What <span className="text-editorial-accent-strong">clients</span> say.
          </h1>
          <p className="max-w-[60ch] text-lg leading-[1.65] text-ink-soft">
            Real feedback from real projects, and the real numbers behind a few of them. Nothing here is written by
            me.
          </p>
        </div>
      </header>

      {/* Verified outcomes — real case studies, only shown when at least one exists */}
      {caseStudies.length > 0 && (
        <section className="border-t border-line py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-8 max-w-2xl">
              <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Verified outcomes</span>
              <h2 className="mb-2 text-3xl font-bold md:text-4xl">Results, not just reviews.</h2>
              <p className="text-ink-soft">Every number below is pulled straight from the project it describes, not written by me.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {caseStudies.map((t) => (
                <Link
                  key={t.id}
                  href={`/projects/${t.project_slug}`}
                  className="group block rounded-[var(--radius)] border border-line bg-card p-8 shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-editorial-accent hover:shadow-lg"
                >
                  <span className="mb-[0.6rem] block font-mono text-[0.7rem] font-bold uppercase tracking-[0.08em] text-editorial-accent">Measured result</span>
                  <p className="mb-2 text-[clamp(1.25rem,2.2vw,1.6rem)] font-bold leading-[1.35] tracking-[-0.01em] text-heading">{t.signals[0]}</p>
                  {t.signals.length > 1 && (
                    <ul className="mb-4 list-none p-0 text-[0.85rem] text-editorial-muted">
                      {t.signals.slice(1, 3).map((s) => (
                        <li key={s} className="relative pl-4">
                          <span className="absolute left-0 text-editorial-accent">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="border-t border-line pt-4 text-[0.95rem] italic">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5 flex items-center justify-between gap-3 text-[0.82rem] text-editorial-muted">
                    <span>
                      {t.client_name}
                      {t.project_title ? ` · ${t.project_title}` : ""}
                    </span>
                    <span className="whitespace-nowrap text-editorial-accent">
                      View project{" "}
                      <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                        →
                      </span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* What I build — illustrative sample projects */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-8 max-w-2xl">
            <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// What I build</span>
            <h2 className="mb-2 text-3xl font-bold md:text-4xl">A broader look at what I build.</h2>
            <p className="text-ink-soft">
              Illustrative concepts across the services I offer, not live client work, and not real customer quotes.
              {caseStudies.length > 0 && " For the real numbers, see the case studies above."}
            </p>
          </div>
          {SAMPLE_PROJECTS.map((group) => (
            <div key={group.track} className="mb-16 last:mb-0">
              <h3 className="mb-1 text-xl font-bold text-heading">{group.track}</h3>
              <p className="mb-5 text-ink-soft">{group.groupNote}</p>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <div
                    key={item.domain}
                    className="h-full overflow-hidden rounded-[var(--radius)] border border-line bg-card shadow-sm transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-[3px] hover:border-line-strong hover:shadow-lg"
                  >
                    <div className="flex items-center gap-[0.6rem] border-b border-line bg-bg-soft px-[0.7rem] py-[0.55rem]">
                      <span className="flex shrink-0 gap-[0.3rem]">
                        <i className="size-[7px] rounded-full bg-line-strong" />
                        <i className="size-[7px] rounded-full bg-line-strong" />
                        <i className="size-[7px] rounded-full bg-line-strong" />
                      </span>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] border border-line bg-card px-[0.55rem] py-[0.18rem] font-mono text-[0.68rem] tracking-[0.01em] text-editorial-muted">
                        {item.domain}
                      </span>
                    </div>
                    <div
                      className="flex h-32 items-center justify-center p-4"
                      style={{
                        background: "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px), var(--bg-soft)",
                        backgroundSize: "16px 16px",
                      }}
                    >
                      <SampleWireframeScene type={group.wireframe} />
                    </div>
                    <div className="px-5 py-[1.1rem_1.25rem_1.3rem]">
                      <span className="mb-2 block font-mono text-[0.68rem] font-bold uppercase tracking-[0.06em] text-editorial-accent">{item.business}</span>
                      <h4 className="mb-[0.4rem] font-bold text-heading">{item.headline}</h4>
                      <p className="text-[0.87rem] leading-[1.55] text-editorial-muted">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Plain reviews */}
      <section className="border-t border-line py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          {caseStudies.length > 0 && plain.length > 0 && (
            <div className="mb-8 max-w-2xl">
              <span className="mb-2 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Client signals</span>
              <h2 className="text-3xl font-bold md:text-4xl">More reviews.</h2>
            </div>
          )}

          {rows === null && !failed && (
            <div className="grid gap-5 md:grid-cols-3">
              <div className="h-40 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-40 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
              <div className="h-40 animate-pulse rounded-[var(--radius)] bg-bg-soft" />
            </div>
          )}

          {(failed || (rows !== null && rows.length === 0)) && (
            <p className="py-10 text-center text-ink-soft">
              Reviews are on their way, check back soon, or{" "}
              <Link href="/contact" className="text-editorial-accent underline">
                get in touch
              </Link>{" "}
              to start a project.
            </p>
          )}

          {plain.length > 0 && (
            <div className="grid gap-5 md:grid-cols-3">
              {plain.map((t) => (
                <div key={t.id} className="h-full rounded-[var(--radius)] border border-line bg-card p-6 shadow-sm">
                  <div className="mb-2 text-[#f59e0b] tracking-[2px]">
                    {"★".repeat(t.rating || 0)}
                    {"☆".repeat(5 - (t.rating || 0))}
                  </div>
                  <p className="text-ink-soft">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-3 font-semibold text-heading">{t.client_name}</div>
                  {t.project_reference && <div className="text-sm text-editorial-muted">{t.project_reference}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
