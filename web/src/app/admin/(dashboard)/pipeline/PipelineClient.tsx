"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminApi, asList } from "@/lib/api";
import {
  Inbox, Search, Send, CalendarCheck, FileText, Trophy, XCircle, Plus, Hand,
  Phone, MessageCircle, Mail, FilePlus, AlarmClock, Hourglass, Signpost,
  ArrowUpRight, Cpu, Clock, CheckCircle2, AlertTriangle, SlashSquare, Save,
} from "lucide-react";
import {
  PageHeader, Card, Button, Modal, Field, Input, Textarea, Select,
  FilterBar, Tabs, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type PipelineSource = { type: string; id: number; url: string };

export type AgentActivity = {
  kind: string;
  status: string;
  agent_key: string;
  attempts: number;
  max_attempts: number;
  updated_at: string;
  due_at: string | null;
  outcome: string | null;
  last_error: string | null;
  reschedule_reason: string | null;
};

export type PipelineLead = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  summary: string | null;
  stage: string;
  manual_stage: boolean | number;
  /** Minor units. */
  value: number | null;
  currency: string | null;
  created_at: string;
  latest_at: string;
  pipeline_updated_at: string | null;
  follow_up_at: string | null;
  next_action: string | null;
  notes: string | null;
  sources: PipelineSource[];
  agent_activity?: AgentActivity[];
  attribution?: {
    landing_path?: string;
    referrer?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
};

const STAGE_META: Record<string, { label: string; icon: typeof Inbox }> = {
  new: { label: "New", icon: Inbox },
  researching: { label: "Researching", icon: Search },
  contacted: { label: "Contacted", icon: Send },
  discovery: { label: "Discovery", icon: CalendarCheck },
  proposal: { label: "Proposal", icon: FileText },
  won: { label: "Won", icon: Trophy },
  lost: { label: "Lost", icon: XCircle },
};

const STAGES = Object.keys(STAGE_META);

const SOURCE_LABEL: Record<string, string> = {
  inquiry: "Inquiry", marketing: "Marketing", social: "Social", booking: "Booking",
  proposal: "Proposal", client: "Client", chat: "Chat", manual: "Manual",
};

/** How likely a deal at each stage is to close — drives the weighted forecast. */
const STAGE_PROBABILITY: Record<string, number> = {
  new: 0.1, researching: 0.2, contacted: 0.35, discovery: 0.55, proposal: 0.8, won: 1, lost: 0,
};

const AGENT_ICON: Record<string, typeof Clock> = {
  queued: Clock,
  leased: Cpu,
  completed: CheckCircle2,
  failed: AlertTriangle,
  cancelled: SlashSquare,
};

const isClosed = (l: PipelineLead) => ["won", "lost"].includes(l.stage);

const isDue = (l: PipelineLead) =>
  !!l.follow_up_at && new Date(l.follow_up_at).getTime() <= Date.now() && !isClosed(l);

/** No follow-up scheduled and nothing has happened for five days. */
const isStale = (l: PipelineLead) => {
  const activity = Math.max(
    new Date(l.latest_at).getTime(),
    new Date(l.pipeline_updated_at || 0).getTime()
  );
  return !isClosed(l) && !l.follow_up_at && Date.now() - activity >= 5 * 86400000;
};

function initials(name: string) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toUpperCase();
}

