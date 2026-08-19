import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payment Successful | Prince Caleb",
  description: "Your payment was successful.",
  robots: "noindex, nofollow",
};

export default function PaymentSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
