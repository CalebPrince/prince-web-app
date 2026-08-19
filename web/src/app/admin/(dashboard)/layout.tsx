import { cookies } from "next/headers";
import { ReactNode } from "react";
import { api } from "@/lib/api";
import { redirect } from "next/navigation";

import { Logo } from "@/components/Logo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export const metadata = {
  title: "Admin Dashboard | Prince Caleb",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Validate auth on the server side using cookies
  const cookieStore = await cookies();
  const auth = await api.authMe(cookieStore.toString()).catch(() => null);

  if (!auth?.email) {
    redirect("/admin/login");
  }

  return (
    <div className="flex min-h-screen bg-bg text-text selection:bg-accent/30">
      <aside className="w-64 border-r border-hairline bg-bg-2 flex flex-col flex-shrink-0 h-screen sticky top-0">
        <div className="p-6 border-b border-hairline flex-shrink-0">
          <Logo className="scale-90 origin-left" />
        </div>

        <AdminSidebar />

        <div className="p-4 border-t border-hairline flex-shrink-0">
          <p className="text-xs text-text-2">Logged in as</p>
          <p className="text-sm font-medium truncate">{auth?.email || "Admin"}</p>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">{children}</div>
      </main>
    </div>
  );
}
