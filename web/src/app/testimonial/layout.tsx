import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Leave a Review | Prince Caleb",
  description: "Leave a review for Prince Caleb.",
  robots: "noindex, nofollow",
};

export default function TestimonialLayout({ children }: { children: React.ReactNode }) {
  return children;
}
