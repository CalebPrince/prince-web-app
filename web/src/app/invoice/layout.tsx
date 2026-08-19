import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Invoice",
  description: "View your invoice.",
  robots: "noindex, nofollow",
};

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
