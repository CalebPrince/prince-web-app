import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { PortfolioCta, PortfolioShowcase } from "@/components/PortfolioShowcase";


export default function SelectedWork() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      {/* Type only. The index covers websites, applications and AI tools
          alike, so it opens on the general claim and lets the gallery below
          do the showing — a device mockup here would have narrowed the page
          to website work, which /website-design already owns. */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-28 pb-16 md:px-10 md:pt-36 md:pb-20">
          <Reveal>
            <SectionLabel>Selected work</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="page-hero-title mt-8 max-w-4xl">
              Proof, not promises.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Websites, applications and AI tools built for real businesses, with results worth
              measuring.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="portfolio-work-section portfolio-work-index">
        <div className="mx-auto max-w-[1400px]"><PortfolioShowcase /></div>
      </section>
      <div className="portfolio-cta-wrap"><PortfolioCta /></div>
    </>
  );
}
