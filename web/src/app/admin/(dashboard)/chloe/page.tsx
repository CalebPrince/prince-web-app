import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import ChloeClient, { ChloeIncident, ChloeSnapshot } from "./ChloeClient";

export const metadata: Metadata = {
  title: "Chloe — Admin",
};

export default async function ChloePage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ incidents: ChloeIncident[]; snapshot: ChloeSnapshot; chloe_name: string }>(
    "/api/v1/admin/chloe/incidents",
    cookieHeader,
    { incidents: [], snapshot: { monitors: { total: 0, up: 0, down: 0 }, open_incidents_by_category: {}, recent_incidents: [], generated_at: "" }, chloe_name: "Chloe" }
  );

  return (
    <ChloeClient
      initialIncidents={data.incidents ?? []}
      initialSnapshot={data.snapshot}
      chloeName={data.chloe_name || "Chloe"}
    />
  );
}
