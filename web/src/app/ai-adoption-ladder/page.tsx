import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "The 5 Levels of AI Adoption",
  description:
    "Most businesses stop at Level 1: one AI chat window, everything reviewed by hand. See the five levels of real AI adoption, and where Prince Caleb's own agent system actually sits.",
  openGraph: {
    type: "website",
    title: "The 5 Levels of AI Adoption",
    description:
      "From asking a chatbot questions to letting real events trigger agents automatically, five levels, and proof of where a real system sits on them.",
    images: ["https://princecaleb.dev/uploads/og-image.png"],
  },
  twitter: { card: "summary_large_image" },
};

const RUNGS = [
  {
    num: "00",
    title: "Asking",
    body: "You open a chat window, describe what you need, and copy the answer into an email, a doc, or your own code by hand. The AI never touches your files or your systems. Useful, but this is still 100% manual labor with a faster first draft.",
  },
  {
    num: "01",
    title: "Supervised",
    body: "One agent works directly inside a real project or system, but every action gets reviewed before or right after it happens. The bottleneck is trust, you're reading every keystroke, so nothing actually moves faster than you can watch it.",
  },
  {
    num: "02",
    title: "Coordinated",
    body: "A handful of agents each own a distinct task and check their own work before handing it back. You review finished outcomes, not individual steps. It works, but steering several conversations at once starts to take real attention.",
  },
  {
    num: "03",
    title: "Delegated",
    body: "Agents run on a schedule and can hand work to other agents without you starting each run yourself, a cron job kicks off discovery, drafting, or a follow-up sequence on its own. The limiting factor stops being what the AI can do and becomes how clearly you defined the workflow. A vague brief wastes the whole run.",
    tag: "Where most of Prince Caleb's own agents live today",
    current: true,
  },
  {
    num: "04",
    title: "Autonomous",
    body: 'A real-world event, a new inbound message, a missed reply, a lead going quiet, triggers the agent directly. Nobody clicks "run." Leadership\'s job shifts from watching execution to setting direction and stepping in for exceptions a rule can\'t resolve.',
    tag: "Where the automations engine and Nurturer's follow-ups already run",
    current: true,
  },
];

const PROOF = [
  {
    icon: "B",
    title: "Beacon",
    body: "Scouts social platforms for qualified leads on a recurring schedule and drafts a first reply, no one has to go looking each day.",
  },
  {
    icon: "N",
    title: "Nurturer",
    body: "Watches for a lead who's gone quiet and sends the next follow-up automatically, and stops the instant they reply. The event is the trigger, not a person clicking send.",
  },
  {
    icon: "C",
    title: "Chief",
    body: "Reads what every other agent did and writes a daily brief, the human reviews one summary, not a dozen separate logs.",
  },
  {
    icon: "@",
    title: "Automations engine",
    body: "A CRM event, a new signup, a payment, a milestone, fires a branded email on its own, no manual send required.",
  },
];

export default function AiAdoptionLadderPage() {
  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-20 md:px-10 md:pt-48 md:pb-24">
          <Reveal>
            <SectionLabel>Where does your business actually sit</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-[16ch] text-[clamp(2.6rem,7vw,6rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
              The <span className="text-accent">5 levels</span> of AI adoption.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-8 max-w-[68ch] text-lg leading-relaxed text-text-2 md:text-xl">
              Almost every business that says &ldquo;we use AI&rdquo; is stuck at Level 1: one chat window, one
              person reading every reply. Real adoption is a ladder, not a toggle. Here&apos;s what each rung
              actually looks like, and where Prince Caleb&apos;s own agent system sits on it today, with real
              evidence, not a slide.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── THE LADDER ──────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <div className="grid gap-4">
          {RUNGS.map((rung, i) => (
            <Reveal
              key={rung.num}
              delay={(i % 3) * 70}
              className={cn(
                "grid grid-cols-[auto_1fr] items-start gap-6 rounded-[var(--radius)] border p-6 transition-all duration-300 md:gap-8 md:p-9",
                rung.current
                  ? "border-accent/50 bg-accent/[0.04] hover:border-accent/70"
                  : "border-hairline bg-bg-2/40 hover:border-hairline-strong",
              )}
            >
              <div
                className={cn(
                  "font-mono text-[clamp(2.2rem,3.5vw,3.2rem)] leading-none font-extrabold tracking-[-0.03em]",
                  rung.current ? "text-accent" : "text-hairline-strong",
                )}
              >
                {rung.num}
              </div>
              <div>
                <h3 className="text-xl font-semibold tracking-tight text-text md:text-2xl">{rung.title}</h3>
                <p className="mt-2.5 max-w-[80ch] leading-relaxed text-text-2">{rung.body}</p>
                {rung.tag && (
                  <span className="label mt-4 inline-block rounded-full border border-accent/40 bg-accent/10 px-3.5 py-2 text-accent">
                    {rung.tag}
                  </span>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── PROOF ───────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/40">
        <div className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
          <Reveal className="grid gap-8 md:grid-cols-[1fr_minmax(18rem,0.55fr)] md:items-end">
            <div>
              <SectionLabel index="01">Not a slide, a running system</SectionLabel>
              <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
                What Level 3&ndash;4 actually looks like here.
              </h2>
            </div>
            <p className="text-text-2">
              Four real, shipped pieces of Prince Caleb&apos;s own operations, the same system that runs
              princecaleb.dev day to day.
            </p>
          </Reveal>

          <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF.map((p, i) => (
              <Reveal
                key={p.title}
                delay={(i % 4) * 70}
                className="group h-full rounded-[var(--radius)] border border-hairline bg-bg p-6 transition-colors hover:border-accent/40"
              >
                <span className="grid size-10 place-items-center rounded-[10px] border border-accent/40 bg-accent/10 font-mono text-sm font-bold text-accent">
                  {p.icon}
                </span>
                <h3 className="mt-6 text-lg font-semibold tracking-tight text-text">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-2">{p.body}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={120}>
            <p className="mx-auto mt-10 max-w-[90ch] text-center text-sm leading-relaxed text-muted">
              This describes Prince Caleb&apos;s real internal system as of today, not a promised outcome for
              every client. Most engagements start at Level 1&ndash;2 on one controlled workflow and grow from
              there, see the{" "}
              <Link
                href="/ai-safety"
                className="text-text-2 underline underline-offset-4 transition-colors hover:text-accent"
              >
                safety approach
              </Link>{" "}
              for how permissions and escalation are handled at each stage.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 py-28 text-center md:px-10 md:py-40">
          <Reveal>
            <SectionLabel>Find your rung</SectionLabel>
            <h2 className="mx-auto mt-8 max-w-3xl text-[clamp(2rem,5.5vw,4.5rem)] font-extrabold leading-[1] tracking-[-0.03em]">
              Where does your business
              <br />
              <span className="text-accent">actually sit right now?</span>
            </h2>
            <p className="mx-auto mt-8 max-w-xl text-lg text-text-2">
              Bring one real workflow, the one that eats the most time or gets missed the most, and we&apos;ll map
              the smallest useful step up the ladder, not a jump to Level 4 on day one.
            </p>
            <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/book" className={cn(buttonVariants({ size: "lg" }), "group")}>
                Talk through your system
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link href="/ai-safety" className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}>
                See the safety approach
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
