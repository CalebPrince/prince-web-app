"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi, asList } from "@/lib/api";
import { Trash2, Mail, Phone, ArrowUpRight } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Select, FilterBar, StatusPill,
  ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type ChatLead = {
  id: number;
  token: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_comment: string | null;
  prototype_status: string;
  has_prototype: boolean;
  admin_seen: boolean | number;
  transcript: { role: string; text: string }[];
  updated_at: string;
};

export type ChatStats = {
  engaged: number;
  total_sessions: number;
  last_7_days: number;
  leads: number;
  lead_conversion_pct: number;
  reached_prototype_ready: number;
  prototypes_built: number;
  prototypes_approved: number;
  prototypes_changes: number;
};

const STATUS_LABELS: Record<string, string> = {
  none: "chatting",
  message: "left message",
  generated: "prototype built",
  approved: "approved",
  changes_requested: "changes requested",
};

/** A session with contact details but no prototype is a direct "leave a message" lead. */
function statusKey(c: ChatLead): string {
  return c.prototype_status === "none" && c.client_name ? "message" : c.prototype_status;
}

export default function ChatsClient({
  initialChats,
  initialStats,
}: {
  initialChats: ChatLead[];
  initialStats: ChatStats | null;
}) {
  const [chats, setChats] = useState(initialChats);
  const [stats, setStats] = useState(initialStats);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const openId = searchParams.get("open");

  const visible = useMemo(() => {
    if (filter === "feedback") {
      return chats.filter(
        (c) => c.prototype_status === "approved" || c.prototype_status === "changes_requested"
      );
    }
    if (filter) return chats.filter((c) => c.prototype_status === filter);
    return chats;
  }, [chats, filter]);

  const refresh = async () => {
    setChats(asList<ChatLead>(await adminApi.get("/api/v1/admin/chats")));
    window.dispatchEvent(new Event("admin:notifications-changed"));
  };

  const markSeen = async (id: number) => {
    try {
      await adminApi.patch(`/api/v1/admin/chats/${id}`, { admin_seen: true });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark that as seen.");
    }
  };

  // Deep link from the notification feed: mark the target seen and scroll to it.
  useEffect(() => {
    if (!openId) return;
    const target = chats.find((c) => String(c.id) === openId);
    if (!target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    if (!target.admin_seen) markSeen(target.id);
    document
      .getElementById(`chat-${openId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const remove = async (id: number) => {
    if (!confirm("Delete this conversation permanently? This can't be undone.")) return;
    try {
      await adminApi.del(`/api/v1/admin/chats/${id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversation.");
    }
  };

  const removeAll = async () => {
    if (!chats.length) return;
    if (!confirm(`Delete all ${chats.length} conversation${chats.length === 1 ? "" : "s"} permanently? This can't be undone.`)) return;
    try {
      await adminApi.del("/api/v1/admin/chats");
      await refresh();
      setStats(await adminApi.get<ChatStats>("/api/v1/admin/chats/stats").catch(() => null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the conversations.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Every conversation Lisa had."
        description="Website and WhatsApp chat sessions, the prototypes they produced, and who left contact details."
        actions={
          <Button variant="danger" onClick={removeAll} disabled={!chats.length}>
            <Trash2 className="w-4 h-4" />
            Delete all
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Conversations"
            value={stats.engaged}
            hint={`${stats.total_sessions} sessions · ${stats.last_7_days} this week`}
          />
          <StatCard
            label="Leads captured"
            value={stats.leads}
            hint={`${stats.lead_conversion_pct}% of conversations`}
          />
          <StatCard
            label="Prototype-ready"
            value={stats.reached_prototype_ready}
            hint={`${stats.prototypes_built} built`}
          />
          <StatCard
            label="Prototype feedback"
            value={`${stats.prototypes_approved} / ${stats.prototypes_changes}`}
            hint="approved / changes requested"
          />
        </div>
      )}

      <FilterBar>
        <Select className="w-auto min-w-56" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All conversations</option>
          <option value="none">Still chatting</option>
          <option value="generated">Prototype built</option>
          <option value="feedback">Has prototype feedback</option>
          <option value="approved">Approved</option>
          <option value="changes_requested">Changes requested</option>
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
              id={`chat-${c.id}`}
              className={`rounded-xl border bg-bg-2 p-4 scroll-mt-24 ${
                c.admin_seen ? "border-hairline" : "border-accent/40"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong>{c.client_name || "Anonymous visitor"}</strong>
                  {c.client_email && <span className="text-sm text-text-3">{c.client_email}</span>}
                  {c.client_phone && <span className="text-sm text-text-3">· {c.client_phone}</span>}
                  {c.token.startsWith("whatsapp:") && <StatusPill status="WhatsApp" tone="green" />}
                  {!c.admin_seen && <StatusPill status="new" />}
                </div>
                <StatusPill status={STATUS_LABELS[statusKey(c)] ?? statusKey(c)} />
              </div>

              {c.client_comment && (
                <div className="rounded-lg border border-hairline bg-bg px-3 py-2 text-sm mb-3">
                  <strong className="text-text-3 text-xs uppercase tracking-wider block mb-0.5">
                    Comment
                  </strong>
                  {c.client_comment}
                </div>
              )}

              <details className="mb-3">
                <summary className="text-sm text-text-3 cursor-pointer hover:text-text-2 select-none">
                  Transcript ({c.transcript.length} messages)
                </summary>
                <div className="mt-2 rounded-lg border border-hairline p-3 max-h-56 overflow-y-auto custom-scrollbar space-y-1.5">
                  {c.transcript.map((t, i) => (
                    <p key={i} className="text-sm">
                      <span className="text-text-3 mr-1">{t.role === "user" ? "Visitor:" : "AI:"}</span>
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
                  {c.has_prototype && (
                    <a
                      href={`/api/v1/chat/prototype/${c.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      View prototype
                      <ArrowUpRight className="w-4 h-4" />
                    </a>
                  )}
                  {c.client_email && (
                    <a
                      href={`mailto:${c.client_email}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </a>
                  )}
                  {c.client_phone && (
                    <a
                      href={`tel:${c.client_phone}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      Call
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
