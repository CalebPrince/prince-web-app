import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Free Growth Roadmap",
  description:
    "A launched website is day one, not the finish line. Get a free roadmap that maps your traffic, conversion, and tracking gaps.",
};

export default function GrowthRoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
