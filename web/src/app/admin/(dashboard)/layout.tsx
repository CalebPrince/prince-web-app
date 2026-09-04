import { cookies } from "next/headers";
import { ReactNode } from "react";
import { api } from "@/lib/api";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/AdminShell";

export const metadata = {
  // Its own template overrides the root "Prince Caleb | %s" one, leaving the
  // admin pages' existing titles ("Tags - Admin", etc.) untouched.
  title: {
    default: "Admin Dashboard | Prince Caleb",
    template: "%s",
  },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Validate auth on the server side using cookies
  const cookieStore = await cookies();
  const auth = await api.authMe(cookieStore.toString()).catch(() => null);

  if (!auth?.email) {
    redirect("/admin/login");
  }

  return (
    <AdminShell email={auth.email}>{children}</AdminShell>
  );
}
