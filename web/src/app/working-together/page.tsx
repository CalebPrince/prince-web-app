import type { Metadata } from "next";
import { api } from "@/lib/api";
import { resolveQuarterlyIntake } from "@/lib/quarterly";
import { QuarterlyAvailability } from "@/components/QuarterlyAvailability";
import { ProjectStandards, resolveProjectSteps } from "@/components/ProjectStandards";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { IntakeCta } from "@/components/IntakeCta";
import { SecurityStandards } from "@/components/SecurityStandards";

export const metadata: Metadata = {
  title: "Working Together",
  description:
    "How Prince Caleb scopes and delivers secure projects: risk-led discovery, a written agreement, controlled milestones, verification and clear handover.",
};

// Reads the live intake numbers, so this page can never promise availability
// the /request form is about to refuse.
export const dynamic = "force-dynamic";

/** What the written agreement has to settle before anyone starts. Kept as
 *  headings rather than terms: the terms themselves are project-specific and
 *  live in the proposal each client receives. */
const AGREEMENT_COVERS = [
  "Objectives, pages, features and deliverables",
  "What is included, and what is explicitly excluded",
  "Data, access, integrations and security responsibilities",
  "Total cost, currency and payment milestones",
  "Timeline, review stages and the materials you supply",
  "Included revisions, and how extra work is quoted",
  "Verification, handover, ownership and ongoing support",
  "Pause, cancellation and other project-specific terms",
];

function HighlightTitle({ value }: { value: string }) {
  const match = value.match(/\*\*([^*]+)\*\*/);
  if (!match) return value;
  const start = match.index ?? 0;
  return <>{value.slice(0, start)}<span className="text-accent">{match[1]}</span>{value.slice(start + match[0].length)}</>;
}

export default async function WorkingTogether() {
  const content = await api.content().catch(() => null);
  const intake = resolveQuarterlyIntake(content);
  const projectSteps = resolveProjectSteps(content);

  return (
    <>
      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 pb-20 pt-28 md:px-10 md:pt-36">
        <Reveal>
          <SectionLabel>Working with Prince Caleb</SectionLabel>
        </Reveal>
        <Reveal delay={80}>
          <h1 className="page-hero-title mt-8 max-w-4xl">
            <HighlightTitle value={content?.working_together_title || "A good project starts with **clarity and control.**"} />
          </h1>
        </Reveal>
        <Reveal delay={160}>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
            {content?.working_together_intro || "Before design or development starts, we agree the outcome, scope, risks, responsibilities, cost and way of working. Security is shaped around the real system from the beginning, not added after the important decisions have already been made."}
          </p>
        </Reveal>
      </section>

      <QuarterlyAvailability {...intake} />

      {/* ── 01 · THE FOUR STAGES ────────────────────────────── */}
      <section className="mx-auto max-w-[1400px] px-6 py-24 md:px-10 md:py-32">
        <Reveal className="max-w-2xl">
          <SectionLabel index="01">How a project runs</SectionLabel>
          <h2 className="mt-6 text-[clamp(2rem,5vw,4rem)] font-bold tracking-[-0.03em]">
            Four stages, in this order.
          </h2>
        </Reveal>

        <div className="mt-16 grid gap-10 md:grid-cols-2">
          {projectSteps.map((step, i) => (
            <Reveal key={step.no} delay={(i % 2) * 90} className="border-t border-hairline pt-8">
              <span className="label text-accent">{step.no}</span>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-4 max-w-lg leading-relaxed text-text-2">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── 02 · THE AGREEMENT ──────────────────────────────── */}
      <section className="border-y border-hairline bg-bg-2/50">
        <div className="mx-auto grid max-w-[1400px] gap-12 px-6 py-24 md:grid-cols-2 md:px-10 md:py-32">
          <Reveal>
            <SectionLabel index="02">Before you commit</SectionLabel>
            <h2 className="mt-6 text-[clamp(1.8rem,4vw,3.2rem)] font-bold leading-[1.05] tracking-[-0.03em]">
              Your written project agreement.
            </h2>
            <p className="mt-6 max-w-lg leading-relaxed text-text-2">
              I prepare a proposal and agreement for your project and send you a private link. You
              can read it, print or save a copy, and record your acceptance on the page itself. The
              start conditions it sets out, including the initial payment, are met before work
              begins.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <ul className="divide-y divide-hairline border-t border-hairline">
              {AGREEMENT_COVERS.map((item) => (
                <li key={item} className="py-4 text-text-2">
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <ProjectStandards compact content={content} />

      <div id="security" className="scroll-mt-24">
        <SecurityStandards content={content} />
      </div>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center md:py-32">
        <Reveal>
          <h2 className="text-[clamp(1.8rem,4vw,3rem)] font-bold tracking-[-0.03em]">
            Start with the brief.
          </h2>
          <p className="mx-auto my-6 max-w-xl text-text-2">
            Tell me about the website, application or workflow you need. An enquiry is a
            conversation: it is not an agreement, and it does not reserve a project slot.
          </p>
          <IntakeCta kind="project">Discuss your project</IntakeCta>
        </Reveal>
      </section>
    </>
  );
}
