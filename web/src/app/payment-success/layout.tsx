import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prince Caleb - Payment Successful",
  description: "Your payment was successful.",
  robots: "noindex, nofollow",
};

export default function PaymentSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
