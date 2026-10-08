import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { asList, ssrAdminGet } from "@/lib/api";
import PipelineClient, { PipelineLead } from "./PipelineClient";

export const metadata: Metadata = {
  title: "Pipeline — Admin",
};

export default async function PipelinePage() {
  const cookieHeader = (await cookies()).toString();

  // The pipeline endpoint answers { leads, stages }, not a bare list, so the list sits under `leads`
  // (ssrAdminList would turn the wrapper into an empty board).
  const [pipeline, settings] = await Promise.all([
    ssrAdminGet<{ leads?: unknown }>("/api/v1/admin/pipeline", cookieHeader, { leads: [] }),
    ssrAdminGet<Record<string, string>>("/api/v1/admin/settings", cookieHeader, {}),
  ]);
  const leads = asList<PipelineLead>(pipeline?.leads);

  // The client reads ?q=, ?source=, ?focus= and ?open= from the URL.
  return (
    <Suspense fallback={null}>
      <PipelineClient initialLeads={leads} settings={settings} />
    </Suspense>
  );
}
