import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import InboxClient, { InboxItem } from "./InboxClient";

export const metadata: Metadata = {
  title: "Inbox — Admin",
};

export default async function InboxPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ items: InboxItem[] }>(
    "/api/v1/admin/inbox",
    cookieHeader,
    { items: [] }
  );

  // InboxClient reads ?source= and ?open= to deep-link from notifications.
  return (
    <Suspense fallback={null}>
      <InboxClient initialItems={data.items ?? []} />
    </Suspense>
  );
}
