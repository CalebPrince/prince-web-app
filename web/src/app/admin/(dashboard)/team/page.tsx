import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import { ChiefBrief, ChiefDashboard } from "@/components/admin/ChiefReport";
import TeamClient, { JevStatus, TeamData } from "./TeamClient";

export const metadata: Metadata = {
  title: "Team, Admin",
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

type Mode = "shadow" | "live" | "off";

type AgentDecisionsRaw = {
  has_key: boolean;
  owner_mode: Mode;
  customer_mode: Mode;
  decisions_mode: Mode;
  counts_7d: Record<string, { n: number }[]>;
  held: unknown[];
};

type LisaDecisionsRaw = { jev_mode: Mode; followup_mode: Mode; quote_mode: Mode };

export default async function TeamPage() {
  const cookieHeader = (await cookies()).toString();

  const [team, latest, dashboard, agentDecisions, lisaDecisions] = await Promise.all([
    ssrAdminGet<TeamData>("/api/v1/admin/team", cookieHeader, EMPTY_TEAM),
    ssrAdminGet<{ brief: ChiefBrief | null }>("/api/v1/admin/chief/brief", cookieHeader, {
      brief: null,
    }),
    ssrAdminGet<ChiefDashboard>(
      "/api/v1/admin/chief/dashboard?hours=24",
      cookieHeader,
      EMPTY_DASHBOARD
    ),
    ssrAdminGet<AgentDecisionsRaw | null>("/api/v1/admin/agent-decisions", cookieHeader, null),
    ssrAdminGet<LisaDecisionsRaw | null>("/api/v1/admin/lisa-decisions", cookieHeader, null),
  ]);

  // Real state of the decision layer. Null when the API could not be read, so the card
  // says "unavailable" instead of showing a made-up status.
  const jev: JevStatus | null = agentDecisions
    ? {
        has_key: agentDecisions.has_key,
        agents: {
          owner: agentDecisions.owner_mode,
          customer: agentDecisions.customer_mode,
          decisions: agentDecisions.decisions_mode,
        },
        lisa: lisaDecisions
          ? {
              decisions: lisaDecisions.jev_mode,
              followups: lisaDecisions.followup_mode,
              quoting: lisaDecisions.quote_mode,
            }
          : null,
        recorded_7d: Object.values(agentDecisions.counts_7d ?? {}).reduce(
          (sum, rows) => sum + rows.reduce((n, r) => n + Number(r.n || 0), 0),
          0
        ),
        held: agentDecisions.held?.length ?? 0,
      }
    : null;

  return (
    <TeamClient
      team={team}
      initialBrief={latest.brief}
      initialDashboard={dashboard}
      jev={jev}
    />
  );
}
