"use client";

import { useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { RefreshCw, Play, Settings2, Brain, Send, BellRing, Banknote } from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

type Mode = "shadow" | "live" | "off";

type Followup = {
  id: number;
  contact_name: string | null;
  phone: string;
  mode: string;
  window_state: "in_window" | "out_of_window";
  action: "none" | "text" | "template";
  template_key: string | null;
  body_text: string | null;
  decision_json: string | null;
  skip_reason: string | null;
  status: "shadow" | "sent" | "failed" | "skipped";
  error: string | null;
  created_at: string;
};

type Judgment = {
  id: number;
  channel: string;
  mode: string;
  signals_json: string;
  actions_json: string;
  created_at: string;
  client_name: string | null;
};

type Quote = {
  id: number;
  contact_name: string | null;
  contact_phone: string | null;
  channel: string;
  project_type: string | null;
  low_ghs: number | null;
  high_ghs: number | null;
  decision: "list" | "reduced" | "adjusted_up" | "estimate" | "ask_more" | "owner_review";
  reason: string | null;
  basis_json: string | null;
  quoted_to_customer: number;
  summary_sent_at: string | null;
  updated_at: string;
};

type OwnerAlert = {
  id: number;
  reason: string;
  summary: string | null;
  mode: string;
  delivered: number;
  created_at: string;
};

export type LisaDecisionsData = {
  has_key: boolean;
  jev_mode: Mode;
  followup_mode: Mode;
  quote_mode: Mode;
  quiet_now: boolean;
  timing: { first: number; second: number; max_days: number; max_per_episode: number };
  template: { status: string; content_sid: string | null };
  counts_7d: Record<string, number>;
  followups: Followup[];
  judgments: Judgment[];
  quotes: Quote[];
  owner_alerts: OwnerAlert[];
};

type View = "quotes" | "followups" | "readings" | "alerts";

const ghs = (n: number | null) => (n === null ? "" : `GHS ${Math.round(n).toLocaleString("en-US")}`);

const DECISION_LABEL: Record<Quote["decision"], string> = {
  list: "Exact list price",
  reduced: "Reduced",
  adjusted_up: "Added to list price",
  estimate: "Estimate, not on list",
  ask_more: "Needs more detail",
  owner_review: "For you to price",
};

const ALERT_LABEL: Record<string, string> = {
  needs_you: "Needs you",
  hot_lead: "Hot lead",
  urgent: "Urgent",
  quote_now: "Quote needs you",
  quote_summary: "Quote summary",
  cold_hot_lead: "Hot lead going cold",
};

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function ModePill({ mode }: { mode: Mode }) {
  return <StatusPill status={mode} tone={mode === "live" ? "green" : mode === "off" ? "neutral" : "amber"} />;
}

export default function LisaDecisionsClient({ initialData }: { initialData: LisaDecisionsData }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("quotes");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      setData(await adminApi.get<LisaDecisionsData>("/api/v1/admin/lisa-decisions"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Lisa's decisions.");
    } finally {
      setRefreshing(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setNote(null);
    try {
      const r = await adminApi.post<{
        mode: string; considered: number; sent: number; shadow: number; skipped: number; failed: number;
        note: string | null; quote_summaries: number;
      }>("/api/v1/admin/lisa-decisions/run");
      setNote(
        r.note
          ? r.note
          : `Follow-up pass (${r.mode}): ${r.considered} looked at, ${r.sent} sent, ${r.shadow} would send, ${r.skipped} skipped, ${r.failed} failed. Quote summaries handled: ${r.quote_summaries}.`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The run did not work.");
    } finally {
      setRunning(false);
    }
  };

  const c = data.counts_7d;
  const templateReady = data.template.status === "approved";

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Lisa"
        title="What Jev decided for Lisa."
        description={"Jev reads every customer message and every cold conversation and makes the decisions. The AI providers only "
          + "write Lisa's words afterwards. In shadow mode nothing is sent to anyone: this page shows what would have happened."}
        actions={
          <>
            <Link href="/admin/settings?tab=lisa-decisions">
              <Button variant="outline">
                <Settings2 className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Button variant="outline" onClick={runNow} disabled={running}>
              <Play className={`w-4 h-4 ${running ? "animate-pulse" : ""}`} />
              {running ? "Running..." : "Run follow-up pass now"}
            </Button>
            <Button variant="outline" onClick={load} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {note && <div className="rounded-md border border-hairline bg-bg-2 px-4 py-3 text-sm text-text-2">{note}</div>}

      {!data.has_key && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-text-2">
          No TypeSafe API key is saved, so Jev cannot decide anything and Lisa behaves as she did before. Add it under
          Settings, Integrations.
        </div>
      )}
      {!templateReady && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-text-2">
          The conversation follow-up template is {data.template.status.replace(/_/g, " ")}. Until Meta approves it, Lisa can
          only nudge people inside the 24 hour window and cannot reach anyone after it closes. Create and submit it under
          Settings, WhatsApp and phone, Templates (or Marketing Leads, Templates).
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-3 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Decisions
          </div>
          <ModePill mode={data.jev_mode} />
          <p className="text-xs text-text-3">Reads each message: wants a person, upset, opting out, hot lead, urgent.</p>
        </div>
        <div className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-3 flex items-center gap-2">
            <Send className="w-4 h-4" /> Follow-ups
          </div>
          <ModePill mode={data.followup_mode} />
          <p className="text-xs text-text-3">
            Nudges at {data.timing.first}h and {data.timing.second}h inside the window, then the approved template. Up to{" "}
            {data.timing.max_per_episode} per silence, for {data.timing.max_days} days.
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-text-3 flex items-center gap-2">
            <Banknote className="w-4 h-4" /> Quoting
          </div>
          <ModePill mode={data.quote_mode} />
          <p className="text-xs text-text-3">Prices from your Pricing page. Estimates and anything unusual come to you.</p>
        </div>
        <StatCard
          label="Follow-ups, last 7 days"
          value={(c.sent ?? 0) + (c.shadow ?? 0)}
          icon={<BellRing className="w-4 h-4" />}
          hint={`${c.sent ?? 0} sent, ${c.shadow ?? 0} would send, ${c.skipped ?? 0} skipped${data.quiet_now ? ". Quiet hours now" : ""}`}
        />
      </div>

      <Tabs<View>
        value={view}
        onChange={setView}
        options={[
          { value: "quotes", label: "Quotes", count: data.quotes.length },
          { value: "followups", label: "Follow-ups", count: data.followups.length },
          { value: "readings", label: "Message readings", count: data.judgments.length },
          { value: "alerts", label: "Alerts to you", count: data.owner_alerts.length },
        ]}
      />

      {view === "quotes" && (
        <Section empty={data.quotes.length === 0} emptyText="No project or price conversations yet. They appear here as customers describe what they need.">
          {data.quotes.map((q) => {
            const basis = parse<{ list_price: number | null; adjustments: string[] }>(q.basis_json);
            return (
              <article key={q.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={DECISION_LABEL[q.decision]} tone={q.decision === "owner_review" || q.decision === "estimate" ? "amber" : "green"} />
                    <strong>{q.contact_name || "Unnamed customer"}</strong>
                    <span className="text-xs text-text-3">
                      {q.channel === "whatsapp" ? "WhatsApp" : "Website chat"}
                      {q.project_type ? `, ${formatLabel(q.project_type)}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-text-3">{formatDateTime(q.updated_at)}</span>
                </div>
                {q.low_ghs !== null && (
                  <div className="text-base font-semibold">
                    {q.high_ghs !== null && q.high_ghs !== q.low_ghs ? `${ghs(q.low_ghs)} to ${ghs(q.high_ghs)}` : ghs(q.low_ghs)}
                    {basis?.list_price ? (
                      <span className="ml-2 text-xs font-normal text-text-3">list price {ghs(basis.list_price)}</span>
                    ) : null}
                  </div>
                )}
                <p className="text-sm text-text-2">{q.reason}</p>
                {basis?.adjustments && basis.adjustments.length > 0 && (
                  <p className="text-xs text-text-3">{basis.adjustments.join(". ")}</p>
                )}
                <p className="text-xs text-text-3">
                  {q.quoted_to_customer ? "Lisa shared this figure with the customer." : "Lisa did not share this figure."}{" "}
                  {q.summary_sent_at ? `Summary sent to you ${formatDateTime(q.summary_sent_at)}.` : "Summary to you is still pending."}
                </p>
              </article>
            );
          })}
        </Section>
      )}

      {view === "followups" && (
        <Section empty={data.followups.length === 0} emptyText="No follow-up decisions yet. They appear once a WhatsApp conversation has gone quiet.">
          {data.followups.map((f) => {
            const d = parse<{ status?: string; buying_intent?: number; welcome?: number; opt_out?: number }>(f.decision_json);
            return (
              <article key={f.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill
                      status={f.status === "shadow" ? "would send" : f.status}
                      tone={f.status === "sent" ? "green" : f.status === "failed" ? "red" : f.status === "shadow" ? "amber" : "neutral"}
                    />
                    <strong>{f.contact_name || f.phone}</strong>
                    <span className="text-xs text-text-3">
                      {f.window_state === "in_window" ? "Inside the 24 hour window" : "Window closed"}
                      {f.action !== "none" ? `, ${f.action === "text" ? "free text" : "approved template"}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-text-3">{formatDateTime(f.created_at)}</span>
                </div>
                {f.body_text && <p className="rounded-md bg-bg-3 px-3 py-2 text-sm whitespace-pre-line">{f.body_text}</p>}
                {f.skip_reason && <p className="text-sm text-text-2">Skipped: {f.skip_reason}</p>}
                {f.error && <p className="text-sm text-red-400">{f.error}</p>}
                {d && (
                  <p className="text-xs text-text-3">
                    Jev: {d.status ? formatLabel(d.status) : ""}
                    {typeof d.buying_intent === "number" ? `, interest ${d.buying_intent.toFixed(1)}/3` : ""}
                    {typeof d.welcome === "number" ? `, welcome ${Math.round(d.welcome * 100)}%` : ""}
                    {typeof d.opt_out === "number" ? `, opt-out ${Math.round(d.opt_out * 100)}%` : ""}
                  </p>
                )}
              </article>
            );
          })}
        </Section>
      )}

      {view === "readings" && (
        <Section empty={data.judgments.length === 0} emptyText="No messages read yet. Each customer message is recorded here once Jev is on.">
          {data.judgments.map((j) => {
            const s = parse<{
              intent: string; buying_intent: number; urgency: number; wants_human: number; upset: number; opt_out: number;
            }>(j.signals_json);
            const actions = parse<{ type: string; reason: string; result: string }[]>(j.actions_json) ?? [];
            return (
              <article key={j.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <ModePill mode={j.mode as Mode} />
                    <strong>{j.client_name || "Visitor"}</strong>
                    <span className="text-xs text-text-3">{j.channel === "whatsapp" ? "WhatsApp" : "Website chat"}</span>
                  </div>
                  <span className="text-xs text-text-3">{formatDateTime(j.created_at)}</span>
                </div>
                {s && (
                  <p className="text-sm text-text-2">
                    {formatLabel(s.intent)}. Buying {s.buying_intent.toFixed(1)}/3, urgency {s.urgency.toFixed(1)}/2, wants a person{" "}
                    {Math.round(s.wants_human * 100)}%, upset {Math.round(s.upset * 100)}%, opting out {Math.round(s.opt_out * 100)}%.
                  </p>
                )}
                {actions.length === 0 ? (
                  <p className="text-xs text-text-3">No action needed.</p>
                ) : (
                  <ul className="text-xs text-text-3 space-y-1">
                    {actions.map((a, i) => (
                      <li key={i}>
                        {formatLabel(a.type)} ({a.reason}): {a.result}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </Section>
      )}

      {view === "alerts" && (
        <Section empty={data.owner_alerts.length === 0} emptyText="Nothing has needed your attention yet.">
          {data.owner_alerts.map((a) => (
            <article key={a.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusPill
                    status={a.mode === "shadow" ? "would send" : a.delivered ? "sent" : "not delivered"}
                    tone={a.mode === "shadow" ? "amber" : a.delivered ? "green" : "red"}
                  />
                  <strong>{ALERT_LABEL[a.reason] ?? formatLabel(a.reason)}</strong>
                </div>
                <span className="text-xs text-text-3">{formatDateTime(a.created_at)}</span>
              </div>
              <p className="text-sm text-text-2">{a.summary}</p>
            </article>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ empty, emptyText, children }: { empty: boolean; emptyText: string; children: React.ReactNode }) {
  if (empty) {
    return (
      <Card>
        <div className="px-6 py-10 text-center text-text-3">{emptyText}</div>
      </Card>
    );
  }
  return <div className="space-y-3">{children}</div>;
}
