import type { Metadata } from "next";
import { TestimonialsRegistry } from "@/components/TestimonialsRegistry";

export const metadata: Metadata = {
  title: "Prince Caleb - Client Reviews",
  description:
    "What past clients say about working with Prince Caleb on web and mobile projects.",
};

export default function TestimonialsPage() {
  return <TestimonialsRegistry />;
}
