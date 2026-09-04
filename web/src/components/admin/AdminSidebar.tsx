"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Gauge, BarChart, Users, ClipboardList, ClipboardCheck, Kanban, FileText,
  MessageSquareQuote, Megaphone, CalendarDays, ImageIcon, Tags, FileCode,
  Languages, Bot, Contact, Inbox, Bell, GitBranch, FileCheck, Target, Map,
  Mail, Workflow, Mic, Sparkles, CalendarCheck, CreditCard, Receipt, Wallet,
  Tag, Activity, AudioLines, ListChecks, History, AlertTriangle, Settings,
  LogOut, ExternalLink,
} from "lucide-react";
import { adminApi, postJson } from "@/lib/api";

/** The unified Inbox supersedes the old per-channel Inquiries, Quote Requests
 *  and Chat Leads menu entries — those routes still exist (the Inbox deep-links
 *  into them as "source" records) but are no longer listed here. */
const navigation = [
  {
    group: "Overview",
    items: [
      { name: "Dashboard", href: "/admin", icon: Gauge },
      { name: "Reports", href: "/admin/reports", icon: BarChart },
      { name: "Chief", href: "/admin/chief", icon: ClipboardCheck },
      { name: "Team", href: "/admin/team", icon: Users },
      { name: "Tasks", href: "/admin/tasks", icon: ClipboardList },
    ],
  },
  {
    group: "Content",
    items: [
      { name: "Projects", href: "/admin/projects", icon: Kanban },
      { name: "Blog", href: "/admin/blog", icon: FileText },
      { name: "Testimonials", href: "/admin/testimonials", icon: MessageSquareQuote },
      { name: "Social Drafts", href: "/admin/social-drafts", icon: Megaphone },
      { name: "Content Ideas", href: "/admin/content-ideas", icon: CalendarDays },
      { name: "Content Studio", href: "/admin/content-studio", icon: ImageIcon },
      { name: "Tags", href: "/admin/tags", icon: Tags },
      { name: "Site Content", href: "/admin/content", icon: FileCode },
      { name: "Frontend Wording", href: "/admin/frontend-wording", icon: Languages },
      { name: "Lisa", href: "/admin/lisa", icon: Bot },
    ],
  },
  {
    group: "Leads & Clients",
    items: [
      { name: "Inbox", href: "/admin/inbox", icon: Inbox },
      { name: "Notifications", href: "/admin/notifications", icon: Bell },
      { name: "Pipeline", href: "/admin/pipeline", icon: GitBranch },
      { name: "Contacts", href: "/admin/contacts", icon: Contact },
      { name: "Proposals", href: "/admin/proposals", icon: FileCheck },
      { name: "Clients", href: "/admin/clients", icon: Users },
      { name: "Marketing Leads", href: "/admin/marketing-leads", icon: Target },
      { name: "Growth Roadmap", href: "/admin/growth-roadmap", icon: Map },
      { name: "Newsletter", href: "/admin/newsletter", icon: Mail },
      { name: "Automations", href: "/admin/drip", icon: Workflow },
      { name: "Talk to Agents", href: "/admin/agent-chat", icon: Mic },
      { name: "Sage Chats", href: "/admin/sage-chats", icon: Sparkles },
    ],
  },
  {
    group: "Bookings & Payments",
    items: [
      { name: "Bookings", href: "/admin/appointments", icon: CalendarCheck },
      { name: "Payments", href: "/admin/payments", icon: CreditCard },
      { name: "Invoices", href: "/admin/invoices", icon: Receipt },
      { name: "Expenses", href: "/admin/expenses", icon: Wallet },
      { name: "Pricing", href: "/admin/pricing", icon: Tag },
    ],
  },
  {
    group: "System",
    items: [
      { name: "Sites", href: "/admin/sites", icon: Activity },
      { name: "Voice Demo", href: "/admin/voice-demo", icon: AudioLines },
      { name: "Agent Queue", href: "/admin/agent-tasks", icon: ListChecks },
      { name: "Activity Log", href: "/admin/activity-log", icon: History },
      { name: "Error Logs", href: "/admin/error-logs", icon: AlertTriangle },
      { name: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

/** Unread counts the sidebar badges, keyed by the route they belong to. */
type Badges = { inbox: number; notifications: number };

export function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [badges, setBadges] = useState<Badges>({ inbox: 0, notifications: 0 });

  useEffect(() => {
    const load = async () => {
      try {
        const [inbox, notifications] = await Promise.all([
          adminApi
            .get<{ items: { unread: boolean; state: string }[] }>("/api/v1/admin/inbox")
            .catch(() => ({ items: [] })),
          adminApi
            .get<{ items: unknown[] }>("/api/v1/admin/notifications")
            .catch(() => ({ items: [] })),
        ]);
        setBadges({
          inbox: (inbox.items ?? []).filter(
            (i) => i.unread && !["archived", "deleted"].includes(i.state)
          ).length,
          notifications: (notifications.items ?? []).length,
        });
      } catch {
        /* badges are decorative — never block the shell on them */
      }
    };

    load();
    // Pages dispatch this after marking things read so the badges stay honest.
    window.addEventListener("admin:notifications-changed", load);
    return () => window.removeEventListener("admin:notifications-changed", load);
  }, [pathname]);

  const badgeFor = (href: string) => {
    if (href === "/admin/inbox") return badges.inbox;
    if (href === "/admin/notifications") return badges.notifications;
    return 0;
  };

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const logout = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await postJson("/api/v1/auth/logout", {});
    } catch {
      /* log out locally regardless of what the API says */
    }
    // refresh() re-runs the layout's server-side auth check so the shell can't
    // keep rendering from a stale cache after the session cookie is gone.
    router.push("/admin/login");
    router.refresh();
  };

  return (
    <nav className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
      {navigation.map((navGroup) => (
        <div key={navGroup.group}>
          <h3 className="px-3 text-xs font-semibold text-text-3 uppercase tracking-wider mb-2">
            {navGroup.group}
          </h3>
          <div className="space-y-1">
            {navGroup.items.map((item) => {
              const active = isActive(item.href);
              const count = badgeFor(item.href);
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-bg-3 text-text"
                      : "text-text-2 hover:bg-bg-3 hover:text-text"
                  }`}
                >
                  <item.icon
                    className={`w-4 h-4 flex-shrink-0 ${active ? "text-accent" : "text-text-3"}`}
                  />
                  <span className="flex-1 truncate">{item.name}</span>
                  {count > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums bg-accent text-on-accent">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="pt-4 mt-6 border-t border-hairline space-y-1">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-text-2 hover:bg-bg-3 hover:text-text transition-colors"
        >
          <ExternalLink className="w-4 h-4 text-text-3" />
          View site
        </a>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-text-2 hover:bg-bg-3 hover:text-text transition-colors"
        >
          <LogOut className="w-4 h-4 text-text-3" />
          Log out
        </button>
      </div>
    </nav>
  );
}
