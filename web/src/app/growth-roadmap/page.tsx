import type { Metadata } from "next";
import { RoadmapForm } from "./roadmap-form";

export const metadata: Metadata = {
  title: "Free Growth Roadmap",
  description: "A launched website is day one, not the finish line. Get a free roadmap that maps your traffic, conversion, and tracking gaps.",
  openGraph: {
    type: "website",
    title: "Free Growth Roadmap, Prince Caleb",
    description: "A launched website is day one, not the finish line. Get a free roadmap that maps your traffic, conversion, and tracking gaps.",
    url: "https://princecaleb.dev/growth-roadmap.html",
    images: [{ url: "https://princecaleb.dev/uploads/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Growth Roadmap, Prince Caleb",
    description: "A launched website is day one, not the finish line. Get a free roadmap that maps your traffic, conversion, and tracking gaps.",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
};

const VALUES = [
  { title: "Traffic", body: "Is anyone actually running weekly campaigns to bring the right people to your site?" },
  { title: "Conversion", body: "Where do visitors land, get stuck, and leave without booking or buying?" },
  { title: "Tracking", body: "Do you actually know where the drop-off happens, or are you guessing?" },
];

export default function GrowthRoadmapPage() {
  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Free Growth Roadmap</p>
          <h1 className="mb-3 text-5xl font-bold leading-[1.1] md:text-6xl">
            Launch isn&apos;t the finish line. It&apos;s <span className="text-editorial-accent-strong">day one</span>.
          </h1>
          <p className="max-w-[62ch] text-lg leading-[1.65] text-ink-soft">
            Most business owners spend thousands on a beautiful new website, hit launch, and wait. Nobody comes. A
            website without marketing is just an expensive digital business card hidden in a desert — scaling
            online takes traffic and conversion working together, every single day.
          </p>
          <p className="mt-3 max-w-[62ch] text-lg leading-[1.65] text-ink-soft">
            I&apos;m Prince Caleb. I build websites, AI agents, and automations for businesses in Accra and beyond —
            and I don&apos;t disappear at handover. Tell me about your site below and I&apos;ll map your traffic,
            conversion, and tracking gaps, free, with clear scope before you commit to anything.
          </p>
        </div>
      </header>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 grid gap-8 md:grid-cols-2 md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// See a sample roadmap</p>
              <h2 className="text-3xl font-bold md:text-4xl">Here&apos;s exactly what you&apos;ll get back.</h2>
            </div>
            <p className="text-ink-soft">
              Not a generic PDF template. A short, specific breakdown of what&apos;s costing a real business
              traffic, conversions, and visibility — built the same way yours will be.
            </p>
          </div>

          {/* Ported from .workflow-mockup */}
          <div
            aria-label="Mockup of a sample Free Growth Roadmap report"
            className="grid min-h-[38rem] overflow-hidden rounded-3xl border border-line-strong bg-card shadow-lg max-md:grid-cols-1"
            style={{ gridTemplateColumns: "13rem minmax(0, 1fr)" }}
          >
            <aside className="flex flex-col border-r border-line bg-heading p-5 text-bg max-md:hidden">
              <div className="mb-10 flex items-center gap-[0.65rem]">
                <span className="grid size-8 place-items-center rounded-lg border border-bg/35">P</span>
                <strong className="text-bg">Growth Roadmap</strong>
              </div>
              <nav aria-label="Mock report navigation" className="grid gap-[0.35rem]">
                {[
                  { label: "Findings", n: 3, active: true },
                  { label: "Traffic" },
                  { label: "Conversion" },
                  { label: "Tracking" },
                ].map((item) => (
                  <span
                    key={item.label}
                    className={
                      item.active
                        ? "flex justify-between rounded-lg bg-bg/10 p-[0.7rem] text-[0.78rem] text-bg"
                        : "flex justify-between rounded-lg p-[0.7rem] text-[0.78rem] text-bg/58"
                    }
                  >
                    {item.label}
                    {item.n && <b className="grid min-w-5 place-items-center rounded-full bg-bg text-[0.65rem] text-heading">{item.n}</b>}
                  </span>
                ))}
              </nav>
              <div className="mt-auto flex items-center gap-[0.7rem] border-t border-bg/16 pt-4">
                <span className="inline-block size-[0.48rem] rounded-full bg-[#20a36a] shadow-[0_0_0_4px_rgba(32,163,106,0.13)]" />
                <div>
                  <strong className="block text-[0.68rem] text-bg">Sample report</strong>
                  <small className="mt-[0.15rem] block text-[0.68rem] text-bg opacity-55">Yours takes 48 hours</small>
                </div>
              </div>
            </aside>

            <div className="min-w-0">
              <header className="flex min-h-[5.5rem] items-center justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <span className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-editorial-muted">
                    SAMPLE ROADMAP / A LOCAL SERVICE BUSINESS
                  </span>
                  <h3 className="mt-1 text-[1.15rem] font-bold text-heading">3 gaps found, 1 quick win</h3>
                </div>
                <span className="rounded-full border border-[rgba(32,163,106,0.28)] bg-[rgba(32,163,106,0.08)] px-2 py-[0.35rem] font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#16835a]">
                  Free, no obligation
                </span>
              </header>
              <div className="grid max-md:grid-cols-1" style={{ gridTemplateColumns: "minmax(0, 1fr) 18rem" }}>
                <div className="border-r border-line p-[clamp(1.25rem,4vw,3rem)] max-md:border-r-0">
                  <div className="flex items-center gap-3 pb-6">
                    <span className="grid size-10 flex-none place-items-center rounded-full bg-heading font-mono text-[0.7rem] font-bold text-bg">
                      GR
                    </span>
                    <div>
                      <strong className="block text-heading">Growth Roadmap</strong>
                      <small className="mt-[0.15rem] block text-[0.75rem] text-editorial-muted">Findings summary · prepared for review</small>
                    </div>
                  </div>
                  <div className="mb-4 max-w-[75%] rounded-[4px_14px_14px_14px] border border-line bg-bg-soft p-4">
                    <span className="font-mono text-[0.66rem] font-semibold uppercase text-editorial-muted">Traffic</span>
                    <p className="mt-[0.45rem] text-[0.86rem] leading-[1.55] text-ink">
                      The ad is sending clicks to a page that takes 6.8s to load on mobile — most visitors bounce
                      before it finishes.
                    </p>
                  </div>
                  <div className="mb-4 ml-auto max-w-[75%] rounded-[14px_4px_14px_14px] bg-heading p-4">
                    <span className="font-mono text-[0.66rem] font-semibold uppercase text-bg opacity-58">Conversion</span>
                    <p className="mt-[0.45rem] text-[0.86rem] leading-[1.55] text-bg">
                      The homepage has three competing calls to action. Visitors aren&apos;t sure which one to click,
                      so many click none.
                    </p>
                  </div>
                  <div className="mb-4 max-w-[75%] rounded-[4px_14px_14px_14px] border border-line bg-bg-soft p-4">
                    <span className="font-mono text-[0.66rem] font-semibold uppercase text-editorial-muted">Tracking</span>
                    <p className="mt-[0.45rem] text-[0.86rem] leading-[1.55] text-ink">
                      No conversion pixel is firing on the booking form — every ad platform is optimizing blind.
                    </p>
                  </div>
                  <div className="mt-8 flex justify-between gap-4 border-t border-line pt-4 text-[0.7rem] text-editorial-muted">
                    <span>Overall growth score</span>
                    <span>42 / 100</span>
                  </div>
                </div>
                <aside className="bg-bg-soft p-6">
                  <span className="mb-4 block font-mono text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-editorial-muted">
                    Recommended next steps
                  </span>
                  {[
                    ["Fix the tracking pixel", "So every ad dollar reports what it actually did"],
                    ["Cut the homepage to one CTA", "One clear next step, not three"],
                    ["Compress the landing page", "Faster load, fewer bounced clicks"],
                  ].map(([title, sub]) => (
                    <div key={title} className="flex items-center gap-3 border-b border-line py-[0.9rem]">
                      <span className="font-bold text-[#16835a]">✓</span>
                      <div>
                        <strong className="block text-heading">{title}</strong>
                        <small className="mt-[0.15rem] block text-[0.7rem] text-editorial-muted">{sub}</small>
                      </div>
                    </div>
                  ))}
                  <div className="mt-8 flex justify-between gap-4 text-[0.7rem] text-editorial-muted">
                    <span>Est. recoverable conversions</span>
                    <strong className="text-heading">+18%</strong>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto grid max-w-4xl gap-6 px-4 sm:px-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-line bg-card p-10 max-md:p-6">
            <span className="mb-3 block text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// What you get</span>
            {VALUES.map((v) => (
              <div key={v.title} className="flex justify-between gap-4 border-t border-line py-[0.9rem]">
                <strong className="text-heading">{v.title}</strong>
                <span className="max-w-[60%] text-right text-[0.86rem] text-ink-soft">{v.body}</span>
              </div>
            ))}
            <p className="mt-4 text-sm text-ink-soft">
              No pitch, no pressure — just a clear picture of what&apos;s costing you revenue and what to fix first.
            </p>
          </div>

          <RoadmapForm />
        </div>
      </section>
    </main>
  );
}
