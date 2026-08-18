import { cn } from "@/lib/utils";

/**
 * PrinceCaleb.dev logo — a rounded-square monogram badge carrying a geometric
 * "P" cut with a signal notch, paired with the wordmark and the signature
 * green terminal dot.
 */
export function Logo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 select-none", className)}>
      <span className="relative grid size-8 place-items-center rounded-[9px] border border-accent/40 bg-accent/10">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
          <path
            d="M6 20V4h7.5a5 5 0 0 1 0 10H9"
            stroke="var(--accent)"
            strokeWidth="2.4"
            strokeLinecap="square"
          />
          <circle cx="18.5" cy="6" r="1.6" fill="var(--accent)" />
        </svg>
        <span className="pointer-events-none absolute inset-0 rounded-[9px] shadow-[0_0_12px_rgba(41,217,120,0.45)]" />
      </span>
      {!compact && (
        <span className="text-[0.95rem] font-bold tracking-[-0.02em] text-text">
          Prince Caleb
          <span className="text-accent">.</span>
          <span className="font-mono text-[0.7rem] font-medium tracking-normal text-muted">
            dev
          </span>
        </span>
      )}
    </span>
  );
}
