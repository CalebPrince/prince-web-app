import type { ReactNode } from "react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";

/** Shared shell for the legal pages - hero + a narrow prose column. */
export function LegalPage({
  title,
  lede,
  updated,
  children,
}: {
  title: string;
  lede: ReactNode;
  updated: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-hairline">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-20 md:px-10 md:pt-36 md:pb-24">
          <Reveal>
            <SectionLabel>Legal</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.4rem,6.5vw,5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              {title}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-[60ch] text-lg leading-relaxed text-text-2 md:text-xl">{lede}</p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[820px] px-6 py-20 md:py-28">
        <div className="space-y-12">{children}</div>
        <p className="label mt-16 border-t border-hairline pt-8 text-muted">Last updated: {updated}</p>
      </section>
    </>
  );
}

/** One titled block of legal prose. */
export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Reveal>
      <h2 className="text-2xl font-bold tracking-[-0.02em] text-text md:text-3xl">{heading}</h2>
      <div className="mt-4 space-y-4 text-lg leading-relaxed text-text-2 [&_strong]:font-semibold [&_strong]:text-text">
        {children}
      </div>
    </Reveal>
  );
}

/** Inline link styling shared across the legal prose. */
export const legalLink =
  "text-accent underline underline-offset-4 transition-colors hover:text-accent-strong";
