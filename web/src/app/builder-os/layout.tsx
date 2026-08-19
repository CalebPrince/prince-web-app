import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Builder OS - Prince Caleb",
  description:
    "One operating system connecting customer conversations, research, follow-up, documents, proposals, and private reporting into one working environment.",
};

export default function BuilderOsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
