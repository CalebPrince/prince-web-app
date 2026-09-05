import Link from "next/link";
import { ArrowRight, CalendarDays, MessageSquare } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { HiOutlineMail } from "react-icons/hi";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Shown in place of the /request and /book forms when the quarter's project
// intake is closed. It switches the visitor onto the next-quarter path while
// keeping every non-project way of reaching out open — the contact form,
// WhatsApp, and email are all still monitored between intakes. A place is confirmed only after a written agreement and initial payment.

const EMAIL = "hello@princecaleb.dev";
const WHATSAPP_URL = "https://wa.me/233535801359";

const CONTACT_OPTIONS = [
  {
    label: "Send a message",
    value: "Ask anything or line up for the next intake",
    href: "/contact",
    icon: MessageSquare,
    external: false,
  },
  {
    label: "WhatsApp",
    value: "+233 53 580 1359",
    href: WHATSAPP_URL,
    icon: FaWhatsapp,
    external: true,
  },
  {
    label: "Email",
    value: EMAIL,
    href: `mailto:${EMAIL}`,
    icon: HiOutlineMail,
    external: false,
  },
];

export function IntakeClosedPanel({
  kind,
  quarter,
  nextOpening,
}: {
  kind: "project" | "booking";
  quarter: string;
  nextOpening: string;
}) {
  const paused =
    kind === "booking"
      ? "New discovery calls are paused"
      : "New project requests are paused";

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/10 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Quarterly project intake</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              {quarter} intake is <span className="text-accent">closed</span>.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              I accept a maximum of six projects each quarter so the committed work gets full
              attention. {paused} until the next intake opens.
            </p>
          </Reveal>
          <Reveal delay={220} className="mt-8 flex flex-wrap items-center gap-3 text-text-2">
            <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <span>
              Next intake opens <strong className="font-semibold text-text">{nextOpening}</strong>.
            </span>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32" id="next-intake">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 md:p-10 glass">
            <p className="label text-muted">In the meantime</p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Discuss your project for the next intake.
            </h2>
            <p className="mt-3 text-text-2">
              Questions, scoping, or planning ahead: the contact form, WhatsApp, and email
              are all still monitored between intakes. A place is confirmed only after a written agreement and initial payment.
            </p>

            <div className="mt-8 space-y-3">
              {CONTACT_OPTIONS.map(({ label, value, href, icon: Icon, external }) => (
                <Link
                  key={label}
                  href={href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  className="group flex items-center gap-5 rounded-[var(--radius)] border border-hairline bg-bg/50 p-5 transition-colors hover:border-accent/40"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius)] border border-hairline bg-bg text-accent transition-colors group-hover:border-accent/40">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="label text-muted">{label}</p>
                    <p className="mt-1 truncate text-lg font-semibold text-text transition-colors group-hover:text-accent">
                      {value}
                    </p>
                  </div>
                  <ArrowRight className="ml-auto size-4 shrink-0 text-muted transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true" />
                </Link>
              ))}
            </div>

            <div className="mt-8 border-t border-hairline pt-6">
              <Link
                href="/"
                className={cn(buttonVariants({ variant: "secondary" }), "group")}
              >
                Back to home
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}
