import Link from "next/link";
import { ArrowRight, FileCheck2, MessagesSquare, CalendarCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal";

/** The four stages every project runs through, stated the same way wherever
 *  they appear — the homepage process strip, /services, /working-together —
 *  so a client is never told two different versions of how work starts. */
export const PROJECT_STEPS = [
  {
    no: "01",
    title: "Define the project",
    body: "We discuss your goals, audience, requirements and budget before I recommend a direction.",
  },
  {
    no: "02",
    title: "Agree in writing",
    body: "You review the deliverables, exclusions, revisions, timeline and payment schedule. Work starts after you accept the agreement and the initial payment clears.",
  },
  {
    no: "03",
    title: "Design and develop",
    body: "You review the design before development, with progress and feedback at the agreed milestones.",
  },
  {
    no: "04",
    title: "Review and hand over",
    body: "We check the agreed requirements together, complete the payment milestones, and arrange launch, access and support.",
  },
];

const ASSURANCES = [
  {
    icon: FileCheck2,
    title: "Know what you are agreeing to",
    body: "Deliverables, costs, revisions and responsibilities are documented before work begins.",
  },
  {
    icon: MessagesSquare,
    title: "Approve changes before they happen",
    body: "Extra requests are scoped and priced separately, and only proceed once you approve them.",
  },
  {
    icon: CalendarCheck,
    title: "A confirmed start, not an assumption",
    body: "An enquiry or a discovery call does not reserve a slot. Work begins after acceptance and the initial payment.",
  },
];

export function ProjectStandards({ compact = false }: { compact?: boolean }) {
  return (
    <section aria-label="Before your project starts" className="border-y border-hairline bg-bg-2/50">
      <div
        className={`mx-auto max-w-[1400px] px-6 md:px-10 ${compact ? "py-16 md:py-20" : "py-24 md:py-32"}`}
      >
        <Reveal className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <div>
            <p className="label text-accent">A clear way of working</p>
            <h2
              className={`mt-5 font-bold tracking-[-0.03em] ${
                compact ? "text-[clamp(1.6rem,3vw,2.4rem)]" : "text-[clamp(2rem,4vw,3.5rem)] leading-[1.08]"
              }`}
            >
              Clear scope. Written agreement. Then we build.
            </h2>
            <p className="mt-5 max-w-xl leading-relaxed text-text-2">
              You work directly with me, from the first conversation through to handover. I take on a
              maximum of six projects a quarter, so each one gets the attention it needs.
            </p>
            <Link
              href="/working-together"
              className="label group mt-8 inline-flex items-center gap-2 text-accent"
            >
              How projects start
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid content-center gap-6">
            {ASSURANCES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <Icon className="mt-1 size-5 shrink-0 text-accent" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold tracking-tight">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-text-2">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
