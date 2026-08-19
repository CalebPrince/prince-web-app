import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import GrowthRoadmapClient, { RoadmapRun } from "./GrowthRoadmapClient";

export const metadata: Metadata = {
  title: "Growth Roadmap — Admin",
};

export default async function GrowthRoadmapPage() {
  const cookieHeader = (await cookies()).toString();
  const initialRuns = await ssrAdminList<RoadmapRun>("/api/v1/admin/growth-roadmap", cookieHeader);

  return <GrowthRoadmapClient initialRuns={initialRuns} />;
}
