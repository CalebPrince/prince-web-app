import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Book a Call",
  description:
    "Bring one workflow that keeps repeating. A 20-minute call to map what an agent could handle and whether a pilot is worth building.",
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
