"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { api, type Project } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ProjectLiveDemo } from "@/components/project-live-demo";

// Ported from public/js's project.html inline script: same isAgentSystem
// heuristic (regex over category/tags/summary) picking one of two 4-step
// workflow narratives, same section numbering and copy, same safe-URL
// guard on live_url/repo_url. The original hardcodes this "terminal
// dossier" look (#07100b/#62ff98/Fira Code) regardless of site theme; by
// request this port deviates from that and drives it off the existing
// var(--editorial-accent)/var(--heading-color)/var(--bg) tokens instead,
// so it's dark in dark/midnight and switches to the light editorial
// palette in light/paper — same visual language, now theme-aware. OS-
// chrome colors (traffic-light dots, the LIVE status glow) stay literal,
// matching how .status-dot.is-live works everywhere else on the site.
const AGENT_WORKFLOW = [
  ["01", "Request enters", "A customer or operational trigger reaches the system through its configured channel."],
  ["02", "Context is structured", "The system identifies what happened, what is known, and which action is permitted."],
  ["03", "The workflow executes", "Automation, an AI specialist, or the application completes the bounded task."],
  ["04", "Human control remains", "Exceptions, judgment calls, and sensitive decisions are handed to a person with context."],
] as const;
const APP_WORKFLOW = [
  ["01", "User intent", "The interface makes the next useful action clear for the customer or team member."],
  ["02", "Application logic", "Validated data moves through the business rules and connected services."],
  ["03", "System response", "The platform returns the result, record, notification, or next action."],
  ["04", "Operational visibility", "The team can inspect progress, exceptions, and outcomes without chasing updates."],
] as const;

