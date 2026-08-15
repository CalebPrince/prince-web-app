import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { SageChat } from "./sage-chat";
import "./marketing-brain.css";

export const metadata: Metadata = {
  title: "Sage: Free AI Marketing Brain",
  description:
    "Bring Sage a real marketing problem, an offer, a channel, a funnel, a headline, and work it through the combined lens of Hormozi, Brunson, Ogilvy, Cialdini, and Godin. Free, no signup.",
  openGraph: {
    type: "website",
    title: "Sage: a marketing-frameworks sparring partner",
    description: "Free AI chat trained on the combined frameworks of Hormozi, Brunson, Ogilvy, Cialdini, and Godin, bring a real marketing problem.",
    url: "https://princecaleb.dev/marketing-brain.html",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
  twitter: { card: "summary_large_image" },
};

const FRAMEWORKS = [
  { name: "Hormozi", label: "Offer construction" },
  { name: "Brunson", label: "Funnels & value ladders" },
  { name: "Ogilvy", label: "Headlines & copy" },
  { name: "Cialdini", label: "Ethical influence" },
  { name: "Godin", label: "Positioning & permission" },
];

export default function MarketingBrainPage() {
  return (
    <main>
      <header className="px-4 pt-[clamp(5rem,8vw,8.5rem)] pb-14 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Free marketing brain</p>
          <h1 className="mb-6 text-[clamp(3rem,6vw,5.6rem)] leading-[0.96] font-extrabold tracking-[-0.05em] text-heading">
            Meet <span className="text-editorial-accent-strong">Sage</span>.
          </h1>
          <p className="max-w-[66ch] text-[clamp(1rem,1.4vw,1.18rem)] leading-[1.75] text-ink-soft">
            Bring a real marketing problem, an offer that isn&apos;t converting, a channel you can&apos;t decide
            between, a funnel that&apos;s stuck, a headline that isn&apos;t landing, and work it through the
            combined lens of five well-known frameworks. No signup, no email required.
          </p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {FRAMEWORKS.map((f) => (
              <span key={f.name} className="flex flex-col rounded-[10px] border border-line bg-card px-[0.9rem] py-[0.6rem]">
                <b className="text-[0.78rem] text-heading">{f.name}</b>
                <small className="mt-[0.1rem] text-[0.63rem] text-ink-soft">{f.label}</small>
              </span>
            ))}
          </div>
        </div>
      </header>

      <section className="py-20">
        <SageChat />
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-8 rounded-[22px] bg-[#0d1728] p-[clamp(2rem,5vw,4rem)] text-[#d8e5f8] md:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#73aaff]">// Beyond brainstorming</p>
              <h2 className="max-w-[20ch] text-[clamp(1.8rem,3.5vw,3rem)] tracking-[-0.04em] text-white">Want the follow-up automated too?</h2>
              <p className="mt-4 max-w-[60ch] leading-[1.7] text-[#aabbd3]">
                Sage will help you think through the message. If the actual bottleneck is that no one follows up,
                qualifies, or replies on time, that&apos;s a workflow Prince Caleb builds for real.
              </p>
            </div>
            <div className="grid min-w-[235px] gap-[0.65rem]">
              <Button variant="brand" size="pill" className="border-white bg-white text-center text-[#0d1728] hover:bg-transparent hover:text-white" nativeButton={false} render={<a href="/book.html" />}>
                Talk through your workflow
              </Button>
              <Button variant="brand-outline" size="pill" className="border-white/35 text-center text-white hover:border-white" nativeButton={false} render={<a href="/lisa-ai-assistant" />}>
                See Lisa in action
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
