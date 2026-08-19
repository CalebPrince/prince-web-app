import type { Metadata } from "next";

export const metadata: Metadata = {
    // A plain-string title here would resolve this segment but leave the
  // detail pages below it with no template to inherit, so they would lose
  // the brand prefix. Carrying the template forward keeps both levels.
  title: {
    default: "Systems",
    template: "Prince Caleb | %s",
  },
  description:
    "Real systems, running in real businesses, with results worth measuring. Proof, not promises.",
};

export default function SystemsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
