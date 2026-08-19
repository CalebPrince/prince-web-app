import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import ActivityLogClient, { ActivityLogPage } from "./ActivityLogClient";

export const metadata: Metadata = {
  title: "Activity Log — Admin",
};

export default async function ActivityLogPageRoute() {
  const cookieHeader = (await cookies()).toString();

  const [initialLog, entityTypes] = await Promise.all([
    ssrAdminGet<ActivityLogPage>("/api/v1/admin/activity-log?page=1", cookieHeader, {
      rows: [], total: 0, per_page: 50,
    }),
    ssrAdminList<string>("/api/v1/admin/activity-log/entity-types", cookieHeader),
  ]);

  return <ActivityLogClient initialLog={initialLog} entityTypes={entityTypes} />;
}
