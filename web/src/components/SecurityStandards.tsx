import Link from "next/link";
import { ArrowRight, Check, KeyRound, ScanSearch, ShieldCheck, UserCheck } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import type { ManagedContent } from "@/components/ProjectStandards";

const CONTROLS = [
  {
    icon: ScanSearch,
    label: "Risk before features",
    title: "Security follows the real project risk.",
    body: "Before architecture is fixed, I identify the people, data, integrations and failure cases that matter. A brochure site and an operational AI system do not receive the same controls.",
  },
  {
    icon: KeyRound,
    label: "Minimum necessary access",
    title: "Every permission needs a reason.",
    body: "Accounts, APIs, staff roles and automated tools receive only the access required for the agreed workflow. Secrets stay out of source code and public interfaces.",
  },
  {
    icon: UserCheck,
    label: "Human authority",
    title: "Sensitive actions keep a person in control.",
    body: "Approval steps, escalation paths and prohibited actions are defined before launch. Automation does not quietly inherit authority it was never given.",
  },
  {
    icon: ShieldCheck,
    label: "Evidence before launch",
    title: "Controls are checked, not assumed.",
    body: "The handover covers access, failure behaviour, data handling, logging, recovery and known limitations. Open risks are documented instead of hidden behind a launch date.",
  },
];

const LEDGER = [
  ["Outcome", "Written and testable"],
  ["Data", "Necessary and accounted for"],
  ["Access", "Limited by role and task"],
  ["Failure", "Contained with a human path"],
  ["Launch", "Reviewed with evidence"],
];

export function SecurityStandards({ compact = false, content }: { compact?: boolean; content?: ManagedContent }) {
  const controls = CONTROLS.map((control, index) => {
    const number = index + 1;
    return {
      ...control,
      label: content?.[`security_control_${number}_label`] || control.label,
      title: content?.[`security_control_${number}_title`] || control.title,
      body: content?.[`security_control_${number}_body`] || control.body,
    };
  });
  const ledger = LEDGER.map(([label, value], index) => {
    const number = index + 1;
    return [
      content?.[`security_ledger_${number}_label`] || label,
      content?.[`security_ledger_${number}_value`] || value,
    ];
  });

  return (
    <section aria-labelledby="security-standards-title" className="relative overflow-hidden border-y border-hairline bg-bg">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_78%_28%,var(--accent-soft),transparent_34%)]" />
      <div className={`mx-auto max-w-[1400px] px-6 md:px-10 ${compact ? "py-20 md:py-28" : "py-24 md:py-36"}`}>
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,.75fr)] lg:items-start">
          <Reveal>
            <SectionLabel index={compact ? undefined : "03"}>{content?.security_eyebrow || "Secure by design"}</SectionLabel>
            <h2 id="security-standards-title" className="mt-6 max-w-[15ch] text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.04] tracking-[-0.03em]">
              {content?.security_title || "Security is a project decision, not a final checklist."}
            </h2>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2">
              {content?.security_intro || "I use a risk-proportional baseline from discovery through handover. Controls become stricter when a project handles sensitive data, money, privileged access, automation or business-critical operations."}
            </p>

            {!compact && (
              <div className="mt-12 grid gap-x-10 gap-y-9 sm:grid-cols-2">
                {controls.map(({ icon: Icon, label, title, body }, index) => (
                  <Reveal key={label} delay={(index % 2) * 80} className="border-t border-hairline pt-6">
                    <div className="flex items-center gap-2 text-accent">
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="label">{label}</span>
                    </div>
                    <h3 className="mt-4 text-xl font-semibold tracking-tight">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-text-2">{body}</p>
                  </Reveal>
                ))}
              </div>
            )}

            {compact && (
              <Link href="/working-together#security" className="label group mt-8 inline-flex items-center gap-2 text-accent">
                Read the project security standard
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </Reveal>

          <Reveal delay={120} className="lg:sticky lg:top-28">
            <div className="overflow-hidden rounded-[var(--radius)] border border-hairline-strong bg-bg-2 shadow-[var(--card-shadow-lift)]">
              <div className="flex items-center gap-2 border-b border-hairline bg-bg-3 px-4 py-3" aria-hidden="true">
                <span className="size-2 rounded-full bg-text-3/40" />
                <span className="size-2 rounded-full bg-text-3/40" />
                <span className="size-2 rounded-full bg-accent" />
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[.14em] text-text-3">Project review / secure baseline</span>
              </div>
              <div className="flex items-start justify-between gap-5 border-b border-hairline px-5 py-5">
                <div>
                  <span className="label text-text-3">Delivery gate</span>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight">Ready for controlled build</h3>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                  <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                  Required
                </span>
              </div>
              <div className="divide-y divide-hairline">
                {ledger.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[6rem_1fr_auto] items-center gap-4 px-5 py-4">
                    <span className="font-mono text-xs uppercase tracking-[.12em] text-text-3">{label}</span>
                    <span className="text-sm font-medium text-text-2">{value}</span>
                    <Check className="size-4 text-accent" aria-hidden="true" />
                  </div>
                ))}
              </div>
              <div className="border-t border-hairline p-5">
                <div className="mb-3 flex items-center justify-between text-xs text-text-3">
                  <span>Baseline decisions recorded</span>
                  <span className="font-mono text-accent">5 / 5</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-bg-3"><span className="block h-full w-full bg-accent" /></div>
                <p className="mt-4 text-xs leading-relaxed text-text-3">
                  {content?.security_disclaimer || "The exact controls are agreed for the project. This is a delivery standard, not a claim that every system has the same risk or compliance requirements."}
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
