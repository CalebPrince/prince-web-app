import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import ChiefClient, { ChiefBrief, ChiefDashboard } from "./ChiefClient";

export const metadata: Metadata = {
  title: "Chief — Admin",
};

const EMPTY_DASHBOARD: ChiefDashboard = {
  snapshot: { agents: [], waiting_on_you: [], command_center: {}, since: "" },
  briefs: [],
};

export default async function ChiefPage() {
  const cookieHeader = (await cookies()).toString();

  const [latest, dashboard] = await Promise.all([
    ssrAdminGet<{ brief: ChiefBrief | null }>("/api/v1/admin/chief/brief", cookieHeader, {
      brief: null,
    }),
    ssrAdminGet<ChiefDashboard>(
      "/api/v1/admin/chief/dashboard?hours=24",
      cookieHeader,
      EMPTY_DASHBOARD
    ),
  ]);

  return <ChiefClient initialBrief={latest.brief} initialDashboard={dashboard} />;
}
