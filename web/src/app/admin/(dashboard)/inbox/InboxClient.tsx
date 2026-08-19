"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import {
  Mail, FileText, MessageCircle, CalendarCheck, Users, Inbox as InboxIcon,
  Flag, Archive, Trash2, ArrowUpRight, Phone,
} from "lucide-react";
import { Button, Input, ErrorBanner } from "@/components/admin/ui";

export type InboxMessage = { role: string; text: string };
export type ClientMessage = { sender_type: string; body: string; created_at: string };

export type InboxItem = {
  key: string;
  source: keyof typeof SOURCE_META;
  source_id: number;
  source_url: string;
  name: string;
  email: string | null;
  phone: string | null;
  preview: string;
  created_at: string;
  unread: boolean;
  state: string;
  flagged: boolean;
  is_owner?: boolean;
  detail?: {
    message?: string;
    transcript?: InboxMessage[];
    messages?: ClientMessage[];
    is_owner?: boolean;
    project_type?: string;
    budget?: string;
    timeline?: string;
    features?: string;
    appointment_date?: string;
    appointment_time?: string;
    duration?: string;
    topic?: string;
    booking_status?: string;
  };
};

const SOURCE_META = {
  inquiry: { label: "Inquiry", icon: Mail, tone: "text-blue-500" },
  quote: { label: "Quote request", icon: FileText, tone: "text-violet-400" },
  chat: { label: "Live chat", icon: MessageCircle, tone: "text-amber-500" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, tone: "text-green-500" },
  appointment: { label: "Booking", icon: CalendarCheck, tone: "text-green-500" },
  client: { label: "Client portal", icon: Users, tone: "text-rose-400" },
} as const;

const FILTERS = [
  { value: "", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "inquiry", label: "Inquiries" },
  { value: "quote", label: "Quotes" },
  { value: "chat", label: "Chats" },
  { value: "appointment", label: "Bookings" },
  { value: "client", label: "Client portal" },
  { value: "flagged", label: "Flagged" },
  { value: "archived", label: "Archived" },
];

/** The state endpoints are keyed by a coarser type than the item's own source. */
function stateType(item: InboxItem): string {
  if (["inquiry", "quote"].includes(item.source)) return "inquiry";
  if (["chat", "whatsapp"].includes(item.source)) return "chat";
  if (item.source === "appointment") return "appointment";
  return "client";
}

/** The PHP InboxController still builds source links against the legacy
 *  `/admin/*.html` pages (e.g. "/admin/inquiries.html?open=12"). Drop the
 *  extension so "Open source" lands on the migrated Next route instead. */
function sourceHref(url: string): string {
  return url.replace(/^(\/admin\/[a-z0-9-]+)\.html/i, "$1");
}

