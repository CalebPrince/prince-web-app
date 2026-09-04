"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

export function AdminShell({ children, email }: { children: React.ReactNode; email: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!sidebarOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
        openButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen bg-bg text-text selection:bg-accent/30">
      <button
        type="button"
        className="fixed left-4 top-4 z-40 grid size-11 place-items-center rounded-[var(--control-radius)] border border-hairline bg-bg-2 text-text shadow-lg md:hidden"
        aria-label="Open admin navigation"
        aria-controls="admin-sidebar"
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(true)}
        ref={openButtonRef}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <button
        type="button"
        aria-label="Close admin navigation"
        onClick={closeSidebar}
        className={`fixed inset-0 z-40 bg-black/60 transition-opacity md:hidden ${
          sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        tabIndex={sidebarOpen ? 0 : -1}
      />

      <aside
        id="admin-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex h-dvh w-72 flex-shrink-0 flex-col border-r border-hairline bg-bg-2 shadow-2xl transition-transform duration-200 md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0 md:shadow-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!sidebarOpen ? undefined : false}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-hairline p-5 md:p-6">
          <Logo className="origin-left scale-90" />
          <button
            type="button"
            ref={closeButtonRef}
            onClick={closeSidebar}
            aria-label="Close admin navigation"
            className="grid size-11 place-items-center rounded-[var(--control-radius)] border border-hairline text-text-2 transition-colors hover:bg-bg-3 hover:text-text md:hidden"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <AdminSidebar onNavigate={closeSidebar} />

        <div className="flex-shrink-0 border-t border-hairline p-4">
          <p className="text-xs text-text-2">Logged in as</p>
          <p className="truncate text-sm font-medium">{email}</p>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4 pt-20 custom-scrollbar md:p-8">{children}</div>
      </main>
    </div>
  );
}

