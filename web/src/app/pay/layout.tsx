import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Complete Payment | Prince Caleb",
  description: "Complete your payment securely.",
  robots: "noindex, nofollow",
};

export default function PayLayout({ children }: { children: React.ReactNode }) {
  return children;
}
