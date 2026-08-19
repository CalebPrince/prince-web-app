"use client";

import { useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { FileCheck, UserPlus, Workflow } from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, Input,
  FilterBar, Modal, ErrorBanner,
} from "@/components/admin/ui";

export type Contact = {
  name: string | null;
  email: string;
  phone: string | null;
  sources: string[];
  /** Minor units (pesewas/cents). */
  lifetime_value: number;
  lifetime_value_currency: string;
  last_activity_at: string;
};

export type TimelineItem = {
  type: string;
  at: string;
  label: string;
  detail: string | null;
  data?: { id?: number };
};

export type PipelineSummary = {
  currency: string;
  open_pipeline_value: number;
  revenue_this_month: number;
  revenue_all_time: number;
  win_rate: number | null;
  proposals_accepted: number;
  proposals_declined: number;
  revenue_by_month: { month: string; amount: number }[];
  revenue_by_source: { label: string; amount: number }[];
};

const TYPE_LABEL: Record<string, string> = {
  inquiry: "Inquiry",
  marketing_lead: "Marketing outreach",
  client: "Client account",
  proposal: "Proposal",
  payment: "Payment",
  appointment: "Booking",
  drip: "Drip email",
  chat: "Live chat",
};

const SOURCE_BADGE: Record<string, string> = {
  inquiry: "Inquiry",
  marketing_lead: "Marketing",
  client: "Client",
  proposal: "Proposal",
  payment: "Payment",
  appointment: "Booking",
  drip: "Drip",
  chat: "Chat",
};

