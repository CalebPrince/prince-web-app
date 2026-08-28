import { Metadata } from "next";
import { cookies } from "next/headers";
import { adminApi, asList, ssrAdminGet } from "@/lib/api";
import DripClient, { Automation } from "./DripClient";

export const metadata: Metadata = {
  title: "Automations — Admin",
};

export default async function DripPage() {
  const cookieHeader = (await cookies()).toString();

  // Deliberately NOT ssrAdminList: its []-on-failure fallback makes a real
  // fetch failure indistinguishable from a genuinely empty automations list,
  // rendering "No automations yet" instead of telling you it actually failed
  // to load (same reasoning as content/page.tsx's settings load).
  const automationsPromise = adminApi
    .get<unknown>("/api/v1/admin/automations", cookieHeader)
    .then((res) => ({ automations: asList<Automation>(res), loadError: null as string | null }))
    .catch((err) => ({
      automations: [] as Automation[],
      loadError: err instanceof Error ? err.message : "Could not load automations.",
    }));

  const [{ automations, loadError }, settings] = await Promise.all([
    automationsPromise,
    ssrAdminGet<Record<string, string>>("/api/v1/admin/settings", cookieHeader, {}),
  ]);

  return (
    <DripClient initialAutomations={automations} settings={settings} loadError={loadError} />
  );
}
