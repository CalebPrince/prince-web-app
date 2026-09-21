import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import WendyClient, { WendyObservation, WendyToolReview } from "./WendyClient";

export const metadata: Metadata = {
  title: "Wendy, Admin",
};

export default async function WendyPage() {
  const cookieHeader = (await cookies()).toString();
  const observations = await ssrAdminGet<{ observations: WendyObservation[] }>(
    "/api/v1/admin/wendy/observations",
    cookieHeader,
    { observations: [] }
  );
  const reviews = await ssrAdminGet<{ evaluations: WendyToolReview[] }>(
    "/api/v1/admin/allie-evaluations",
    cookieHeader,
    { evaluations: [] }
  );

  return (
    <WendyClient
      initialObservations={observations.observations ?? []}
      initialReviews={reviews.evaluations ?? []}
    />
  );
}
