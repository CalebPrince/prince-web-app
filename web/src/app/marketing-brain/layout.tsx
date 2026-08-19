import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Sage: Free AI Marketing Brain",
  description:
    "Bring Sage a real marketing problem, an offer, a channel, a funnel, a headline, and work it through the combined lens of Hormozi, Brunson, Ogilvy, Cialdini, and Godin. Free, no signup.",
};

export default function MarketingBrainLayout({ children }: { children: React.ReactNode }) {
  return children;
}
