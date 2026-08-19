import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import UptimeClient, { Monitor, MonitorClient } from "./UptimeClient";

export const metadata: Metadata = {
  title: "Uptime — Admin",
};

export default async function UptimePage() {
  const cookieHeader = (await cookies()).toString();

  const [monitors, clients] = await Promise.all([
    ssrAdminList<Monitor>("/api/v1/admin/uptime", cookieHeader),
    // Monitors work fine without client links, so a failure here is not fatal.
    ssrAdminList<MonitorClient>("/api/v1/admin/clients", cookieHeader),
  ]);

  return <UptimeClient initialMonitors={monitors} clients={clients} />;
}
