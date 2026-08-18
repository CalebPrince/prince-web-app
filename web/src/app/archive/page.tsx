"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ARTICLES, TOPICS, type Topic } from "@/data/archive";

export default function Archive() {
  const [topic, setTopic] = useState<"All" | Topic>("All");
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const shown = ARTICLES.filter((a) => topic === "All" || a.topic === topic);

  const onSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) setSubscribed(true);
  };

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-14 md:px-10 md:pt-48 md:pb-16">
          <Reveal>
            <SectionLabel>Technical Archive</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              Case studies for
              <br />
              <span className="text-accent">engineered systems.</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Practical guides on custom software, automation, and web &amp; mobile development.
              Filter by topic, or browse everything.
            </p>
          </Reveal>

          {/* Filter */}
          <Reveal delay={240} className="mt-12 flex flex-wrap gap-2.5">
            {TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={cn(
                  "label rounded-full border px-4 py-2.5 transition-colors",
                  topic === t
                    ? "border-accent/60 bg-accent/10 text-accent"
                    : "border-hairline text-text-2 hover:border-hairline-strong hover:text-text",
                )}
              >
                {t}
              </button>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── ARTICLE LIST ────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="divide-y divide-hairline border-y border-hairline">
          {shown.map((a, i) => (
            <Reveal key={a.slug} delay={(i % 3) * 60}>
              <Link
                href={`/archive/${a.slug}`}
                className="group flex flex-col gap-4 py-9 transition-colors md:flex-row md:items-baseline md:gap-10"
              >
                <div className="flex shrink-0 items-center gap-3 md:w-44 md:flex-col md:items-start md:gap-2">
                  <span className="label text-muted">{a.date}</span>
                  <span className="label text-accent">{a.topic}</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-2xl font-semibold tracking-tight transition-colors group-hover:text-accent md:text-3xl">
                    {a.title}
                  </h3>
                  <p className="mt-2 max-w-2xl text-text-2">{a.excerpt}</p>
                  <span className="label mt-3 inline-block text-muted">{a.readingTime} read</span>
                </div>
                <ArrowUpRight className="hidden size-6 shrink-0 self-center text-muted transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-accent md:block" />
              </Link>
            </Reveal>
          ))}
        </div>

        {shown.length === 0 && (
          <p className="py-16 text-center text-text-2">No guides in this topic yet.</p>
        )}
      </section>

      {/* ── EMAIL SUBSCRIBE ─────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
            <Reveal className="lg:col-span-6">
              <SectionLabel index="07">Get new posts by email</SectionLabel>
              <h2 className="mt-6 text-[clamp(1.8rem,4.5vw,3.2rem)] font-bold tracking-[-0.03em]">
                One email per guide.
                <br />
                No spam, ever.
              </h2>
              <p className="mt-4 max-w-md text-text-2">
                One email whenever there&rsquo;s a new practical guide. Unsubscribe any time.
              </p>
            </Reveal>

            <Reveal delay={120} className="lg:col-span-6 lg:justify-self-end">
              {subscribed ? (
                <div className="flex items-center gap-4 rounded-[var(--radius)] border border-accent/40 bg-accent/10 p-8">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
                    <Check className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold text-text">You&rsquo;re on the list.</p>
                    <p className="mt-1 text-sm text-text-2">
                      Look out for the next guide in your inbox.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={onSubscribe} className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-label="Email address"
                    className="h-13 flex-1 rounded-full border border-hairline-strong bg-bg/60 px-5 text-text placeholder:text-muted focus:border-accent/60 focus:outline-none"
                  />
                  <Button type="submit" size="lg">
                    Subscribe
                  </Button>
                </form>
              )}
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}
