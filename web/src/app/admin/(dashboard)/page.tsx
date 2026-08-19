import { api } from "@/lib/api";
import { cookies } from "next/headers";
import DashboardClient from "./DashboardClient";

export default async function AdminDashboardPage() {
  const cookieStore = await cookies();
  const cookieStr = cookieStore.toString();

  // Fetch the data on the server side using the authenticated user's cookies
  const [data, notifications, user] = await Promise.all([
    api.adminDashboard(cookieStr).catch(() => null),
    api.adminNotifications(cookieStr).catch(() => null),
    api.authMe(cookieStr).catch(() => null)
  ]);

  return (
    <DashboardClient 
      initialData={data} 
      notifications={notifications} 
      user={user} 
    />
  );
}
