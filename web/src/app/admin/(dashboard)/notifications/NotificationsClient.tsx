"use client";

import { useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import {
  Inbox, MessageCircle, CalendarCheck, CreditCard, FileCheck, Receipt,
  Activity, AlarmClock, CheckSquare, PiggyBank, Bell, CheckCheck,
} from "lucide-react";
import { PageHeader, Card, Button, Tabs, ErrorBanner, adminHref } from "@/components/admin/ui";

export type NotificationItem = {
  key: string;
  type: string;
  level: string;
  title: string;
  detail: string;
  href: string;
  date: string;
};

const TYPE_ICONS: Record<string, typeof Bell> = {
  Inquiry: Inbox,
  Chat: MessageCircle,
  Booking: CalendarCheck,
  Payment: CreditCard,
  Proposal: FileCheck,
  Invoice: Receipt,
  Uptime: Activity,
  "Follow-up": AlarmClock,
  Task: CheckSquare,
  Billing: PiggyBank,
};

const LEVEL_ACCENT: Record<string, string> = {
  urgent: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-blue-500",
};

function timeAgo(value: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value.replace(" ", "T") + "Z").getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function NotificationsClient({ initialItems }: { initialItems: NotificationItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);
  const visible = useMemo(
    () => (filter ? items.filter((i) => i.type === filter) : items),
    [items, filter]
  );

  /** The sidebar bell listens for this so its badge drops in step with the page. */
  const announceChange = () => window.dispatchEvent(new Event("admin:notifications-changed"));

  const markRead = async (key: string) => {
    try {
      await adminApi.patch(`/api/v1/admin/notifications/${encodeURIComponent(key)}`);
      setItems((prev) => prev.filter((i) => i.key !== key));
      announceChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark that as read.");
    }
  };

  const markAllRead = async () => {
    if (!items.length) return;
    try {
      await adminApi.patch("/api/v1/admin/notifications/read-all");
      setItems([]);
      announceChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark everything as read.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="Everything that wants your attention."
        description="One feed for inquiries, chats, bookings, payments and uptime alerts."
        actions={
          <Button variant="primary" onClick={markAllRead} disabled={!items.length}>
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {types.length > 0 && (
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "", label: "All", count: items.length },
            ...types.map((t) => ({
              value: t,
              label: t,
              count: items.filter((i) => i.type === t).length,
            })),
          ]}
        />
      )}

      {visible.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center">
            <Bell className="w-8 h-8 mx-auto text-text-3 mb-3" />
            <p className="text-text-3">You&apos;re all caught up.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const Icon = TYPE_ICONS[item.type] ?? Bell;
            return (
              <article
                key={item.key}
                className={`rounded-xl border border-hairline border-l-2 ${
                  LEVEL_ACCENT[item.level] ?? "border-l-hairline-strong"
                } bg-bg-2 p-4 flex flex-col sm:flex-row gap-4`}
              >
                <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-bg-3 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-text-2" />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-text-3 uppercase tracking-wider mb-1">
                    <span>{item.type}</span>
                    <span aria-hidden>·</span>
                    <time>{timeAgo(item.date)}</time>
                  </div>
                  <h3 className="font-semibold text-sm">{item.title}</h3>
                  <p className="text-sm text-text-2 mt-0.5">{item.detail}</p>
                </div>

                <div className="flex items-start gap-2 flex-shrink-0">
                  <a
                    href={adminHref(item.href)}
                    className="inline-flex items-center justify-center h-9 px-4 rounded-md bg-text text-bg text-sm font-medium hover:bg-text/90 transition-colors"
                  >
                    Open
                  </a>
                  <Button variant="outline" onClick={() => markRead(item.key)}>
                    Mark read
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
