import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Technical Archive",
  description:
    "Practical guides on custom software, automation, and web & mobile development.",
};

export default function ArchiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
