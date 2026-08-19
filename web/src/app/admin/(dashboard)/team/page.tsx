import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import { ChiefBrief, ChiefDashboard } from "@/components/admin/ChiefReport";
import TeamClient, { TeamData } from "./TeamClient";

export const metadata: Metadata = {
  title: "Team — Admin",
};

const EMPTY_TEAM: TeamData = {
  owner: { name: "", role: "", tagline: "", capacity: {} },
  agents: [],
  arch_activity: [],
  capacity_summary: {},
};

const EMPTY_DASHBOARD: ChiefDashboard = {
  snapshot: { agents: [], waiting_on_you: [], command_center: {}, since: "" },
  briefs: [],
};

export default async function TeamPage() {
  const cookieHeader = (await cookies()).toString();

  const [team, latest, dashboard] = await Promise.all([
    ssrAdminGet<TeamData>("/api/v1/admin/team", cookieHeader, EMPTY_TEAM),
    ssrAdminGet<{ brief: ChiefBrief | null }>("/api/v1/admin/chief/brief", cookieHeader, {
      brief: null,
    }),
    ssrAdminGet<ChiefDashboard>(
      "/api/v1/admin/chief/dashboard?hours=24",
      cookieHeader,
      EMPTY_DASHBOARD
    ),
  ]);

  return <TeamClient team={team} initialBrief={latest.brief} initialDashboard={dashboard} />;
}
