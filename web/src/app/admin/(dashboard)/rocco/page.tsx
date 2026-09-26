import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import RoccoClient, { RoccoOverview } from "./RoccoClient";

export const metadata: Metadata = {
  title: "Rocco, Admin",
};

const EMPTY: RoccoOverview = {
  report: {
    mode: "shadow", has_key: false, table_missing: false, total: 0, first_logged_at: null,
    min_sample: 200, kinds: {}, verdict: "collecting", verdict_text: "",
  },
  recommendations: [],
  reports: [],
  review_enabled: false,
  review_frequency: "weekly",
  last_review_at: null,
};

export default async function RoccoPage() {
  const cookieHeader = (await cookies()).toString();
  const overview = await ssrAdminGet<RoccoOverview>("/api/v1/admin/rocco/overview", cookieHeader, EMPTY);
  return <RoccoClient initialOverview={overview} />;
}
