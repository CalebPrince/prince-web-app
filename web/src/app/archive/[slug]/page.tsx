import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ARTICLES, getArticle } from "@/data/archive";

export function generateStaticParams() {
  return ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/archive/[slug]">) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: `${article.title} — Prince Caleb`,
    description: article.excerpt,
  };
}

export default async function ArticleDetail({ params }: PageProps<"/archive/[slug]">) {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) notFound();

  const index = ARTICLES.findIndex((a) => a.slug === article.slug);
  const next = ARTICLES[(index + 1) % ARTICLES.length];

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/3 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-3xl px-6 pt-36 pb-12 md:pt-48 md:pb-16">
          <Reveal>
            <Link
              href="/archive"
              className="label inline-flex items-center gap-2 text-text-2 transition-colors hover:text-accent"
            >
              <ArrowLeft className="size-3.5" /> Technical Archive
            </Link>
          </Reveal>
          <Reveal delay={80} className="mt-8 flex items-center gap-3">
            <span className="label text-accent">{article.topic}</span>
            <span className="label text-muted">/ {article.date}</span>
            <span className="label text-muted">/ {article.readingTime} read</span>
          </Reveal>
          <Reveal delay={140}>
            <h1 className="mt-5 text-[clamp(2.2rem,5.5vw,4rem)] font-extrabold leading-[1.02] tracking-[-0.03em]">
              {article.title}
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 text-xl leading-relaxed text-text-2">{article.excerpt}</p>
          </Reveal>
        </div>
      </section>

      {/* ── BODY ────────────────────────────────────────────── */}
      <article className="mx-auto max-w-3xl px-6 pb-8">
        {/* Takeaways */}
        <Reveal className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8">
          <p className="label text-accent">{"// Key takeaways"}</p>
          <ul className="mt-5 space-y-3">
            {article.takeaways.map((t) => (
              <li key={t} className="flex gap-3 text-text-2">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Sections */}
        <div className="mt-14 space-y-12">
          {article.body.map((section) => (
            <Reveal key={section.heading}>
              <h2 className="text-2xl font-bold tracking-[-0.02em] md:text-3xl">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4">
                {section.paras.map((p, i) => (
                  <p key={i} className="text-lg leading-relaxed text-text-2">
                    {p}
                  </p>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </article>

      {/* ── NEXT GUIDE ──────────────────────────────────────── */}
      <section className="mt-16 border-t border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
          <Reveal>
            <SectionLabel>Next guide</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <Link
              href={`/archive/${next.slug}`}
              className="group mt-6 flex items-end justify-between gap-6"
            >
              <div>
                <span className="label text-accent">{next.topic}</span>
                <h3 className="mt-2 text-2xl font-bold tracking-[-0.02em] transition-colors group-hover:text-accent md:text-3xl">
                  {next.title}
                </h3>
              </div>
              <ArrowUpRight className="size-6 shrink-0 text-muted transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-accent" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-24 text-center md:px-10 md:py-36">
          <Reveal>
            <h2 className="mx-auto max-w-3xl text-[clamp(2rem,5.5vw,4.5rem)] font-extrabold leading-[1] tracking-[-0.03em]">
              Have a system worth
              <br />
              <span className="text-accent">writing about?</span>
            </h2>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Book a Call
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/archive" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                Browse the archive
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
