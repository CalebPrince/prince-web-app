import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Project Proposal",
  description: "Review and accept your project proposal.",
  robots: "noindex, nofollow",
};

export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
