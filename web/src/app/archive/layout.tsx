import type { Metadata } from "next";

export const metadata: Metadata = {
    // A plain-string title here would resolve this segment but leave the
  // detail pages below it with no template to inherit, so they would lose
  // the brand prefix. Carrying the template forward keeps both levels.
  title: {
    default: "Technical Archive",
    template: "Prince Caleb | %s",
  },
  description:
    "Practical guides on custom software, automation, and web & mobile development.",
};

export default function ArchiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
