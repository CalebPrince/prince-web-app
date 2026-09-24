import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import PricingReviewClient, { PricingReview } from "./PricingReviewClient";

export const metadata: Metadata = {
  title: "Pricing Check — Admin",
};

export default async function PricingReviewPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ reviews: PricingReview[] }>(
    "/api/v1/admin/pricing-review",
    cookieHeader,
    { reviews: [] }
  );

  return <PricingReviewClient initialReviews={data.reviews ?? []} />;
}
