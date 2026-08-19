import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import DripClient, { Automation } from "./DripClient";

export const metadata: Metadata = {
  title: "Automations — Admin",
};

export default async function DripPage() {
  const cookieHeader = (await cookies()).toString();

  const [automations, settings] = await Promise.all([
    ssrAdminList<Automation>("/api/v1/admin/automations", cookieHeader),
    ssrAdminGet<Record<string, string>>("/api/v1/admin/settings", cookieHeader, {}),
  ]);

  return <DripClient initialAutomations={automations} settings={settings} />;
}
