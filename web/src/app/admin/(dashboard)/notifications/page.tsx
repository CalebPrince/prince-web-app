import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import NotificationsClient, { NotificationItem } from "./NotificationsClient";

export const metadata: Metadata = {
  title: "Notifications — Admin",
};

export default async function NotificationsPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ items: NotificationItem[] }>(
    "/api/v1/admin/notifications",
    cookieHeader,
    { items: [] }
  );

  return <NotificationsClient initialItems={data.items ?? []} />;
}
