import { Metadata } from "next";
import { cookies } from "next/headers";
import { adminApi, asList, ssrAdminGet } from "@/lib/api";
import MarketingLeadsClient, { MarketingLead, OutreachStats } from "./MarketingLeadsClient";

export const metadata: Metadata = {
  title: "Marketing Leads — Admin",
};

export default async function MarketingLeadsPage() {
  const cookieHeader = (await cookies()).toString();

  // Deliberately NOT ssrAdminList: its []-on-failure fallback makes a real
  // fetch failure indistinguishable from a genuinely empty lead list,
  // rendering "No accounts match this view" instead of telling you it
  // actually failed to load (same reasoning as content/page.tsx's settings load).
  const leadsPromise = adminApi
    .get<unknown>("/api/v1/admin/marketing-leads", cookieHeader)
    .then((res) => ({ leads: asList<MarketingLead>(res), loadError: null as string | null }))
    .catch((err) => ({
      leads: [] as MarketingLead[],
      loadError: err instanceof Error ? err.message : "Could not load leads.",
    }));

  const [{ leads, loadError }, stats] = await Promise.all([
    leadsPromise,
    // The scoreboard is supplementary — a failure must not blank the lead list.
    ssrAdminGet<OutreachStats | null>("/api/v1/admin/outreach/stats", cookieHeader, null),
  ]);

  return (
    <MarketingLeadsClient initialLeads={leads} initialStats={stats} loadError={loadError} />
  );
}
