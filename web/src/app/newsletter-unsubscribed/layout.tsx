import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Unsubscribed",
  robots: { index: false, follow: false },
};

export default function NewsletterUnsubscribedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
