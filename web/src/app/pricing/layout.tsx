import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare Basic, Standard and Premium plans for UX/UI design, websites, web applications, mobile apps, AI agents, business automations and monthly website maintenance. Prices in GHS.",
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