/** Values arrive in minor units across every contact endpoint. */
function money(subunits: number, currency: string) {
  return (
    (Number(subunits) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ` ${currency || ""}`
  ).trim();
}

function whenLabel(at?: string | null) {
  if (!at || at.startsWith("1970-01-01")) return "—";
  return new Date(at.replace(" ", "T") + "Z").toLocaleString();
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

export default function ContactsClient({
  initialContacts,
  summary,
}: {
  initialContacts: Contact[];
  summary: PipelineSummary | null;
}) {
  const [contacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => (c.name || "").toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const revenueData = useMemo(
    () =>
      (summary?.revenue_by_month ?? []).map((m) => ({
        name: monthLabel(m.month),
        amount: Number(m.amount) / 100,
      })),
    [summary]
  );

  const sourceTotal = (summary?.revenue_by_source ?? []).reduce((sum, s) => sum + s.amount, 0);

  const openContact = async (c: Contact) => {
    setActive(c);
    setTimeline(null);
    setActionMessage(null);
    setLoadingTimeline(true);
    try {
      const res = await adminApi.get<{ timeline: TimelineItem[] }>(
        `/api/v1/admin/contacts/${encodeURIComponent(c.email)}`
      );
      setTimeline(res.timeline);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that contact.");
      setActive(null);
    } finally {
      setLoadingTimeline(false);
    }
  };

  // Proposals need real scope/milestone input a single click can't supply, so
  // this deep-links into the Proposals page with as much prefilled as possible
  // rather than trying to replicate that form inside this modal.
  const startProposal = () => {
    if (!active) return;
    const inquiry = timeline?.find((item) => item.type === "inquiry");
    const params = new URLSearchParams();
    if (inquiry?.data?.id) params.set("inquiry_id", String(inquiry.data.id));
    else {
      params.set("client_name", active.name || "");
      params.set("client_email", active.email);
    }
    window.open(`/admin/proposals?${params}`, "_blank");
  };

  const invite = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await adminApi.post<{ email_sent: boolean }>("/api/v1/admin/clients/invite", {
        name: active.name || active.email,
        email: active.email,
      });
      setActionMessage({
        ok: true,
        text: res.email_sent
          ? `Portal invite sent to ${active.email}.`
          : "Portal invite created, but the email could not be confirmed as delivered.",
      });
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : "Could not invite." });
    } finally {
      setBusy(false);
    }
  };

  const enrollInDrip = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await adminApi.post("/api/v1/admin/drip/enrollments", {
        email: active.email,
        name: active.name || "",
      });
      setActionMessage({ ok: true, text: `Enrolled ${active.email} in the drip sequence.` });
    } catch (err) {
      setActionMessage({ ok: false, text: err instanceof Error ? err.message : "Could not enroll." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Everyone who ever reached you."
        description="One merged view over inquiries, marketing leads, clients, proposals, payments, bookings, drips and chats."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Open pipeline"
              value={money(summary.open_pipeline_value, summary.currency)}
            />
            <StatCard
              label="Win rate"
              value={summary.win_rate === null ? "—" : `${Math.round(summary.win_rate * 100)}%`}
              hint={
                summary.win_rate === null
                  ? "No decided proposals yet"
                  : `${summary.proposals_accepted} accepted · ${summary.proposals_declined} declined`
              }
            />
            <StatCard
              label="Revenue this month"
              value={money(summary.revenue_this_month, summary.currency)}
            />
            <StatCard
              label="Revenue all time"
              value={money(summary.revenue_all_time, summary.currency)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
            <Card title="Revenue by month" bodyClassName="p-4">
              {revenueData.length === 0 ? (
                <p className="text-sm text-text-3 py-8 text-center">No revenue yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenueData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--text-3)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} />
                    <Tooltip
                      formatter={(v: unknown) =>
                        [`${summary.currency} ${Number(v).toLocaleString()}`, "Revenue"] as [string, string]
                      }
                      contentStyle={{
                        background: "var(--bg)",
                        border: "1px solid var(--hairline)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="amount" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Revenue by source" bodyClassName="p-4 space-y-3">
              {summary.revenue_by_source.length === 0 ? (
                <p className="text-sm text-text-3">No revenue yet.</p>
              ) : (
                summary.revenue_by_source.map((s) => {
                  const pct = sourceTotal > 0 ? Math.round((s.amount / sourceTotal) * 100) : 0;
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{s.label}</span>
                        <span className="text-text-2 tabular-nums">
                          {money(s.amount, summary.currency)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          </div>
        </>
      )}

      <FilterBar>
        <Input
          className="w-auto min-w-72"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </FilterBar>

      <Card title={`Contacts (${visible.length})`}>
        <Table head={["Contact", "Seen in", "Lifetime value", "Last activity"]}>
          {visible.length === 0 ? (
            <EmptyRow colSpan={4}>No contacts on file yet.</EmptyRow>
          ) : (
            visible.map((c) => (
              <Row key={c.email} onClick={() => openContact(c)}>
                <Cell>
                  <div className="font-medium text-text">{c.name || "(no name on file)"}</div>
                  <div className="text-xs text-text-3 mt-0.5">
                    {c.email}
                    {c.phone && ` · ${c.phone}`}
                  </div>
                </Cell>
                <Cell>
                  <div className="flex flex-wrap gap-1">
                    {c.sources.map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-bg-3 text-text-2"
                      >
                        {SOURCE_BADGE[s] || s}
                      </span>
                    ))}
                  </div>
                </Cell>
                <Cell className="tabular-nums text-text-2">
                  {c.lifetime_value > 0 ? money(c.lifetime_value, c.lifetime_value_currency) : "—"}
                </Cell>
                <Cell className="text-text-3 whitespace-nowrap">{whenLabel(c.last_activity_at)}</Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>

      <Modal
        isOpen={!!active}
        onClose={() => setActive(null)}
        title={active?.name || "(no name on file)"}
        description={active ? active.email + (active.phone ? ` · ${active.phone}` : "") : undefined}
        size="lg"
      >
        {actionMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              actionMessage.ok
                ? "border-green-500/30 bg-green-500/10 text-green-500"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {actionMessage.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pb-4 border-b border-hairline">
          <Button variant="outline" onClick={startProposal}>
            <FileCheck className="w-4 h-4" />
            Start a proposal
          </Button>
          <Button variant="outline" onClick={invite} disabled={busy}>
            <UserPlus className="w-4 h-4" />
            Invite to portal
          </Button>
          <Button variant="outline" onClick={enrollInDrip} disabled={busy}>
            <Workflow className="w-4 h-4" />
            Enroll in drip
          </Button>
        </div>

        {loadingTimeline ? (
          <p className="text-sm text-text-3 py-6 text-center">Loading timeline…</p>
        ) : !timeline?.length ? (
          <p className="text-sm text-text-3 py-6 text-center">
            Nothing on file for this contact yet.
          </p>
        ) : (
          <div className="space-y-3">
            {timeline.map((item, i) => (
              <div key={i} className="border-l-2 border-hairline pl-4 py-1">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-bg-3 text-text-2">
                    {TYPE_LABEL[item.type] || item.type}
                  </span>
                  <span className="text-xs text-text-3">{whenLabel(item.at)}</span>
                </div>
                <div className="text-sm font-semibold">{item.label}</div>
                {item.detail && <div className="text-sm text-text-2">{item.detail}</div>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