function leadMoney(l: PipelineLead) {
  return l.value
    ? `${l.currency} ${(Number(l.value) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : "";
}

/** Leads can carry different currencies, so totals stay split per currency. */
function totalsOf(leads: PipelineLead[], valueFor: (l: PipelineLead) => number = (l) => Number(l.value || 0)) {
  return leads.reduce<Record<string, number>>((totals, lead) => {
    const currency = lead.currency || "GHS";
    totals[currency] = (totals[currency] || 0) + valueFor(lead);
    return totals;
  }, {});
}

function totalsText(totals: Record<string, number>) {
  const rows = Object.entries(totals).filter(([, v]) => Math.round(v));
  return rows.length
    ? rows
        .map(([c, v]) => `${c} ${(Math.round(v) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
        .join(" · ")
    : "—";
}

function attributionLabel(lead: PipelineLead): string | null {
  const a = lead.attribution ?? {};
  if (a.utm_source) return [a.utm_source, a.utm_campaign].filter(Boolean).join(" · ");
  if (a.referrer) {
    try {
      return `From ${new URL(a.referrer).hostname.replace(/^www\./, "")}`;
    } catch {
      return "Referred visit";
    }
  }
  if (a.landing_path) return `Landed on ${a.landing_path.split("?")[0]}`;
  return null;
}

function ContactActions({ lead, labelled = false }: { lead: PipelineLead; labelled?: boolean }) {
  const phone = String(lead.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  const email = String(lead.email || "").trim();
  const cls =
    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-text-2 hover:bg-bg-3 hover:text-text transition-colors";

  return (
    <nav aria-label="Contact actions" className="flex flex-wrap gap-1">
      {phone && (
        <a href={`tel:${phone}`} className={cls} aria-label={`Call ${lead.name}`}>
          <Phone className="w-3.5 h-3.5" />
          {labelled && "Call"}
        </a>
      )}
      {digits && (
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          className={cls}
          aria-label={`WhatsApp ${lead.name}`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {labelled && "WhatsApp"}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={cls} aria-label={`Email ${lead.name}`}>
          <Mail className="w-3.5 h-3.5" />
          {labelled && "Email"}
        </a>
      )}
      <Link href="/admin/proposals" className={cls} aria-label="Open proposals">
        <FilePlus className="w-3.5 h-3.5" />
        {labelled && "Proposal"}
      </Link>
    </nav>
  );
}

export default function PipelineClient({
  initialLeads,
  settings,
}: {
  initialLeads: PipelineLead[];
  settings: Record<string, string>;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [focus, setFocus] = useState<"all" | "due" | "stale">("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "", email: "", phone: "", summary: "", estimated_value: "",
    currency: "GHS", stage: "new",
  });
  const [saving, setSaving] = useState(false);

  const [detailForm, setDetailForm] = useState({ next_action: "", follow_up_at: "", notes: "" });
  const [detailStatus, setDetailStatus] = useState("");

  const [staleEnabled, setStaleEnabled] = useState(settings.stale_lead_followup_enabled === "1");
  const [staleDays, setStaleDays] = useState(settings.stale_lead_followup_days || "5");
  const [staleMessage, setStaleMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const active = leads.filter((l) => !isClosed(l));
  const openLead = leads.find((l) => l.id === openId) ?? null;

  // Read the shareable filter state out of the URL once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    setQuery(searchParams.get("q") ?? "");
    setSource(searchParams.get("source") ?? "");
    const f = searchParams.get("focus");
    if (f === "due" || f === "stale") setFocus(f);
    const requested = Number(searchParams.get("open"));
    if (requested) setOpenId(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect filters back into the URL so a filtered board is copy-pasteable.
  // replaceState, not pushState — a search-as-you-type field shouldn't spam
  // browser history. Defaults are omitted entirely to keep shared URLs clean.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query) params.set("q", query); else params.delete("q");
    if (source) params.set("source", source); else params.delete("source");
    if (focus !== "all") params.set("focus", focus); else params.delete("focus");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
  }, [query, source, focus]);

  useEffect(() => {
    if (!openLead) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    setDetailForm({
      next_action: openLead.next_action || "",
      follow_up_at: openLead.follow_up_at || "",
      notes: openLead.notes || "",
    });
    setDetailStatus("");
  }, [openId]); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter(
      (lead) =>
        (!source || lead.sources.some((s) => s.type === source)) &&
        (!q ||
          [lead.name, lead.email, lead.phone, lead.summary].some((v) =>
            String(v || "").toLowerCase().includes(q)
          )) &&
        (focus === "all" || (focus === "due" && isDue(lead)) || (focus === "stale" && isStale(lead)))
    );
  }, [leads, query, source, focus]);

  const openOpportunities = visible.filter((l) => !isClosed(l) && Number(l.value));
  const wonOpportunities = visible.filter((l) => l.stage === "won" && Number(l.value));

  const move = async (id: number, stage: string) => {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    const previous = lead.stage;
    setLeads((prev) =>
      prev.map((l) => (l.id === id ? { ...l, stage, manual_stage: true } : l))
    );
    try {
      await adminApi.patch(`/api/v1/admin/pipeline/${id}`, { stage });
    } catch (err) {
      setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, stage: previous } : l)));
      setError(err instanceof Error ? err.message : "Could not update the lead stage.");
    }
  };

  const saveDetail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openLead) return;
    setDetailStatus("Saving…");
    try {
      await adminApi.patch(`/api/v1/admin/pipeline/${openLead.id}`, detailForm);
      setLeads((prev) => prev.map((l) => (l.id === openLead.id ? { ...l, ...detailForm } : l)));
      setDetailStatus("Saved");
    } catch (err) {
      setDetailStatus(err instanceof Error ? err.message : "Could not save.");
    }
  };

  const addLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await adminApi.post<{ id: number }>("/api/v1/admin/pipeline", newForm);
      setNewOpen(false);
      setLeads(asList<PipelineLead>(await adminApi.get("/api/v1/admin/pipeline")));
      setOpenId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the lead.");
    } finally {
      setSaving(false);
    }
  };

  const saveStaleSettings = async () => {
    try {
      await adminApi.put("/api/v1/admin/settings", {
        stale_lead_followup_enabled: staleEnabled ? "1" : "0",
        stale_lead_followup_days: staleDays.trim(),
      });
      setStaleMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setStaleMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Could not save.",
      });
    }
  };

  const weighted = totalsOf(
    openOpportunities,
    (l) => Number(l.value || 0) * (STAGE_PROBABILITY[l.stage] || 0)
  );

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Where every deal actually stands."
        description="One board across inquiries, marketing, chats and bookings — with a weighted revenue forecast."
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setNewForm({
                name: "", email: "", phone: "", summary: "", estimated_value: "",
                currency: "GHS", stage: "new",
              });
              setNewOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Add lead
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Active leads", String(visible.filter((l) => !isClosed(l)).length)],
          ["In discovery", String(visible.filter((l) => l.stage === "discovery").length)],
          ["Open proposals", String(visible.filter((l) => l.stage === "proposal").length)],
          ["Open pipeline", totalsText(totalsOf(openOpportunities))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-hairline bg-bg-2 p-5">
            <div className="text-xs font-medium text-text-3 uppercase tracking-wider">{label}</div>
            <div className="text-2xl font-bold tracking-tight mt-2 tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <FilterBar>
        <Input
          className="w-auto min-w-64"
          placeholder="Search leads…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Select className="w-auto min-w-44" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {Object.entries(SOURCE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </Select>
        <Tabs<"all" | "due" | "stale">
          value={focus}
          onChange={setFocus}
          options={[
            { value: "all", label: "All", count: leads.length },
            { value: "due", label: "Follow-up due", count: active.filter(isDue).length },
            { value: "stale", label: "Stale", count: active.filter(isStale).length },
          ]}
        />
      </FilterBar>

      {/* Board */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-4 min-w-max">
          {STAGES.map((stage) => {
            const meta = STAGE_META[stage];
            const Icon = meta.icon;
            const rows = visible.filter((l) => l.stage === stage);
            return (
              <section
                key={stage}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  move(Number(e.dataTransfer.getData("text/plain")), stage);
                }}
                className="w-72 flex-shrink-0 rounded-xl border border-hairline bg-bg-2/50"
              >
                <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-hairline">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    <Icon className="w-4 h-4 text-text-3" />
                    {meta.label}
                  </span>
                  <b className="text-xs text-text-3 tabular-nums">{rows.length}</b>
                </header>

                <div className="p-2 space-y-2 min-h-24">
                  {rows.length === 0 ? (
                    <p className="text-xs text-text-3 text-center py-6">Drop leads here</p>
                  ) : (
                    rows.map((lead) => {
                      const due = isDue(lead);
                      const stale = isStale(lead);
                      const uniqueSources = [
                        ...new Map(lead.sources.map((s) => [s.type, s])).values(),
                      ];
                      const attribution = attributionLabel(lead);
                      return (
                        <article
                          key={lead.id}
                          draggable
                          tabIndex={0}
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", String(lead.id))}
                          onClick={(e) => {
                            if (!(e.target as HTMLElement).closest("a,select,label,button")) {
                              setOpenId(lead.id);
                            }
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                              e.preventDefault();
                              setOpenId(lead.id);
                            }
                          }}
                          className={`rounded-lg border bg-bg p-3 space-y-2 cursor-pointer transition-colors hover:border-hairline-strong ${
                            due ? "border-amber-500/50" : stale ? "border-red-500/40" : "border-hairline"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <span className="w-7 h-7 rounded-full bg-bg-3 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                              {initials(lead.name)}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h5 className="text-sm font-semibold truncate">{lead.name}</h5>
                              <div className="text-xs text-text-3 truncate">
                                {lead.email || lead.phone || "No contact detail"}
                              </div>
                            </div>
                            {lead.manual_stage && (
                              <Hand className="w-3.5 h-3.5 text-text-3 flex-shrink-0" >
                                <title>Stage set manually</title>
                              </Hand>
                            )}
                          </div>

                          <p className="text-xs text-text-2 line-clamp-2">
                            {lead.summary || "No activity summary"}
                          </p>

                          {attribution && (
                            <div className="flex items-center gap-1.5 text-xs text-text-3">
                              <Signpost className="w-3 h-3" />
                              {attribution}
                            </div>
                          )}

                          <ContactActions lead={lead} />

                          {uniqueSources.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {uniqueSources.map((s) => (
                                <a
                                  key={s.type}
                                  href={s.url}
                                  title={`Open ${SOURCE_LABEL[s.type] || s.type}`}
                                  className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-bg-3 text-text-2 hover:text-text"
                                >
                                  {SOURCE_LABEL[s.type] || s.type}
                                </a>
                              ))}
                            </div>
                          )}

                          <label className="block">
                            <span className="sr-only">Stage</span>
                            <select
                              value={lead.stage}
                              onChange={(e) => move(lead.id, e.target.value)}
                              className="w-full rounded-md border border-hairline bg-bg-2 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                            >
                              {STAGES.map((s) => (
                                <option key={s} value={s}>{STAGE_META[s].label}</option>
                              ))}
                            </select>
                          </label>

                          {due ? (
                            <div className="flex items-center gap-1.5 text-xs text-amber-500">
                              <AlarmClock className="w-3.5 h-3.5" />
                              Follow-up due
                            </div>
                          ) : stale ? (
                            <div className="flex items-center gap-1.5 text-xs text-red-400">
                              <Hourglass className="w-3.5 h-3.5" />
                              No next move scheduled
                            </div>
                          ) : null}

                          <footer className="flex items-center justify-between text-xs pt-1 border-t border-hairline">
                            <time className="text-text-3">
                              {new Date(lead.latest_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </time>
                            {leadMoney(lead) && <strong className="tabular-nums">{leadMoney(lead)}</strong>}
                          </footer>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Forecast */}
      <Card bodyClassName="p-5 space-y-5">
        <div>
          <div className="text-xs font-semibold text-text-3 uppercase tracking-wider">
            Probability-weighted outlook
          </div>
          <h4 className="text-lg font-semibold mt-1">Revenue forecast</h4>
          <p className="text-sm text-text-2">
            Each opportunity is weighted by how far it has moved through the sales process.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-hairline p-4">
            <span className="text-xs text-text-3 uppercase tracking-wider block">Likely revenue</span>
            <strong className="text-2xl tabular-nums block mt-1">{totalsText(weighted)}</strong>
            <small className="text-xs text-text-3">Weighted open opportunities</small>
          </div>
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4">
            <span className="text-xs text-text-3 uppercase tracking-wider block">Won revenue</span>
            <strong className="text-2xl tabular-nums block mt-1 text-green-500">
              {totalsText(totalsOf(wonOpportunities))}
            </strong>
            <small className="text-xs text-text-3">Closed successfully</small>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {STAGES.filter((s) => !["won", "lost"].includes(s)).map((stage) => {
            const rows = openOpportunities.filter((l) => l.stage === stage);
            const probability = STAGE_PROBABILITY[stage];
            return (
              <div
                key={stage}
                className="flex items-center justify-between gap-3 rounded-md bg-bg-3 px-3 py-2"
              >
                <div>
                  <span className="text-sm block">{STAGE_META[stage].label}</span>
                  <small className="text-xs text-text-3">
                    {Math.round(probability * 100)}% likely
                  </small>
                </div>
                <strong className="text-sm tabular-nums">
                  {totalsText(totalsOf(rows, (l) => Number(l.value || 0) * probability))}
                </strong>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Stale follow-up settings */}
      <Card title="Stale-lead follow-ups" bodyClassName="p-5 space-y-4">
        <p className="text-sm text-text-2">
          When enabled, Nurturer schedules a follow-up task for any open lead with no next move after
          the chosen number of days.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent w-4 h-4"
              checked={staleEnabled}
              onChange={(e) => setStaleEnabled(e.target.checked)}
            />
            Enable automatic stale-lead follow-ups
          </label>
          <Field label="Days before a lead counts as stale">
            <Input
              type="number"
              min="1"
              className="w-32"
              value={staleDays}
              onChange={(e) => setStaleDays(e.target.value)}
            />
          </Field>
          <Button variant="primary" onClick={saveStaleSettings}>
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
        {staleMessage && (
          <p className={`text-sm ${staleMessage.ok ? "text-green-500" : "text-red-400"}`}>
            {staleMessage.text}
          </p>
        )}
      </Card>

      {/* Lead drawer */}
      <Modal
        isOpen={!!openLead}
        onClose={() => setOpenId(null)}
        title={openLead?.name ?? ""}
        description={openLead ? openLead.email || openLead.phone || "No contact detail" : undefined}
        size="lg"
      >
        {openLead && (
          <>
            <ContactActions lead={openLead} labelled />

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-hairline">
              {(
                [
                  ["Stage", STAGE_META[openLead.stage]?.label ?? openLead.stage],
                  ["Value", leadMoney(openLead) || "—"],
                  ["First seen", new Date(openLead.created_at).toLocaleDateString()],
                  ["Last activity", new Date(openLead.latest_at).toLocaleDateString()],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-text-3 uppercase tracking-wider">{label}</dt>
                  <dd className="text-sm font-semibold mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>

            <section>
              <h5 className="text-sm font-semibold mb-1">Latest context</h5>
              <p className="text-sm text-text-2">{openLead.summary || "No activity summary"}</p>
            </section>

            <section>
              <h5 className="text-sm font-semibold mb-2">Source history</h5>
              <div className="space-y-1">
                {[...new Map(openLead.sources.map((s) => [`${s.type}:${s.id}`, s])).values()].map(
                  (s) => (
                    <a
                      key={`${s.type}:${s.id}`}
                      href={s.url}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-3 transition-colors"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-text-3" />
                      <span>
                        <strong>{SOURCE_LABEL[s.type] || s.type}</strong>
                        <small className="text-text-3 ml-1.5">Record #{s.id}</small>
                      </span>
                    </a>
                  )
                )}
              </div>
            </section>

            {(openLead.attribution?.landing_path ||
              openLead.attribution?.referrer ||
              openLead.attribution?.utm_source) && (
              <section>
                <h5 className="text-sm font-semibold mb-2">First-touch attribution</h5>
                <dl className="space-y-1.5 text-sm">
                  {openLead.attribution?.landing_path && (
                    <div className="flex gap-2">
                      <dt className="text-text-3 w-28 flex-shrink-0">Landing page</dt>
                      <dd className="break-all">{openLead.attribution.landing_path}</dd>
                    </div>
                  )}
                  {openLead.attribution?.referrer && (
                    <div className="flex gap-2">
                      <dt className="text-text-3 w-28 flex-shrink-0">Referrer</dt>
                      <dd className="break-all">{openLead.attribution.referrer}</dd>
                    </div>
                  )}
                  {openLead.attribution?.utm_source && (
                    <div className="flex gap-2">
                      <dt className="text-text-3 w-28 flex-shrink-0">Campaign</dt>
                      <dd>
                        {[
                          openLead.attribution.utm_source,
                          openLead.attribution.utm_medium,
                          openLead.attribution.utm_campaign,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            <section>
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h5 className="text-sm font-semibold">Agent activity</h5>
                  <p className="text-xs text-text-3">
                    Scheduled work, attempts, and outcomes for this lead.
                  </p>
                </div>
                <Link
                  href="/admin/agent-tasks"
                  className="inline-flex items-center gap-1 text-sm hover:text-accent transition-colors whitespace-nowrap"
                >
                  Open queue
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {openLead.agent_activity?.length ? (
                <div className="space-y-2">
                  {openLead.agent_activity.map((row, i) => {
                    const Icon = AGENT_ICON[row.status] ?? Clock;
                    return (
                      <article key={i} className="flex gap-3 rounded-lg border border-hairline p-3">
                        <Icon className="w-4 h-4 text-text-3 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <header className="flex flex-wrap items-baseline gap-x-2 text-sm">
                            <strong>{row.kind.replace(/_/g, " ")}</strong>
                            <b className="text-xs text-text-3 uppercase tracking-wider">
                              {row.status}
                            </b>
                            <time className="text-xs text-text-3">
                              {formatDateTime(row.updated_at)}
                            </time>
                          </header>
                          <p className="text-sm text-text-2 mt-0.5">
                            {row.outcome ||
                              row.last_error ||
                              row.reschedule_reason ||
                              "Agent work recorded without a note."}
                          </p>
                          <small className="text-xs text-text-3">
                            {row.agent_key} · attempt {row.attempts}/{row.max_attempts}
                            {row.status === "queued" && row.due_at
                              ? ` · due ${formatDateTime(row.due_at)}`
                              : ""}
                          </small>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border border-hairline p-4">
                  <Cpu className="w-5 h-5 text-text-3 flex-shrink-0" />
                  <div>
                    <strong className="text-sm block">No agent work yet</strong>
                    <small className="text-text-3">
                      Scheduling a follow-up creates the first durable Nurturer task.
                    </small>
                  </div>
                </div>
              )}
            </section>

            <form onSubmit={saveDetail} className="space-y-4 pt-4 border-t border-hairline">
              <h5 className="text-sm font-semibold">Next move</h5>

              <Field label="Next action">
                <Input
                  maxLength={500}
                  placeholder="Example: Send revised scope"
                  value={detailForm.next_action}
                  onChange={(e) => setDetailForm({ ...detailForm, next_action: e.target.value })}
                />
              </Field>

              <Field label="Follow up">
                <Input
                  type="datetime-local"
                  value={detailForm.follow_up_at}
                  onChange={(e) => setDetailForm({ ...detailForm, follow_up_at: e.target.value })}
                />
              </Field>

              <Field label="Internal notes">
                <Textarea
                  rows={5}
                  maxLength={5000}
                  placeholder="Private context, objections, or decisions"
                  value={detailForm.notes}
                  onChange={(e) => setDetailForm({ ...detailForm, notes: e.target.value })}
                />
              </Field>

              <div className="flex items-center gap-3">
                <Button type="submit" variant="primary">Save lead</Button>
                {detailStatus && <span className="text-sm text-text-3">{detailStatus}</span>}
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* New lead */}
      <Modal
        isOpen={newOpen}
        onClose={() => setNewOpen(false)}
        title="Add a lead"
        description="For opportunities that never came through the site."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addLead} disabled={saving || !newForm.name.trim()}>
              {saving ? "Adding…" : "Add lead"}
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input
            required
            value={newForm.name}
            onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input
              type="email"
              value={newForm.email}
              onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
            />
          </Field>
          <Field label="Phone">
            <Input
              value={newForm.phone}
              onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Summary">
          <Textarea
            rows={3}
            value={newForm.summary}
            onChange={(e) => setNewForm({ ...newForm, summary: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Estimated value">
            <Input
              type="number"
              min="0"
              value={newForm.estimated_value}
              onChange={(e) => setNewForm({ ...newForm, estimated_value: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <Input
              maxLength={8}
              value={newForm.currency}
              onChange={(e) => setNewForm({ ...newForm, currency: e.target.value })}
            />
          </Field>
          <Field label="Stage">
            <Select
              value={newForm.stage}
              onChange={(e) => setNewForm({ ...newForm, stage: e.target.value })}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{STAGE_META[s].label}</option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
