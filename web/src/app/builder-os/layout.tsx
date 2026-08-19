import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Builder OS",
  description:
    "One operating system connecting customer conversations, research, follow-up, documents, proposals, and private reporting into one working environment.",
};

export default function BuilderOsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
