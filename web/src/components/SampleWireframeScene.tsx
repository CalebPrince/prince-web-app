import type { SampleWireframe } from "@/lib/sample-projects-data";
import { cn } from "@/lib/utils";

// Abstract wireframe illustrations for the "What I build" samples - no
// fabricated screenshots, just shape and rhythm in the site's own palette.
export function SampleWireframeScene({ type }: { type: SampleWireframe }) {
  if (type === "voice") {
    return (
      <div className="flex w-full max-w-[220px] items-center gap-2.5">
        <span className="size-[30px] shrink-0 rounded-full border-[1.5px] border-accent bg-accent/10" />
        <span className="flex h-[22px] shrink-0 items-end gap-[2px]">
          {[40, 80, 55, 100, 30].map((h, i) => (
            <i
              key={i}
              className={cn(
                "w-[3px] rounded-[2px]",
                i === 1 || i === 3 ? "bg-accent" : "bg-hairline-strong",
              )}
              style={{ height: `${h}%` }}
            />
          ))}
        </span>
      </div>
    );
  }

  if (type === "agent") {
    return (
      <div className="flex w-full max-w-[220px] flex-col gap-2">
        {[
          { active: false, wide: false, short: false },
          { active: true, wide: true, short: false },
          { active: false, wide: false, short: true },
        ].map((row, i) => (
          <span key={i} className="flex items-center gap-2">
            <i
              className={cn("size-[7px] shrink-0 rounded-full", row.active ? "bg-accent" : "bg-hairline-strong")}
            />
            <span
              className={cn(
                "h-[6px] flex-1 rounded-[3px]",
                row.wide ? "bg-accent" : "bg-hairline-strong",
                row.short && "max-w-[55%]",
              )}
            />
          </span>
        ))}
      </div>
    );
  }

  if (type === "flow") {
    return (
      <div className="flex w-full max-w-[220px] items-center justify-center gap-1.5">
        <span className="size-5 shrink-0 rounded-[5px] border-[1.5px] border-hairline-strong bg-bg-2" />
        <span className="h-[1.5px] w-5 shrink-0 bg-hairline-strong" />
        <span className="size-5 shrink-0 rounded-[5px] border-[1.5px] border-hairline-strong bg-bg-2" />
        <span className="h-[1.5px] w-5 shrink-0 bg-hairline-strong" />
        <span className="size-5 shrink-0 rounded-[5px] border-[1.5px] border-accent bg-bg-2" />
      </div>
    );
  }

  if (type === "chat") {
    return (
      <div className="flex w-full max-w-[220px] flex-col gap-1.5">
        <span className="h-3 max-w-[65%] self-start rounded-lg bg-hairline-strong" />
        <span className="h-3 max-w-[45%] self-end rounded-lg bg-accent" />
        <span className="h-3 max-w-[80%] self-start rounded-lg bg-hairline-strong" />
      </div>
    );
  }

  // app
  return (
    <div className="grid w-full max-w-[220px] grid-cols-3 gap-[5px]" style={{ gridAutoRows: "18px" }}>
      <span className="h-[60%] self-end rounded-[3px] bg-hairline-strong" />
      <span className="h-full self-end rounded-[3px] bg-accent" />
      <span className="h-[60%] self-end rounded-[3px] bg-hairline-strong" />
      <span className="h-full rounded-[3px] border border-hairline bg-bg-2" />
      <span className="h-full rounded-[3px] border border-hairline bg-bg-2" />
      <span className="h-full rounded-[3px] border border-hairline bg-bg-2" />
    </div>
  );
}
