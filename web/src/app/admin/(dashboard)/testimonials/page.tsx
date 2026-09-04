import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import TestimonialsClient from "./TestimonialsClient";

export const metadata: Metadata = {
  title: "Testimonials — Admin",
};

export default async function TestimonialsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // Fetch initial testimonials SSR
  const [initialTestimonials, googleReviewData] = await Promise.all([
    api.adminTestimonials(cookieHeader).catch(() => []),
    api.adminGoogleReviews(cookieHeader).catch(() => ({ configured: false, reviews: [] })),
  ]);

  return (
    <div className="space-y-8">
      <TestimonialsClient
        initialTestimonials={initialTestimonials}
        initialGoogleReviews={googleReviewData.reviews}
        googleConfigured={googleReviewData.configured}
      />
    </div>
  );
}
