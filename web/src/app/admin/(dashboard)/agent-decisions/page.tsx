import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import AgentDecisionsClient, { AgentDecisionsData } from "./AgentDecisionsClient";

export const metadata: Metadata = {
  title: "Agent Decisions, Admin",
};

const EMPTY: AgentDecisionsData = {
  has_key: false,
  owner_mode: "shadow",
  customer_mode: "shadow",
  decisions_mode: "shadow",
  digest_times: "09:00,17:00",
  last_digest_slot: null,
  counts_7d: {},
  held: [],
  recent: [],
};

export default async function AgentDecisionsPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<AgentDecisionsData>("/api/v1/admin/agent-decisions", cookieHeader, EMPTY);
  return <AgentDecisionsClient initialData={data} />;
}