function safeExternalUrl(value: unknown): string {
  try {
    const url = new URL(String(value || ""), typeof window !== "undefined" ? window.location.origin : "https://princecaleb.dev");
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function ProjectDetail({ slug }: { slug: string }) {
  const [p, setP] = React.useState<Project | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    api
      .project(slug)
      .then((project) => {
        setP(project);
        document.title = `${project.title}, Prince Caleb`;
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
        <h1 className="mb-3 text-3xl font-bold text-heading">Project not found</h1>
        <Link href="/projects" className="inline-flex items-center gap-2 text-heading">
          ← Back to projects
        </Link>
      </main>
    );
  }

  if (!p) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-4 h-6 w-[200px] animate-pulse rounded bg-bg-soft" />
        <div className="mb-4 h-12 w-[70%] animate-pulse rounded bg-bg-soft" />
        <div className="h-[360px] animate-pulse rounded bg-bg-soft" />
      </main>
    );
  }

  const liveUrl = safeExternalUrl(p.live_url);
  const repoUrl = safeExternalUrl(p.repo_url);
  const tags = (p.tags ?? []).map((t) => t.name).filter(Boolean);
  const signals = String(p.outcome_metrics ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const gallery = (p.gallery ?? []).filter(Boolean);
  const coverPath = p.cover_image_path ?? "";
  const images = [coverPath, ...gallery].filter(Boolean).slice(0, 4);
  const isAgentSystem = /ai|agent|voice|chat|automation|workflow/i.test(`${p.category} ${tags.join(" ")} ${p.summary}`);
  const workflow = isAgentSystem ? AGENT_WORKFLOW : APP_WORKFLOW;

  return (
    <main>
      {/* Dark terminal hero — deliberately hardcoded colors, not theme tokens */}
      <header
        className="border-b border-[var(--line)] px-0 py-24 text-[var(--heading-color)]"
        style={{ background: "radial-gradient(circle at 78% 35%, rgba(98,255,152,.09), transparent 28%), var(--bg)" }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-14 font-mono text-[0.68rem] font-semibold tracking-[0.06em] text-[var(--editorial-accent)]">
            builder@princecaleb:~$ inspect {p.slug}
          </div>
          <div className="grid items-end gap-20 lg:grid-cols-[1.4fr_0.6fr] max-lg:gap-8">
            <div>
              <p className="mb-3 font-mono text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[var(--editorial-accent)]">
                {String(p.category || "deployed system").replaceAll("_", " ")}
              </p>
              <h1 className="mb-6 max-w-[920px] text-[clamp(3rem,7vw,6.2rem)] font-extrabold leading-[0.94] tracking-[-0.07em] text-[var(--heading-color)]">
                {p.title}
              </h1>
              <p className="max-w-[720px] text-[1.05rem] leading-[1.75] text-[var(--ink-soft)]">{p.summary}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {!!p.is_embeddable && liveUrl && <ProjectLiveDemo title={p.title} url={liveUrl} />}
                {liveUrl && (
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener"
                    className="group inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-[1.8rem] py-[0.82rem] font-medium text-[var(--heading-color)] transition-colors duration-300 hover:border-[var(--editorial-accent)]"
                  >
                    View live site{" "}
                    <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                      →
                    </span>
                  </a>
                )}
                {repoUrl && (
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] px-[1.8rem] py-[0.82rem] font-medium text-[var(--heading-color)] transition-colors duration-300 hover:border-[var(--editorial-accent)]"
                  >
                    View repository
                  </a>
                )}
              </div>
            </div>
            <aside className="border border-[var(--line)] bg-[var(--card-bg)] max-lg:hidden">
              {[
                ["STATUS", "LIVE", true],
                ["TYPE", isAgentSystem ? "CONNECTED INTELLIGENCE" : "CUSTOM PLATFORM", false],
                ["CHANNELS / STACK", tags.slice(0, 3).join(" / ") || "CUSTOM ENGINEERING", false],
              ].map(([label, value, dot], i) => (
                <div key={label as string} className={cn("p-4", i !== 0 && "border-t border-[var(--line)]")}>
                  <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">{label}</span>
                  <strong className="mt-[0.35rem] flex items-center gap-2 font-mono text-[0.75rem] font-bold text-[var(--heading-color)]">
                    {dot && <i className="inline-block size-[7px] rounded-full bg-[var(--editorial-accent)] shadow-[0_0_12px_var(--editorial-accent)]" />}
                    {value}
                  </strong>
                </div>
              ))}
            </aside>
          </div>
        </div>
      </header>

      <div className="bg-[var(--bg)] py-24 text-[var(--heading-color)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <section className="grid gap-20 border-b border-[var(--line)] pb-24 lg:grid-cols-[0.85fr_1.15fr] max-lg:grid-cols-1 max-lg:gap-8">
            <div>
              <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">01 / BUSINESS PROBLEM</span>
              <h2 className="mt-[0.7rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                What the system had to change.
              </h2>
            </div>
            <p className="text-[1.2rem] leading-[1.8] text-[var(--ink-soft)]">{p.summary}</p>
          </section>

          <section className="border-b border-[var(--line)] py-24">
            <header className="mb-12 grid gap-20 lg:grid-cols-[0.85fr_1.15fr] max-lg:grid-cols-1 max-lg:gap-8">
              <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">02 / SYSTEM ARCHITECTURE</span>
              <h2 className="lg:col-start-2 -mt-[0.2rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                How the work moves.
              </h2>
            </header>
            <ol className="grid grid-cols-4 border border-[var(--line)] max-lg:grid-cols-2 max-sm:grid-cols-1">
              {workflow.map(([n, title, body], i) => (
                <li
                  key={n}
                  className={cn(
                    "min-h-[250px] p-5",
                    i !== 0 && "border-l border-[var(--line)] max-lg:border-l-0 max-lg:border-t",
                  )}
                >
                  <span className="font-mono text-[0.65rem] font-bold text-[var(--editorial-accent)]">{n}</span>
                  <strong className="mb-[0.7rem] mt-16 block text-[var(--heading-color)] max-sm:mt-8">{title}</strong>
                  <p className="text-[0.77rem] leading-[1.65] text-[var(--ink-soft)]">{body}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="border-b border-[var(--line)] py-24">
            <header className="mb-12 grid gap-20 lg:grid-cols-[0.85fr_1.15fr] max-lg:grid-cols-1 max-lg:gap-8">
              <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">03 / ENGINEERING RECORD</span>
              <h2 className="lg:col-start-2 -mt-[0.2rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                Why it was built this way.
              </h2>
            </header>
            <div className="ml-auto max-w-[820px] text-[1rem] leading-[1.85] text-[var(--ink-soft)]">
              {(p.case_study_body || "The full engineering record is being prepared.").split("\n").map((line, i) => (
                <p key={i} className="mb-[1.4rem]">
                  {line}
                </p>
              ))}
            </div>
          </section>

          {images.length > 0 && (
            <section className="border-b border-[var(--line)] py-24">
              <header className="mb-12 grid gap-20 lg:grid-cols-[0.85fr_1.15fr] max-lg:grid-cols-1 max-lg:gap-8">
                <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">04 / LIVE INTERFACES</span>
                <h2 className="lg:col-start-2 -mt-[0.2rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                  The operating surfaces.
                </h2>
              </header>
              <div className="grid grid-cols-2 items-start gap-4 max-sm:grid-cols-1">
                {images.map((image, index) => (
                  <figure
                    key={index}
                    className="group m-0 overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--bg)] shadow-[0_24px_55px_rgba(0,0,0,0.28)] transition-[transform,border-color,box-shadow] duration-[450ms] hover:-translate-y-[5px] hover:border-[var(--line-strong)]"
                  >
                    <div
                      className="grid min-h-[34px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] px-[0.65rem] py-[0.42rem]"
                      style={{ background: "linear-gradient(180deg,#122219 0%,#0b1710 100%)" }}
                      aria-hidden="true"
                    >
                      <span className="flex gap-[0.35rem]">
                        <i className="size-[7px] rounded-full bg-[#ff6b5f]" />
                        <i className="size-[7px] rounded-full bg-[#e8bd54]" />
                        <i className="size-[7px] rounded-full bg-[#43d17a]" />
                      </span>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] border border-[var(--line)] bg-[var(--bg-soft)] px-[0.6rem] py-[0.22rem] font-mono text-[0.58rem] font-semibold tracking-[0.025em] text-[var(--editorial-muted)]">
                        secure://{p.slug}/surface-{String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="flex items-center gap-[0.35rem] font-mono text-[0.55rem] font-bold tracking-[0.08em] text-[var(--editorial-accent)]">
                        <i className="size-[6px] rounded-full bg-[#43e781] shadow-[0_0_9px_rgba(67,231,129,0.8)]" />
                        LIVE
                      </span>
                    </div>
                    <div
                      className="relative overflow-hidden p-[clamp(0.3rem,0.7vw,0.55rem)]"
                      style={{
                        background:
                          "linear-gradient(rgba(98,255,152,.025) 1px,transparent 1px), linear-gradient(90deg,rgba(98,255,152,.025) 1px,transparent 1px), var(--bg)",
                        backgroundSize: "20px 20px",
                      }}
                    >
                      <Image
                        src={image}
                        alt={`${p.title} interface ${index + 1}`}
                        width={800}
                        height={500}
                        unoptimized
                        className="block h-auto w-full rounded border border-white/[0.07] transition-[filter] duration-300 ease-linear group-hover:brightness-[1.035]"
                      />
                    </div>
                  </figure>
                ))}
              </div>
            </section>
          )}

          <section className="border-b border-[var(--line)] py-24">
            <header className="mb-12 grid gap-20 lg:grid-cols-[0.85fr_1.15fr] max-lg:grid-cols-1 max-lg:gap-8">
              <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">05 / MEASURABLE RESULT</span>
              <h2 className="lg:col-start-2 -mt-[0.2rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                What changed after deployment.
              </h2>
            </header>
            <div className="grid grid-cols-3 border border-[var(--line)] max-lg:grid-cols-1">
              {(signals.length ? signals : ["Live system deployed and available for inspection."]).map((signal, i) => (
                <article
                  key={i}
                  className={cn("min-h-[180px] p-5", i !== 0 && "border-l border-[var(--line)] max-lg:border-l-0 max-lg:border-t")}
                >
                  <span className="font-mono text-[0.62rem] font-bold text-[var(--editorial-accent)]">{String(i + 1).padStart(2, "0")}</span>
                  <strong className="mt-14 block text-[1.05rem] leading-[1.45] text-[var(--heading-color)]">{signal}</strong>
                </article>
              ))}
            </div>
          </section>

          {p.testimonial && (
            <blockquote className="mx-auto my-24 max-w-[900px] border-0 p-0">
              <p className="text-[clamp(1.6rem,3vw,2.7rem)] font-semibold leading-[1.4] tracking-[-0.035em] text-[var(--heading-color)]">
                &ldquo;{p.testimonial.quote}&rdquo;
              </p>
              <footer className="font-mono text-[0.68rem] font-semibold tracking-[0.06em] text-[var(--editorial-accent)]">
                {p.testimonial.client_name}
                {p.testimonial.rating ? ` · ${"★".repeat(p.testimonial.rating)}` : ""}
              </footer>
            </blockquote>
          )}

          <div className="flex flex-wrap items-end justify-between gap-8 pt-20 max-sm:flex-col max-sm:items-start">
            <div>
              <span className="block font-mono text-[0.58rem] font-bold tracking-[0.1em] text-[var(--editorial-muted)]">NEXT DEPLOYMENT</span>
              <h2 className="mt-[0.7rem] text-[clamp(2rem,4vw,3.6rem)] font-bold leading-[1.04] tracking-[-0.055em] text-[var(--heading-color)]">
                What should your system do?
              </h2>
            </div>
            <Link
              href={`/contact?project=${p.id}`}
              className="group inline-flex items-center gap-2 rounded-full border border-[var(--editorial-accent)] bg-[var(--editorial-accent)] px-[1.8rem] py-[0.82rem] font-medium text-[var(--on-accent)] transition-colors duration-300 hover:bg-transparent hover:text-[var(--editorial-accent)]"
            >
              Map a similar workflow{" "}
              <span className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1" aria-hidden="true">
                →
              </span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
