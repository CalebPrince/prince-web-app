import type { Metadata } from "next";
import { TestimonialsRegistry } from "@/components/testimonials-registry";

export const metadata: Metadata = {
  title: "Client Reviews",
  description: "What past clients say about working with Prince Caleb on web and mobile projects.",
};

export default function TestimonialsPage() {
  return <TestimonialsRegistry />;
}
