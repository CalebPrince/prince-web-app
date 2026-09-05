import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

const POINTS = [
  "Custom layouts and responsive design",
  "Design approved before development starts",
  "Scope, cost and timeline agreed in writing",
];

/** The hero's right-hand panel: a small piece of website design, doing the
 *  arguing. It is a process illustration and nothing else — never captioned,
 *  framed or attributed as a client project or a result. */
export function WebsiteDesignPreview() {
  return (
    <div
      className="rise relative rounded-[24px] border border-hairline-strong bg-bg-2 p-6 shadow-2xl sm:p-8"
      style={{ animationDelay: "0.4s" }}
    >
      <div className="flex items-center justify-between gap-4 border-b border-hairline pb-5">
        <span className="label text-accent">Website design &amp; development</span>
        <span className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 rounded-full bg-text-3/40" />
          ))}
        </span>
      </div>

      <p className="mt-8 text-sm text-muted">From your first brief to your finished website</p>
      <h2 className="mt-3 max-w-sm text-[clamp(1.8rem,3vw,2.8rem)] font-bold leading-[1.08] tracking-tight">
        Designed for your business.
        <br />
        <span className="text-accent">Built for your customers.</span>
      </h2>

      {/* A layout, sketched: the panel has to look like the thing it sells. */}
      <div className="my-8 grid grid-cols-[1fr_0.7fr] gap-3" aria-hidden="true">
        <div className="rounded-xl border border-hairline bg-bg p-5">
          <div className="mb-5 h-2 w-12 rounded bg-accent/60" />
          <div className="h-3 w-4/5 rounded bg-text/70" />
          <div className="mt-2 h-3 w-3/5 rounded bg-text/70" />
          <div className="mt-5 h-1.5 w-full rounded bg-text-3/30" />
          <div className="mt-2 h-1.5 w-4/5 rounded bg-text-3/30" />
          <div className="mt-6 h-7 w-20 rounded-lg bg-accent" />
        </div>
        <div className="grid grid-rows-2 gap-3">
          <div className="rounded-xl border border-accent/25 bg-accent/10 p-5">
            <div className="h-full rounded-lg border border-accent/30" />
          </div>
          <div className="rounded-xl border border-hairline bg-bg p-4">
            <div className="h-2 w-2/3 rounded bg-text-3/40" />
            <div className="mt-3 h-2 w-full rounded bg-text-3/20" />
          </div>
        </div>
      </div>

      <ul className="space-y-3 text-sm text-text-2">
        {POINTS.map((text) => (
          <li key={text} className="flex gap-2">
            <Check className="size-4 shrink-0 text-accent" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>

      <Link
        href="/website-design"
        className="mt-8 flex items-center justify-between border-t border-hairline pt-5 font-semibold text-text transition-colors hover:text-accent"
      >
        Explore website design
        <ArrowUpRight className="size-5" />
      </Link>
    </div>
  );
}
