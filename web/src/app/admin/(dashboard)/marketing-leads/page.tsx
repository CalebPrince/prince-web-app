import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import MarketingLeadsClient, { MarketingLead, OutreachStats } from "./MarketingLeadsClient";

export const metadata: Metadata = {
  title: "Marketing Leads — Admin",
};

export default async function MarketingLeadsPage() {
  const cookieHeader = (await cookies()).toString();

  const [leads, stats] = await Promise.all([
    ssrAdminList<MarketingLead>("/api/v1/admin/marketing-leads", cookieHeader),
    // The scoreboard is supplementary — a failure must not blank the lead list.
    ssrAdminGet<OutreachStats | null>("/api/v1/admin/outreach/stats", cookieHeader, null),
  ]);

  return <MarketingLeadsClient initialLeads={leads} initialStats={stats} />;
}
