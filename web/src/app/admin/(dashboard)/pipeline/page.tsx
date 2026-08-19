import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import PipelineClient, { PipelineLead } from "./PipelineClient";

export const metadata: Metadata = {
  title: "Pipeline — Admin",
};

export default async function PipelinePage() {
  const cookieHeader = (await cookies()).toString();

  const [leads, settings] = await Promise.all([
    ssrAdminList<PipelineLead>("/api/v1/admin/pipeline", cookieHeader),
    ssrAdminGet<Record<string, string>>("/api/v1/admin/settings", cookieHeader, {}),
  ]);

  // The client reads ?q=, ?source=, ?focus= and ?open= from the URL.
  return (
    <Suspense fallback={null}>
      <PipelineClient initialLeads={leads} settings={settings} />
    </Suspense>
  );
}
