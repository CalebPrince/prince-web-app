"use client";

// Shared call-to-action for the two project entry points (/request and /book).
// While the quarter's intake is open it renders exactly like the hand-written
// button it replaced. Once intake is closed it switches to the next-quarter
// path: a quieter (secondary) button labelled "Join the next intake", still
// pointing at the same page — which now shows the closed panel with the next
// opening date and the preserved non-project contact options.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useQuarterlyIntake } from "@/components/QuarterlyIntakeProvider";

type Props = {
  /** "project" -> /request, "booking" -> /book. */
  kind: "project" | "booking";
  children: React.ReactNode;
  /** Override the open-state destination (e.g. to carry UTM params). */
  openHref?: string;
  size?: "default" | "sm" | "lg";
  /** Button style while intake is open. Closed always renders as secondary. */
  openVariant?: "primary" | "secondary";
  closedLabel?: string;
  /** Trailing arrow icon; matches the site's other pill CTAs. */
  arrow?: boolean;
  className?: string;
};

export function IntakeCta({
  kind,
  children,
  openHref,
  size = "lg",
  openVariant = "primary",
  closedLabel = "Ask about the next intake",
  arrow = true,
  className,
}: Props) {
  const intake = useQuarterlyIntake();
  const closed = intake ? !intake.isOpen : false;
  const href = openHref ?? (kind === "project" ? "/request" : "/book");

  return (
    <Link
      href={href}
      data-intake={closed ? "closed" : "open"}
      className={cn(
        buttonVariants({ variant: closed ? "secondary" : openVariant, size }),
        "group",
        className,
      )}
    >
      {closed ? closedLabel : children}
      {arrow && (
        <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
      )}
    </Link>
  );
}
