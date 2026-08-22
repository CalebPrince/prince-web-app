import type { CSSProperties } from "react";

/** Three bands of ordered-dither checks, densest first, breaking a panel's
 *  edge up into pixels instead of ending it on a line. The page transition
 *  draws its own copy inline (PageTransition.tsx) because it needs one per
 *  column; everything else in the site borrows this. */
export function DitherEdge({ side }: { side: "top" | "bottom" | "left" }) {
  return (
    <span className="dither-edge" data-side={side} aria-hidden="true">
      {[75, 50, 25].map((d, k) => (
        <span key={d} data-d={d} style={{ "--k": k } as CSSProperties} />
      ))}
    </span>
  );
}
