import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import { api, type Testimonial } from "@/lib/api";
import { SAMPLE_PROJECTS } from "@/lib/sample-projects-data";
import { SampleWireframeScene } from "@/components/SampleWireframeScene";
import { GoogleRatingStrip } from "@/components/GoogleRatingStrip";
import { GoogleReviewCard } from "@/components/GoogleReviewCard";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { cn } from "@/lib/utils";

// Nothing on this page is written by me. Google's reviews arrive from the
// business listing and appear only once they have been given the
// "testimonials" placement in the admin; the rest are testimonials clients
// submitted and I approved. A review only counts as a case study once it is
// linked to a published project with a real, admin-entered outcome_metrics
// line - otherwise it renders as a plain quote card.
export async function TestimonialsRegistry() {
  const [rating, googleReviews, rows] = await Promise.all([
    api.googleRating().catch(() => null),
    api.googleReviews("testimonials").catch(() => []),
    api.testimonials().catch(() => []),
  ]);

  const caseStudies: (Testimonial & { signals: string[] })[] = [];
  const plain: Testimonial[] = [];
  rows.forEach((t) => {
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

  const hasReviews = googleReviews.length > 0 || rows.length > 0;

  // Section numbering skips any block that is not rendered, so the labels
  // always read 01, 02, 03 in order regardless of what the API returned.
  let section = 0;
  const nextIndex = () => String(++section).padStart(2, "0");

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pb-20 pt-36 md:px-10 md:pb-24 md:pt-48">
          <Reveal>
            <SectionLabel>Client reviews</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              What <span className="text-accent">clients</span> say.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-[60ch] text-lg leading-relaxed text-text-2 md:text-xl">
              Reviews clients published on my Google business listing, and testimonials they sent me
              directly. Nothing here is written by me, and every Google review keeps its Google
              attribution.
            </p>
          </Reveal>
        </div>
      </section>

      {rating?.configured && (
        <GoogleRatingStrip
          rating={rating.rating ?? 0}
          reviewCount={rating.reviewCount ?? 0}
          reviewUrl={rating.googleMapsUri || "https://g.page/r/CfBZ-YWdgM_UEBI/review"}
        />
      )}

      {/* ── GOOGLE REVIEWS ──────────────────────────────────── */}
      {googleReviews.length > 0 && (
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
            <Reveal className="max-w-2xl">
              <SectionLabel index={nextIndex()}>Google reviews</SectionLabel>
              <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                Published by clients on Google.
              </h2>
            </Reveal>
            <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {googleReviews.map((review, index) => (
                <Reveal key={review.id} delay={(index % 3) * 70}>
                  <GoogleReviewCard review={review} />
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── VERIFIED OUTCOMES ───────────────────────────────── */}
      {caseStudies.length > 0 && (
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
            <Reveal className="max-w-2xl">
              <SectionLabel index={nextIndex()}>Verified outcomes</SectionLabel>
              <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                Results, not just reviews.
              </h2>
              <p className="mt-4 text-text-2">
                Every number below is pulled straight from the project it describes, not written by
                me.
              </p>
            </Reveal>

            <div className="mt-16 grid gap-6 md:grid-cols-2">
              {caseStudies.map((t, i) => (
                <Reveal key={t.id} delay={(i % 2) * 90}>
                  <Link
                    href={`/work/${t.project_slug}`}
                    className="group block h-full rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-7 transition-colors hover:border-accent/30 glass"
                  >
                    <p className="text-2xl font-bold tracking-tight text-accent">{t.signals[0]}</p>
                    {t.signals.length > 1 && (
                      <ul className="mt-3 space-y-1.5 text-sm text-text-2">
                        {t.signals.slice(1, 3).map((s) => (
                          <li key={s} className="relative pl-4">
                            <span className="absolute left-0 text-accent">+</span>
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-5 border-t border-hairline pt-5 italic leading-relaxed text-text-2">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                    <div className="mt-6 flex items-center justify-between gap-3 text-sm text-muted">
                      <span>
                        {t.client_name}
                        {t.project_title ? ` · ${t.project_title}` : ""}
                      </span>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-accent">
                        View project
                        <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── PLAIN REVIEWS ───────────────────────────────────── */}
      {plain.length > 0 && (
        <section className="border-t border-hairline">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
            <Reveal className="mb-16 max-w-2xl">
              <SectionLabel index={nextIndex()}>Sent to me directly</SectionLabel>
              <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                More client reviews.
              </h2>
            </Reveal>

            <div className="grid gap-5 md:grid-cols-3">
              {plain.map((t, i) => (
                <Reveal
                  key={t.id}
                  delay={(i % 3) * 80}
                  className="h-full rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-6 transition-colors hover:border-accent/30 glass"
                >
                  <div className="flex gap-0.5 text-accent">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star
                        key={s}
                        className={cn("size-4", s < (t.rating || 0) ? "fill-current" : "opacity-25")}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <p className="mt-4 leading-relaxed text-text-2">&ldquo;{t.quote}&rdquo;</p>
                  <div className="mt-5 border-t border-hairline pt-4">
                    <p className="font-semibold text-text">{t.client_name}</p>
                    {t.project_reference && (
                      <p className="label mt-1 text-muted">{t.project_reference}</p>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Nothing invented stands in for a review that does not exist yet. */}
      {!hasReviews && (
        <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10">
          <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/40 p-8 md:p-10">
            <h2 className="text-2xl font-bold tracking-tight">No published reviews yet.</h2>
            <p className="mt-3 max-w-xl text-text-2">
              Reviews appear here once clients publish them on Google or send them to me directly.
              Until then, the work itself is the better guide.
            </p>
            <Link
              href="/work"
              className="mt-6 inline-flex items-center gap-2 font-semibold text-accent"
            >
              View selected work
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* ── WHAT I BUILD (illustrative) ─────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="max-w-2xl">
            <SectionLabel index={nextIndex()}>What I build</SectionLabel>
            <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
              A broader look at what I build.
            </h2>
            <p className="mt-4 text-text-2">
              Illustrative concepts across the services I offer, not live client work, and not real
              customer quotes.
              {caseStudies.length > 0 && " For the real numbers, see the case studies above."}
            </p>
          </Reveal>

          {SAMPLE_PROJECTS.map((group) => (
            <div key={group.track} className="mt-16">
              <h3 className="text-xl font-semibold tracking-tight text-text">{group.track}</h3>
              <p className="mt-1.5 text-text-2">{group.groupNote}</p>
              <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item, i) => (
                  <Reveal
                    key={item.domain}
                    delay={(i % 3) * 60}
                    className="h-full overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg transition-colors hover:border-hairline-strong"
                  >
                    <div className="flex items-center gap-2.5 border-b border-hairline bg-bg-2/60 px-3 py-2.5">
                      <span className="flex shrink-0 gap-1">
                        <i className="size-[7px] rounded-full bg-hairline-strong" />
                        <i className="size-[7px] rounded-full bg-hairline-strong" />
                        <i className="size-[7px] rounded-full bg-hairline-strong" />
                      </span>
                      <span className="overflow-hidden text-ellipsis whitespace-nowrap rounded-[5px] border border-hairline bg-bg px-2 py-0.5 font-mono text-[0.68rem] text-muted">
                        {item.domain}
                      </span>
                    </div>
                    <div
                      className="flex h-32 items-center justify-center p-4"
                      style={{
                        background:
                          "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px), var(--bg-2)",
                        backgroundSize: "16px 16px",
                      }}
                    >
                      <SampleWireframeScene type={group.wireframe} />
                    </div>
                    <div className="p-5">
                      <span className="label text-accent">{item.business}</span>
                      <h4 className="mt-2 font-semibold tracking-tight text-text">{item.headline}</h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-text-2">{item.description}</p>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