function shortTime(value: string) {
  const date = new Date(value.replace(" ", "T") + "Z");
  if (isNaN(date.getTime())) return value;
  return (Date.now() - date.getTime()) / 86400000 < 1
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function InboxClient({ initialItems }: { initialItems: InboxItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyStatus, setReplyStatus] = useState("");
  const searchParams = useSearchParams();
  const readerRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      const stateVisible =
        filter === "archived"
          ? item.state === "archived"
          : filter === "flagged"
            ? item.state === "flagged"
            : !["archived", "deleted"].includes(item.state);

      const sourceVisible =
        !filter ||
        ["archived", "flagged"].includes(filter) ||
        (filter === "unread"
          ? item.unread
          : filter === "chat"
            ? ["chat", "whatsapp"].includes(item.source)
            : item.source === filter);

      const matchesQuery =
        !q ||
        [item.name, item.email, item.phone, item.preview].some((v) =>
          String(v || "").toLowerCase().includes(q)
        );

      return stateVisible && sourceVisible && matchesQuery;
    });
  }, [items, filter, query]);

  const active = items.find((i) => i.key === activeKey) ?? null;

  const unreadCount = items.filter(
    (i) => i.unread && !["archived", "deleted"].includes(i.state)
  ).length;

  const open = async (key: string) => {
    const item = items.find((c) => c.key === key);
    if (!item) return;
    setActiveKey(key);
    setReply("");
    setReplyStatus("");
    if (item.unread) {
      try {
        await adminApi.patch(`/api/v1/admin/inbox/${stateType(item)}/${item.source_id}/read`);
        setItems((prev) => prev.map((i) => (i.key === key ? { ...i, unread: false } : i)));
        window.dispatchEvent(new Event("admin:notifications-changed"));
      } catch {
        /* marking read is best-effort — the conversation still opens */
      }
    }
  };

  // Deep link from the notification feed. Inquiry keys can have been re-filed
  // as quotes, so fall back to the quote key before giving up.
  useEffect(() => {
    const source = searchParams.get("source");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    if (source && FILTERS.some((f) => f.value === source)) setFilter(source);

    let requested = searchParams.get("open");
    if (requested && !items.some((i) => i.key === requested) && requested.startsWith("inquiry:")) {
      requested = requested.replace("inquiry:", "quote:");
    }
    if (requested) open(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    readerRef.current?.scrollTo({ top: readerRef.current.scrollHeight });
  }, [activeKey]);

  const changeState = async (item: InboxItem, state: string) => {
    if (
      state === "deleted" &&
      !confirm("Remove this conversation from the Inbox? The original record will remain available in its source page.")
    ) {
      return;
    }
    try {
      await adminApi.patch(`/api/v1/admin/inbox/${stateType(item)}/${item.source_id}/state`, { state });
      setItems((prev) =>
        prev.map((i) => (i.key === item.key ? { ...i, state, flagged: state === "flagged" } : i))
      );
      setActiveKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the conversation.");
    }
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    setReplyStatus("Sending…");
    try {
      await adminApi.post(`/api/v1/admin/clients/${active.source_id}/messages`, { body: reply });
      setReplyStatus("Sent");
      setReply("");
      const data = await adminApi.get<{ items: InboxItem[] }>("/api/v1/admin/inbox");
      setItems(data.items ?? []);
    } catch (err) {
      setReplyStatus(err instanceof Error ? err.message : "Could not send.");
    }
  };

  const facts = active
    ? ([
        ["Project", active.detail?.project_type],
        ["Budget", active.detail?.budget],
        ["Timeline", active.detail?.timeline],
        ["Features", active.detail?.features],
        ["Date", active.detail?.appointment_date],
        ["Time", active.detail?.appointment_time],
        ["Duration", active.detail?.duration],
        ["Topic", active.detail?.topic],
        ["Status", active.detail?.booking_status],
      ].filter(([, v]) => !!v) as [string, string][])
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">
            Leads & Clients
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">One inbox for every channel.</h2>
          <p className="text-text-2">
            Inquiries, quotes, chats, WhatsApp, bookings and client portal threads in one place.
          </p>
        </div>
        <span className="text-sm text-text-3 whitespace-nowrap">{unreadCount} unread</span>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-bg-3 text-text"
                : "text-text-2 hover:bg-bg-3 hover:text-text"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[22rem_1fr] gap-4 items-start">
        {/* Conversation list */}
        <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
          <div className="p-3 border-b border-hairline">
            <Input
              placeholder="Search the inbox…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[70vh] overflow-y-auto custom-scrollbar" role="listbox">
            {visible.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-text-3">
                No conversations match this view.
              </p>
            ) : (
              visible.map((item) => {
                const meta = SOURCE_META[item.source];
                const Icon = meta?.icon ?? InboxIcon;
                return (
                  <button
                    key={item.key}
                    role="option"
                    aria-selected={item.key === activeKey}
                    onClick={() => open(item.key)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-hairline transition-colors ${
                      item.key === activeKey ? "bg-bg-3" : "hover:bg-bg-2"
                    }`}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${meta?.tone ?? "text-text-3"}`} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <strong className={`text-sm truncate ${item.unread ? "" : "font-medium"}`}>
                          {item.name}
                        </strong>
                        <time className="text-xs text-text-3 flex-shrink-0">
                          {shortTime(item.created_at)}
                        </time>
                      </span>
                      <span className="block text-xs text-text-3 mt-0.5">
                        {meta?.label ?? item.source}
                        {item.is_owner && " · Owner"}
                        {item.flagged && " · Flagged"}
                        {item.state === "archived" && " · Archived"}
                      </span>
                      <span className="block text-xs text-text-2 mt-1 line-clamp-2">
                        {item.preview}
                      </span>
                    </span>
                    {item.unread && (
                      <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1.5" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Reader */}
        <div
          ref={readerRef}
          className="rounded-xl border border-hairline bg-bg max-h-[70vh] overflow-y-auto custom-scrollbar"
        >
          {!active ? (
            <div className="px-6 py-20 text-center">
              <InboxIcon className="w-8 h-8 mx-auto text-text-3 mb-3" />
              <h4 className="font-semibold mb-1">Select a conversation</h4>
              <p className="text-sm text-text-3">Choose any channel from the list to read it here.</p>
            </div>
          ) : (
            <>
              <header className="p-5 border-b border-hairline bg-bg-2">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-text-3">
                    {SOURCE_META[active.source]?.label ?? active.source}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      title={active.state === "flagged" ? "Remove flag" : "Flag conversation"}
                      aria-label={active.state === "flagged" ? "Remove flag" : "Flag conversation"}
                      onClick={() =>
                        changeState(active, active.state === "flagged" ? "normal" : "flagged")
                      }
                      className={`p-1.5 rounded hover:bg-bg-3 transition-colors ${
                        active.state === "flagged" ? "text-amber-500" : "text-text-3 hover:text-text"
                      }`}
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                    <button
                      title={active.state === "archived" ? "Move to inbox" : "Archive conversation"}
                      aria-label={active.state === "archived" ? "Move to inbox" : "Archive conversation"}
                      onClick={() =>
                        changeState(active, active.state === "archived" ? "normal" : "archived")
                      }
                      className="p-1.5 rounded text-text-3 hover:bg-bg-3 hover:text-text transition-colors"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button
                      title="Delete from inbox"
                      aria-label="Delete from inbox"
                      onClick={() => changeState(active, "deleted")}
                      className="p-1.5 rounded text-text-3 hover:bg-bg-3 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <h3 className="text-lg font-semibold">{active.name}</h3>
                <p className="text-sm text-text-2">
                  {active.email || active.phone || "No contact details"}
                </p>

                <div className="flex flex-wrap gap-2 mt-4">
                  {active.email && (
                    <a
                      href={`mailto:${active.email}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-text text-bg text-sm font-medium hover:bg-text/90 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Reply by email
                    </a>
                  )}
                  {active.phone && (
                    <a
                      href={`tel:${active.phone}`}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      <Phone className="w-4 h-4" />
                      Call
                    </a>
                  )}
                  <a
                    href={sourceHref(active.source_url)}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                  >
                    Open source
                    <ArrowUpRight className="w-4 h-4" />
                  </a>
                </div>
              </header>

              {facts.length > 0 && (
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 p-5 border-b border-hairline">
                  {facts.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-text-3 uppercase tracking-wider">{label}</dt>
                      <dd className="text-sm mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              <div className="p-5 space-y-3">
                {active.source === "client" ? (
                  (active.detail?.messages ?? []).map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 max-w-[85%] ${
                        m.sender_type === "client"
                          ? "bg-bg-2 border border-hairline"
                          : "bg-accent-soft ml-auto"
                      }`}
                    >
                      <small className="text-xs text-text-3 block mb-1">
                        {m.sender_type === "client" ? "Client" : "Prince Caleb"} ·{" "}
                        {new Date(m.created_at.replace(" ", "T") + "Z").toLocaleString()}
                      </small>
                      <p className="text-sm">{m.body}</p>
                    </div>
                  ))
                ) : active.detail?.transcript ? (
                  active.detail.transcript.map((m, i) => (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 max-w-[85%] ${
                        m.role === "user"
                          ? "bg-bg-2 border border-hairline"
                          : "bg-accent-soft ml-auto"
                      }`}
                    >
                      <small className="text-xs text-text-3 block mb-1">
                        {m.role === "user"
                          ? active.is_owner || active.detail?.is_owner
                            ? "Prince Caleb · Owner"
                            : "Visitor"
                          : "Lisa"}
                      </small>
                      <p className="text-sm">{m.text}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm whitespace-pre-wrap">
                    {active.detail?.message || active.preview}
                  </p>
                )}
              </div>

              {active.source === "client" && (
                <form onSubmit={sendReply} className="p-5 border-t border-hairline space-y-3">
                  <label htmlFor="inbox-reply" className="block text-sm font-medium">
                    Reply in client portal
                  </label>
                  <textarea
                    id="inbox-reply"
                    rows={3}
                    required
                    placeholder="Write a message"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="w-full rounded-md border border-hairline bg-bg px-3 py-2 text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
                  />
                  <div className="flex items-center gap-3">
                    <Button type="submit" variant="primary" disabled={!reply.trim()}>
                      Send reply
                    </Button>
                    {replyStatus && <span className="text-sm text-text-3">{replyStatus}</span>}
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
