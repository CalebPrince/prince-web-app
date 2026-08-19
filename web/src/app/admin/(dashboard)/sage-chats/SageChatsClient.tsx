"use client";

import { useMemo, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Trash2, Mail } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Select, FilterBar, StatusPill,
  ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type SageChat = {
  id: number;
  client_name: string | null;
  client_email: string | null;
  admin_seen: boolean | number;
  transcript: { role: string; text: string }[];
  created_at: string;
  updated_at: string;
};

export default function SageChatsClient({ initialChats }: { initialChats: SageChat[] }) {
  const [chats, setChats] = useState(initialChats);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Pinned once on mount: "this week" is a display stat, and recomputing the
  // cutoff on every render would make the memo impure.
  const [weekAgo] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);

  const stats = useMemo(() => {
    return {
      total: chats.length,
      unread: chats.filter((c) => !c.admin_seen).length,
      withContact: chats.filter((c) => c.client_name || c.client_email).length,
      thisWeek: chats.filter(
        (c) => new Date(c.created_at.replace(" ", "T") + "Z").getTime() >= weekAgo
      ).length,
    };
  }, [chats, weekAgo]);

  const visible = useMemo(() => {
    if (filter === "unread") return chats.filter((c) => !c.admin_seen);
    if (filter === "contact") return chats.filter((c) => c.client_name || c.client_email);
    return chats;
  }, [chats, filter]);

  const refresh = async () => {
    setChats(asList<SageChat>(await adminApi.get("/api/v1/admin/sage-chats")));
    window.dispatchEvent(new Event("admin:notifications-changed"));
  };

  const markSeen = async (id: number) => {
    try {
      await adminApi.patch(`/api/v1/admin/sage-chats/${id}`, { admin_seen: true });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark that as seen.");
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this conversation permanently? This can't be undone.")) return;
    try {
      await adminApi.del(`/api/v1/admin/sage-chats/${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversation.");
    }
  };

  const removeAll = async () => {
    if (!chats.length) return;
    if (!confirm(`Delete all ${chats.length} conversation${chats.length === 1 ? "" : "s"} permanently? This can't be undone.`)) return;
    try {
      await adminApi.del("/api/v1/admin/sage-chats");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversations.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="What Sage has been asked."
        description="Public marketing-brain conversations, and who left their details."
        actions={
          <Button variant="danger" onClick={removeAll} disabled={!chats.length}>
            <Trash2 className="w-4 h-4" />
            Delete all
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversations" value={stats.total} />
        <StatCard label="Unread" value={stats.unread} />
        <StatCard label="Shared a name/email" value={stats.withContact} />
        <StatCard label="This week" value={stats.thisWeek} />
      </div>

      <FilterBar>
        <Select className="w-auto min-w-52" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All conversations</option>
          <option value="unread">Unread only</option>
          <option value="contact">Shared contact details</option>
        </Select>
      </FilterBar>

      {visible.length === 0 ? (
        <Card>
          <div className="px-6 py-16 text-center text-text-3">No conversations yet.</div>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <article
              key={c.id}
              className={`rounded-xl border bg-bg-2 p-4 ${
                c.admin_seen ? "border-hairline" : "border-accent/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{c.client_name || (c.client_email ? "Unnamed visitor" : "Anonymous visitor")}</strong>
                  {c.client_email && <span className="text-sm text-text-3">{c.client_email}</span>}
                  {!c.admin_seen && <StatusPill status="new" />}
                </div>
                <span className="text-xs text-text-3">{c.transcript.length} messages</span>
              </div>

              <details className="mb-3 group">
                <summary className="text-sm text-text-3 cursor-pointer hover:text-text-2 select-none">
                  Transcript
                </summary>
                <div className="mt-2 rounded-lg border border-hairline p-3 max-h-56 overflow-y-auto custom-scrollbar space-y-1.5">
                  {c.transcript.map((t, i) => (
                    <p key={i} className="text-sm">
                      <span className="text-text-3 mr-1">{t.role === "user" ? "Visitor:" : "Sage:"}</span>
                      <span className={t.role === "user" ? "text-text" : "text-text-2"}>{t.text}</span>
                    </p>
                  ))}
                </div>
              </details>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-text-3">
                  Last activity: {formatDateTime(c.updated_at)}
                </span>
                <div className="flex flex-wrap gap-2">
                  {c.client_email && (
                    <a
                      href={`mailto:${c.client_email}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Reply by email
                    </a>
                  )}
                  {!c.admin_seen && (
                    <Button variant="primary" onClick={() => markSeen(c.id)}>Mark seen</Button>
                  )}
                  <Button variant="danger" onClick={() => remove(c.id)}>
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
