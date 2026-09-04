import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuarterlyAvailability({
  isOpen,
  slots,
  quarter,
  nextOpening,
}: {
  isOpen: boolean;
  slots: number;
  quarter: string;
  nextOpening: string;
}) {
  const availableSlots = Math.max(0, Math.floor(slots));

  return (
    <section aria-labelledby="quarterly-availability-title" className="border-b border-hairline bg-bg-2">
      <Reveal className="mx-auto grid max-w-[1400px] gap-8 px-6 py-12 md:grid-cols-[1fr_auto] md:items-center md:px-10">
        <div className="flex gap-4 sm:gap-6">
          <span
            className={cn(
              "mt-1.5 size-3 shrink-0 rounded-full",
              isOpen ? "bg-accent shadow-[0_0_0_6px_var(--accent-soft)]" : "bg-muted",
            )}
            aria-hidden="true"
          />
          <div>
            <p className="label text-muted">Quarterly project intake</p>
            <h2 id="quarterly-availability-title" className="mt-3 text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-[-0.03em]">
              {isOpen
                ? `${availableSlots} project slot${availableSlots === 1 ? "" : "s"} open for ${quarter}.`
                : `${quarter} project intake is closed.`}
            </h2>
            <p className="mt-4 flex items-center gap-2 text-text-2">
              <CalendarDays className="size-4 shrink-0 text-accent" aria-hidden="true" />
              Next quarter opens {nextOpening}.
            </p>
          </div>
        </div>

        <Link href="/request" className={cn(buttonVariants({ variant: isOpen ? "primary" : "secondary", size: "lg" }), "group")}>
          {isOpen ? "Request a project slot" : "Join the next intake"}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </Link>
      </Reveal>
    </section>
  );
}
