import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start with one useful workflow, prove it with real conversations, then expand. AI agent tiers plus custom websites, mobile apps, and ad creative.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
