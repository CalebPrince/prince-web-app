import { Accessibility, ClipboardCheck, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ManagedContent } from "@/components/ProjectStandards";

const STANDARDS = [
  {
    icon: ShieldCheck,
    title: "Secure by design",
    detail: "Security decisions begin during discovery.",
  },
  {
    icon: LockKeyhole,
    title: "Privacy-conscious delivery",
    detail: "Data and access are kept to what the work requires.",
  },
  {
    icon: Accessibility,
    title: "Accessibility considered",
    detail: "Core journeys are designed for broader access.",
  },
  {
    icon: ClipboardCheck,
    title: "Tested before launch",
    detail: "Critical behaviour is checked before handover.",
  },
];

export function TrustStandards({ content }: { content?: ManagedContent }) {
  const standards = STANDARDS.map((standard, index) => ({
    ...standard,
    title: content?.[`trust_badge_${index + 1}_title`] || standard.title,
    detail: content?.[`trust_badge_${index + 1}_detail`] || standard.detail,
  }));

  return (
    <section aria-labelledby="trust-standards-title" className="border-b border-hairline bg-bg-2/80">
      <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10 md:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
          <div className="lg:w-52 lg:shrink-0">
            <h2 id="trust-standards-title" className="label text-text">
              {content?.trust_badges_title || "How every project is handled"}
            </h2>
          </div>

          <ul className="grid flex-1 gap-px overflow-hidden rounded-[var(--radius)] border border-hairline bg-hairline sm:grid-cols-2 xl:grid-cols-4">
            {standards.map(({ icon: Icon, title, detail }) => (
              <li key={title} className="group bg-bg px-5 py-4 transition-colors hover:bg-bg-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-accent">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <strong className="text-sm font-semibold tracking-tight text-text">{title}</strong>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-text-3">{detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
