import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "The 5 Levels of AI Adoption",
  description:
    "Most businesses stop at Level 1: one AI chat window, everything reviewed by hand. See the five levels of real AI adoption, and where Prince Caleb's own agent system (Beacon, Nurturer, Chief, and the automations engine) actually sits.",
  openGraph: {
    type: "website",
    title: "The 5 Levels of AI Adoption",
    description: "From asking a chatbot questions to letting real events trigger agents automatically, five levels, and proof of where a real system sits on them.",
    url: "https://princecaleb.dev/ai-adoption-ladder.html",
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
    body: "A real-world event, a new inbound message, a missed reply, a lead going quiet, triggers the agent directly. Nobody clicks \"run.\" Leadership's job shifts from watching execution to setting direction and stepping in for exceptions a rule can't resolve.",
    tag: "Where the automations engine and Nurturer's follow-ups already run",
    current: true,
  },
];

const PROOF = [
  { icon: "B", title: "Beacon", body: "Scouts social platforms for qualified leads on a recurring schedule and drafts a first reply, no one has to go looking each day." },
  { icon: "N", title: "Nurturer", body: "Watches for a lead who's gone quiet and sends the next follow-up automatically, and stops the instant they reply. The event is the trigger, not a person clicking send." },
  { icon: "C", title: "Chief", body: "Reads what every other agent did and writes a daily brief, the human reviews one summary, not a dozen separate logs." },
  { icon: "@", title: "Automations engine", body: "A CRM event, a new signup, a payment, a milestone, fires a branded email on its own, no manual send required." },
];

export default function AiAdoptionLadderPage() {
  return (
    <main>
      <header className="px-4 pt-[clamp(5rem,8vw,8.5rem)] pb-16 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="hero-animate hero-animate-1 mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Where does your business actually sit</p>
          <h1 className="hero-animate hero-animate-2 mb-6 max-w-[16ch] text-[clamp(3rem,6vw,5.6rem)] leading-[0.96] font-extrabold tracking-[-0.05em] text-heading">
            The <span className="text-editorial-accent-strong">5 levels</span> of AI adoption.
          </h1>
          <p className="hero-animate hero-animate-3 max-w-[68ch] text-[clamp(1rem,1.4vw,1.18rem)] leading-[1.75] text-ink-soft">
            Almost every business that says &ldquo;we use AI&rdquo; is stuck at Level 1: one chat window, one person
            reading every reply. Real adoption is a ladder, not a toggle. Here&apos;s what each rung actually looks
            like, and where Prince Caleb&apos;s own agent system sits on it today, with real evidence, not a slide.
          </p>
        </div>
      </header>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-3.5">
            {RUNGS.map((rung, i) => (
              <article
                key={rung.num}
                className={`reveal ${i === 1 ? "reveal-delay-1" : i === 2 ? "reveal-delay-2" : ""} grid grid-cols-[auto_1fr] items-start gap-6 rounded-2xl border p-[1.6rem_clamp(1.4rem,3vw,2.2rem)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg ${
                  rung.current ? "border-editorial-accent-strong bg-gradient-to-b from-bg-soft to-card" : "border-line bg-card"
                }`}
              >
                <div
                  className={`font-mono text-[clamp(2.2rem,3.5vw,3.2rem)] leading-none font-extrabold tracking-[-0.03em] ${
                    rung.current ? "text-editorial-accent-strong" : "text-line-strong"
                  }`}
                >
                  {rung.num}
                </div>
                <div>
                  <h3 className="mb-2 text-[1.3rem] tracking-[-0.02em]">{rung.title}</h3>
                  <p className="text-[0.9rem] leading-[1.7] text-ink-soft">{rung.body}</p>
                  {rung.tag && (
                    <span className="mt-[0.85rem] inline-block rounded-full bg-bg-soft px-[0.65rem] py-[0.3rem] text-[0.65rem] font-extrabold tracking-[0.02em] text-editorial-accent-strong">
                      {rung.tag}
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-bg-soft py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="reveal grid gap-8 md:grid-cols-[1fr_minmax(18rem,0.55fr)] md:items-end">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Not a slide, a running system</p>
              <h2 className="text-3xl font-bold md:text-4xl">What Level 3–4 actually looks like here.</h2>
            </div>
            <p className="text-ink-soft">
              Four real, shipped pieces of Prince Caleb&apos;s own operations, the same system that runs
              princecaleb.dev day to day.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROOF.map((p, i) => (
              <article
                key={p.title}
                className={`reveal ${i === 1 ? "reveal-delay-1" : i === 2 ? "reveal-delay-2" : ""} grid grid-cols-[40px_1fr] gap-4 rounded-[14px] border border-line bg-card p-5`}
              >
                <span className="grid size-10 place-items-center rounded-[10px] bg-[#182236] text-[0.78rem] font-black text-white">{p.icon}</span>
                <div>
                  <h3 className="mb-2 text-base font-bold text-heading">{p.title}</h3>
                  <p className="text-[0.78rem] leading-[1.6] text-ink-soft">{p.body}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="reveal mx-auto mt-6 max-w-[90ch] text-center text-[0.68rem] text-ink-soft">
            This describes Prince Caleb&apos;s real internal system as of today, not a promised outcome for every
            client. Most engagements start at Level 1–2 on one controlled workflow and grow from there, see the
            safety approach for how permissions and escalation are handled at each stage.
          </p>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="reveal grid items-center gap-8 rounded-[22px] bg-[#0d1728] p-[clamp(2rem,5vw,4rem)] text-[#d8e5f8] md:grid-cols-[1fr_auto]">
            <div>
              <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-[#73aaff]">// Find your rung</p>
              <h2 className="max-w-[20ch] text-[clamp(1.8rem,3.5vw,3rem)] tracking-[-0.04em] text-white">
                Where does your business actually sit right now?
              </h2>
              <p className="mt-4 max-w-[60ch] leading-[1.7] text-[#aabbd3]">
                Bring one real workflow, the one that eats the most time or gets missed the most, and we&apos;ll map
                the smallest useful step up the ladder, not a jump to Level 4 on day one.
              </p>
            </div>
            <div className="grid min-w-[235px] gap-[0.65rem]">
              <Button variant="brand" size="pill" className="border-white bg-white text-center text-[#0d1728] hover:bg-transparent hover:text-white" nativeButton={false} render={<a href="/book.html" />}>
                Talk through your system
              </Button>
              <Button variant="brand-outline" size="pill" className="border-white/35 text-center text-white hover:border-white" nativeButton={false} render={<a href="/ai-safety" />}>
                See the safety approach
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
