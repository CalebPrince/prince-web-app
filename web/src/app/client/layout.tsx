import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Portal | Prince Caleb",
  description: "Access your project status, milestones, files, and messages.",
  robots: "noindex, nofollow",
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return children;
}
