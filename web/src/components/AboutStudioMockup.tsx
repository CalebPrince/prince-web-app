import { cn } from "@/lib/utils";

// Abstract product mockup for the About hero — follows the same rule as
// SampleWireframeScene: no fabricated screenshots or stock photography, just
// shape and rhythm in the site's own tokens, so it themes with the rest of the
// page and stays crisp at any size instead of shipping a bitmap.

/** One row of the "recent work" list — a label bar plus a value bar. */
function Row({ width, accent = false }: { width: number; accent?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <i
        className={cn(
          "size-[6px] shrink-0 rounded-full",
          accent ? "bg-accent" : "bg-hairline-strong",
        )}
      />
      <i
        className="h-[6px] rounded-full bg-hairline-strong"
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

export function AboutStudioMockup() {
  // Deterministic so server and client render identically.
  const bars = [38, 62, 45, 80, 55, 96, 70];

  return (
    <div className="flex aspect-[4/3] w-full flex-col bg-bg-2">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-hairline px-4 py-3">
        <i className="size-[7px] rounded-full bg-hairline-strong" />
        <i className="size-[7px] rounded-full bg-hairline-strong" />
        <i className="size-[7px] rounded-full bg-accent" />
        <i className="ml-3 h-[6px] w-24 rounded-full bg-hairline-strong" />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar rail */}
        <div className="hidden w-[22%] shrink-0 flex-col gap-3 border-r border-hairline p-4 sm:flex">
          <i className="h-[6px] w-3/4 rounded-full bg-hairline-strong" />
          <i className="h-[6px] w-full rounded-full bg-accent/70" />
          <i className="h-[6px] w-2/3 rounded-full bg-hairline-strong" />
          <i className="h-[6px] w-5/6 rounded-full bg-hairline-strong" />
          <i className="h-[6px] w-1/2 rounded-full bg-hairline-strong" />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-5 p-4 md:p-5">
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-md border border-hairline p-2.5"
              >
                <i className="block h-[5px] w-2/3 rounded-full bg-hairline-strong" />
                <i
                  className={cn(
                    "mt-2 block h-[9px] rounded-full",
                    i === 1 ? "w-2/3 bg-accent" : "w-1/2 bg-hairline-strong",
                  )}
                />
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="flex min-h-0 flex-1 items-end gap-[6px] rounded-md border border-hairline p-3">
            {bars.map((h, i) => (
              <i
                key={i}
                className={cn(
                  "flex-1 rounded-t-[2px]",
                  i === bars.length - 2 ? "bg-accent" : "bg-hairline-strong",
                )}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-2.5">
            <Row width={70} />
            <Row width={52} accent />
            <Row width={84} />
          </div>
        </div>
      </div>
    </div>
  );
}
