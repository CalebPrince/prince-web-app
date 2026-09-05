import type { ReactNode } from "react";
import { Lock, RotateCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The browser window every screenshot on the site sits inside: the hero's
 * concept mockup and each card in the work gallery. One component, so a
 * project screenshot and a concept build are framed identically and the
 * page reads as one design.
 *
 * `address` is shown in the bar. Pass the site's real host for a real
 * project; a concept passes an invented one on the reserved .example TLD.
 */
export function BrowserFrame({
  address,
  children,
  size = "md",
  className,
  bodyClassName,
}: {
  address: string;
  children: ReactNode;
  /** "sm" for the smaller gallery cards, "md" for a feature or the hero. */
  size?: "sm" | "md";
  className?: string;
  bodyClassName?: string;
}) {
  const small = size === "sm";

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-[14px] border border-hairline-strong bg-bg-2",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-2.5 border-b border-hairline bg-bg-3/70",
          small ? "px-2.5 py-2" : "px-3.5 py-2.5",
        )}
      >
        <span className="flex shrink-0 gap-1.5" aria-hidden="true">
          <span className={cn("rounded-full bg-[#ff5f57]", small ? "size-2" : "size-2.5")} />
          <span className={cn("rounded-full bg-[#febc2e]", small ? "size-2" : "size-2.5")} />
          <span className={cn("rounded-full bg-[#28c840]", small ? "size-2" : "size-2.5")} />
        </span>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-hairline bg-bg px-2 py-1">
          <Lock className="size-3 shrink-0 text-muted" aria-hidden="true" />
          <span className={cn("truncate font-mono text-text-2", small ? "text-[9px]" : "text-[10px]")}>
            {address}
          </span>
        </div>

        <span className="hidden shrink-0 items-center gap-2 text-muted sm:flex" aria-hidden="true">
          <RotateCw className="size-3" />
          <Search className="size-3" />
        </span>
      </div>

      <div className={cn("relative min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}
