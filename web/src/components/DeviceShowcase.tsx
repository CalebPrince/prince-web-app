import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A site shown the way a client recognises it: on a laptop, with the phone
 * version standing in front of it.
 *
 * The laptop screen carries a slim browser bar so the thing inside still
 * reads as a real page at a real address, and the phone beside it is what
 * says "and it works on a phone" without a paragraph claiming so.
 *
 * Both screens take arbitrary content: a project's screenshot as an <img>,
 * or, for the homepage concept, the actual markup of the page being shown.
 */
export function DeviceShowcase({
  laptop,
  phone,
  address,
  className,
}: {
  laptop: ReactNode;
  /** Omitted for a site with no mobile view to show. */
  phone?: ReactNode;
  /** Shown in the laptop's browser bar. Omit to drop the bar entirely. */
  address?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate w-full overflow-hidden rounded-[18px] border border-hairline",
        "bg-[radial-gradient(120%_120%_at_15%_0%,var(--bg-3)_0%,var(--bg-2)_45%,var(--bg)_100%)]",
        className,
      )}
    >
      {/* A single accent bloom behind the devices, so they sit in light
          rather than on a flat panel. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[10%] -top-[30%] -z-10 h-[80%] w-[70%] rounded-full bg-accent/10 blur-[60px]"
      />

      <div className="relative aspect-[16/10]">
        {/* ── Laptop ──────────────────────────────────────────── */}
        <div className={cn("absolute top-[8%]", phone ? "left-[4%] w-[76%]" : "left-1/2 w-[84%] -translate-x-1/2")}>
          <div className="overflow-hidden rounded-t-[8px] border border-hairline-strong border-b-0 bg-bg shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]">
            {address && (
              <div className="flex items-center gap-1.5 border-b border-hairline bg-bg-3/80 px-2 py-[3px]">
                <span className="flex shrink-0 gap-[3px]" aria-hidden="true">
                  <span className="size-[4px] rounded-full bg-[#ff5f57]" />
                  <span className="size-[4px] rounded-full bg-[#febc2e]" />
                  <span className="size-[4px] rounded-full bg-[#28c840]" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-1 rounded-[3px] bg-bg px-1.5 py-[1px]">
                  <Lock className="size-[6px] shrink-0 text-muted" aria-hidden="true" />
                  <span className="truncate font-mono text-[6px] leading-[10px] text-text-2">
                    {address}
                  </span>
                </span>
              </div>
            )}
            <div className="relative aspect-[16/10] overflow-hidden bg-bg-3">{laptop}</div>
          </div>

          {/* The base: a lip wider than the lid, with the trackpad notch. */}
          <div className="relative -mx-[7%] h-[10px] rounded-b-[6px] border-x border-b border-hairline-strong bg-gradient-to-b from-bg-3 to-bg-2">
            <span
              aria-hidden="true"
              className="absolute left-1/2 top-0 h-[3px] w-[14%] -translate-x-1/2 rounded-b-[3px] bg-hairline-strong"
            />
          </div>
        </div>

        {/* ── Phone, standing in front of the laptop ──────────── */}
        {phone && (
          <div className="absolute bottom-[6%] right-[5%] w-[21%]">
            <div className="relative overflow-hidden rounded-[14%/7%] border-[1.5px] border-hairline-strong bg-bg shadow-[0_14px_30px_-10px_rgba(0,0,0,0.6)]">
              <span
                aria-hidden="true"
                className="absolute left-1/2 top-[2px] z-10 h-[3px] w-[26%] -translate-x-1/2 rounded-full bg-bg-3"
              />
              <div className="relative aspect-[9/17] overflow-hidden bg-bg-3">{phone}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
