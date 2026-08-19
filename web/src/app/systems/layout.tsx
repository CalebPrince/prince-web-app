import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Systems - Prince Caleb",
  description:
    "Real systems, running in real businesses, with results worth measuring. Proof, not promises.",
};

export default function SystemsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
