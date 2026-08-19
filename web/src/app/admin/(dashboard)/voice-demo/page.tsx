import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import VoiceDemoClient, { VoiceDemoStats } from "./VoiceDemoClient";

export const metadata: Metadata = {
  title: "Voice Demo — Admin",
};

const EMPTY: VoiceDemoStats = {
  summary: {},
  events: [],
  recent: [],
  call_logs: [],
  readiness: [],
  marketing_calls: {},
  telephony_enabled: false,
  webhook_url: "",
  post_call_webhook_url: "",
};

export default async function VoiceDemoPage() {
  const cookieHeader = (await cookies()).toString();
  const stats = await ssrAdminGet<VoiceDemoStats>(
    "/api/v1/admin/voice-demo/stats",
    cookieHeader,
    EMPTY
  );

  return <VoiceDemoClient initialStats={stats} />;
}
