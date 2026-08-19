import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import ClientsClient, { ClientRow, Automation } from "./ClientsClient";

export const metadata: Metadata = {
  title: "Clients — Admin",
};

export default async function ClientsPage() {
  const cookieHeader = (await cookies()).toString();

  const [clients, automations] = await Promise.all([
    ssrAdminList<ClientRow>("/api/v1/admin/clients", cookieHeader),
    // Only used to populate the enroll-in-automation picker.
    ssrAdminList<Automation>("/api/v1/admin/automations", cookieHeader),
  ]);

  // The client reads ?open= and ?tab= to deep-link straight into a client.
  return (
    <Suspense fallback={null}>
      <ClientsClient initialClients={clients} automations={automations} />
    </Suspense>
  );
}
