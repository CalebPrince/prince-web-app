import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { FaGithub } from "react-icons/fa6";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { ProjectLiveDemo } from "@/components/ProjectLiveDemo";
import { StackIcon } from "@/components/StackIcon";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSystem, getSystems, type SystemView } from "@/lib/systems";

export async function generateMetadata({ params }: PageProps<"/systems/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  try {
    const system = await getSystem(slug);
    return { title: system.name, description: system.overview };
  } catch {
    return {
      title: "System",
      description: "A system engineered by Prince Caleb, from architecture to launch.",
    };
  }
}

export default async function SystemDetail({ params }: PageProps<"/systems/[slug]">) {
  const { slug } = await params;

  let system: SystemView;
  try {
    system = await getSystem(slug);
  } catch {
    notFound();
  }

  // The "next system" link wraps the published list; a failure here should
  // never take the page down, so it degrades to no link.
  let next: SystemView | null = null;
  try {
    const all = await getSystems();
    const index = all.findIndex((s) => s.slug === system.slug);
    next = all.length > 1 ? all[(index + 1) % all.length] : null;
  } catch {
    next = null;
  }

  const meta = [
    { k: "Client", v: system.client },
    { k: "Role", v: system.role },
    { k: "Timeline", v: system.timeline },
    { k: "Result", v: system.result },
  ].filter((row) => row.v);

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-14 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <Link
              href="/systems"
              className="label inline-flex items-center gap-2 text-text-2 transition-colors hover:text-accent"
            >
              <ArrowLeft className="size-3.5" /> All systems
            </Link>
          </Reveal>
          <Reveal delay={80} className="mt-8 flex flex-wrap items-center gap-3">
            <span className="label text-accent">{system.category}</span>
            {system.year && <span className="label text-muted">/ {system.year}</span>}
            {system.tagline && <span className="label text-muted">/ {system.tagline}</span>}
          </Reveal>
          <Reveal delay={140}>
            <h1 className="mt-5 max-w-4xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              {system.name}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">{system.overview}</p>
          </Reveal>
          <Reveal delay={260} className="mt-10 flex flex-wrap gap-4">
            {system.isEmbeddable && system.live && (
              <ProjectLiveDemo title={system.name} url={system.live} />
            )}
            {system.live && (
              <a
                href={system.live}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: system.isEmbeddable ? "secondary" : "primary", size: "lg" }), "group")}
              >
                Visit live site
                <ExternalLink className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </a>
            )}
            {system.repo && (
              <a
                href={system.repo}
                target="_blank"
                rel="noreferrer"
                className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
              >
                <FaGithub className="size-[1.1rem]" aria-hidden="true" />
                View repository
              </a>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── COVER ───────────────────────────────────────────── */}
      {system.img && (
        <section className="mx-auto max-w-[1400px] px-6 md:px-10">
          <Reveal className="overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2 glass">
            <img src={system.img} alt={system.name} className="aspect-[16/9] w-full object-cover" />
          </Reveal>
        </section>
      )}

      {/* ── META + STACK ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-28">
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Sidebar meta */}
          <Reveal className="lg:col-span-4">
            {meta.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-1">
                {meta.map((row) => (
                  <div key={row.k} className="border-t border-hairline pt-4">
                    <dt className="label text-muted">{row.k}</dt>
                    <dd className="mt-2 text-text">{row.v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {system.stack.length > 0 && (
              <div className={cn("border-t border-hairline pt-4", meta.length > 0 && "mt-10")}>
                <p className="label text-muted">Built with</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {system.stack.map((item) => (
                    <span
                      key={item.name}
                      className="inline-flex items-center gap-2 rounded-full border border-hairline bg-bg-2/60 px-3.5 py-2 text-sm text-text-2 glass"
                    >
                      <StackIcon name={item.icon} />
                      {item.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Reveal>

          {/* Body */}
          <div className="space-y-12 lg:col-span-8">
            {system.challenge && (
              <Reveal>
                <SectionLabel index="01">The challenge</SectionLabel>
                <p className="mt-5 text-xl leading-relaxed text-text-2">{system.challenge}</p>
              </Reveal>
            )}
            {system.solution && (
              <Reveal>
                <SectionLabel index="02">The solution</SectionLabel>
                <p className="mt-5 text-xl leading-relaxed text-text-2">{system.solution}</p>
              </Reveal>
            )}

            {/* Falls back to the engineering write-up when challenge/solution
                haven't been filled in for this system yet. */}
            {!system.challenge && !system.solution && system.body.length > 0 && (
              <Reveal>
                <SectionLabel index="01">Engineering record</SectionLabel>
                <div className="mt-5 space-y-5">
                  {system.body.map((para, i) => (
                    <p key={i} className="text-xl leading-relaxed text-text-2">
                      {para}
                    </p>
                  ))}
                </div>
              </Reveal>
            )}

            {/* Metrics */}
            {system.metrics.length > 0 && (
              <Reveal className="grid grid-cols-2 gap-6 border-t border-hairline pt-10 md:grid-cols-3">
                {system.metrics.map((m) => (
                  <div key={m.label || m.value}>
                    <p className="text-[clamp(1.8rem,4vw,3rem)] font-extrabold leading-none tracking-[-0.03em] text-accent">
                      {m.value}
                    </p>
                    <p className="label mt-3 text-muted">{m.label}</p>
                  </div>
                ))}
              </Reveal>
            )}
          </div>
        </div>

        {/* Gallery */}
        {system.gallery.length > 0 && (
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {system.gallery.map((src, i) => (
              <Reveal
                key={src}
                delay={i * 90}
                className="overflow-hidden rounded-[var(--radius)] border border-hairline bg-bg-2 glass"
              >
                <img
                  src={src}
                  alt={`${system.name} detail ${i + 1}`}
                  className="aspect-[4/3] w-full object-cover"
                />
              </Reveal>
            ))}
          </div>
        )}

        {/* Testimonial */}
        {system.testimonial && (
          <Reveal className="mx-auto mt-20 max-w-[900px] text-center">
            <p className="text-[clamp(1.4rem,3vw,2.4rem)] font-semibold leading-[1.4] tracking-[-0.03em] text-text">
              &ldquo;{system.testimonial.quote}&rdquo;
            </p>
            <p className="label mt-6 text-accent">
              {system.testimonial.client_name}
              {system.testimonial.rating ? ` · ${"★".repeat(system.testimonial.rating)}` : ""}
            </p>
          </Reveal>
        )}
      </section>

      {/* ── NEXT SYSTEM ─────────────────────────────────────── */}
      {next && (
        <section className="border-t border-hairline bg-bg-2/40">
          <div className="mx-auto max-w-[1400px] px-6 py-20 md:px-10 md:py-28">
            <Reveal>
              <SectionLabel>Next system</SectionLabel>
            </Reveal>
            <Reveal delay={80}>
              <Link
                href={`/systems/${next.slug}`}
                className="group mt-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end"
              >
                <div>
                  <div className="flex items-center gap-3">
                    <span className="label text-accent">{next.category}</span>
                    {next.year && <span className="label text-muted">/ {next.year}</span>}
                  </div>
                  <h2 className="mt-3 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em] transition-colors group-hover:text-accent">
                    {next.name}
                  </h2>
                </div>
                <span className="inline-flex items-center gap-2 text-text-2 transition-colors group-hover:text-accent">
                  View system
                  <ArrowUpRight className="size-5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                </span>
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(2.2rem,6vw,5rem)] font-extrabold leading-[0.98] tracking-[-0.03em]">
              Want something like this
              <br />
              <span className="text-accent">built for you?</span>
            </h2>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Book a Call
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/services" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Explore services
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
