import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import LisaDecisionsClient, { LisaDecisionsData } from "./LisaDecisionsClient";

export const metadata: Metadata = {
  title: "Lisa Decisions, Admin",
};

const EMPTY: LisaDecisionsData = {
  has_key: false,
  jev_mode: "shadow",
  followup_mode: "shadow",
  quote_mode: "shadow",
  quiet_now: false,
  timing: { first: 3, second: 20, max_days: 7, max_per_episode: 3 },
  template: { status: "not_created", content_sid: null },
  counts_7d: {},
  followups: [],
  judgments: [],
  quotes: [],
  owner_alerts: [],
};

export default async function LisaDecisionsPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<LisaDecisionsData>("/api/v1/admin/lisa-decisions", cookieHeader, EMPTY);
  return <LisaDecisionsClient initialData={data} />;
}
