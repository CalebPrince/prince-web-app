"use client";

import { useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  RefreshCw, PhoneIncoming, PhoneOutgoing, MessageSquareText, Globe, Phone,
  CheckCircle2, Circle, MicOff, Target,
} from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, Modal,
  StatusPill, ErrorBanner,
} from "@/components/admin/ui";

export type VoiceTurn = { role: string; text: string };

export type VoiceSession = {
  id: number;
  channel: string;
  provider: string | null;
  turn_count: number;
  updated_at: string;
  last_question: string | null;
  call_direction: string | null;
  call_status: string | null;
  call_business_name: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  to_number: string | null;
  transcript: VoiceTurn[];
};

export type CallLog = {
  id: number;
  session_id: number | null;
  direction: string;
  from_number: string | null;
  to_number: string | null;
  status: string;
  email_followup_status: string | null;
  whatsapp_followup_status: string | null;
  duration_seconds: number | null;
  lead_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type VoiceDemoStats = {
  summary: { sessions?: number; engaged?: number; web_sessions?: number; phone_sessions?: number };
  events: { event_type: string; count: number }[];
  recent: VoiceSession[];
  call_logs: CallLog[];
  readiness: { label: string; complete: boolean }[];
  marketing_calls: {
    queued?: number;
    ai_calls_today?: number;
    ai_call_daily_cap?: number;
    ai_calls_remaining?: number;
  };
  telephony_enabled: boolean;
  webhook_url: string;
  post_call_webhook_url: string;
};

const GOOD_CALL_STATES = ["completed", "in-progress", "ringing"];
const BAD_CALL_STATES = ["failed", "busy", "no-answer", "canceled"];

function callTone(status?: string | null): "green" | "red" | "neutral" {
  const s = String(status || "unknown").toLowerCase();
  if (GOOD_CALL_STATES.includes(s)) return "green";
  if (BAD_CALL_STATES.includes(s)) return "red";
  return "neutral";
}

function timeAgo(value?: string | null) {
  if (!value) return "Unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value.replace(" ", "T") + "Z").getTime()) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function duration(value?: number | null) {
  const seconds = Math.max(0, Number(value || 0));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** What the visitor actually did, when no question was captured. */
function sessionActivity(row: VoiceSession) {
  if (row.last_question) return row.last_question;
  if (row.call_direction === "outbound") {
    const business = row.call_business_name || "Outbound recipient";
    return `${business}: call ${String(row.call_status || "completed").replace(/-/g, " ")}; no speech captured`;
  }
  if (row.channel === "phone") return "Phone call opened; no speech captured";
  return "Demo opened without a question";
}

export default function VoiceDemoClient({ initialStats }: { initialStats: VoiceDemoStats }) {
  const [stats, setStats] = useState(initialStats);
  const [active, setActive] = useState<VoiceSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setRefreshing(true);
    try {
      setStats(await adminApi.get<VoiceDemoStats>("/api/v1/admin/voice-demo/stats"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load voice demo stats.");
    } finally {
      setRefreshing(false);
    }
  };

  const eventCount = (key: string) =>
    Number(stats.events.find((e) => e.event_type === key)?.count || 0);

  const funnel: [string, number][] = [
    ["Demo started", eventCount("demo_started")],
    ["Question answered", eventCount("answer_received")],
    ["CTA clicked", eventCount("cta_clicked")],
  ];
  const maxFunnel = Math.max(1, ...funnel.map(([, v]) => v));

  const openSession = (sessionId: number | null) => {
    if (sessionId == null) return;
    const row = stats.recent.find((s) => Number(s.id) === Number(sessionId));
    if (row) setActive(row);
  };

  const calls = stats.marketing_calls ?? {};

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="System"
        title="How the voice demo is performing."
        description="Browser demo sessions, ElevenLabs phone calls, and what Lisa actually said."
        actions={
          <Button variant="outline" onClick={load} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh logs
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sessions" value={stats.summary.sessions || 0} hint="All demo opens" />
        <StatCard label="Engaged" value={stats.summary.engaged || 0} hint="Asked at least once" />
        <StatCard label="Web" value={stats.summary.web_sessions || 0} hint="Browser demo" />
        <StatCard label="Phone" value={stats.summary.phone_sessions || 0} hint="ElevenLabs calls" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Funnel" bodyClassName="p-5 space-y-4">
          {funnel.map(([label, value]) => (
            <div key={label}>
              <div className="flex justify-between text-sm mb-1">
                <span>{label}</span>
                <strong className="tabular-nums">{value}</strong>
              </div>
              <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full"
                  style={{ width: `${Math.round((value / maxFunnel) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </Card>

        <Card title="Phone status" bodyClassName="p-5 space-y-3">
          <StatusPill
            status={stats.telephony_enabled ? "Enabled" : "Not active"}
            tone={stats.telephony_enabled ? "green" : "neutral"}
          />

          <div>
            <p className="text-xs text-text-3 mb-1">Conversation initiation webhook</p>
            <code className="block text-xs break-all bg-bg-3 rounded px-2 py-1.5">
              {stats.webhook_url || "—"}
            </code>
          </div>

          <div>
            <p className="text-xs text-text-3 mb-1">Post-call webhook</p>
            <code className="block text-xs break-all bg-bg-3 rounded px-2 py-1.5">
              {stats.post_call_webhook_url || "—"}
            </code>
          </div>

          <p className="text-xs text-text-3">
            {stats.telephony_enabled
              ? "Verified inbound calls use Lisa's customer-service prompt."
              : "Save the ElevenLabs phone agent ID and phone number ID in Settings after connecting a SIP trunk."}
          </p>
        </Card>

        <Card title="ElevenLabs readiness" bodyClassName="p-5 space-y-2">
          {stats.readiness.length === 0 ? (
            <p className="text-sm text-text-3">No readiness checks reported.</p>
          ) : (
            stats.readiness.map((item) => (
              <div key={item.label} className="flex items-center gap-2 rounded-md bg-bg-3 px-3 py-2">
                {item.complete ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-text-3 flex-shrink-0" />
                )}
                <span className="text-sm">{item.label}</span>
              </div>
            ))
          )}
        </Card>

        <Card title="Marketing calls" bodyClassName="p-5 space-y-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-xs text-text-3 block">Phone-only leads</span>
              <strong className="text-xl tabular-nums">{Number(calls.queued || 0)}</strong>
            </div>
            <div>
              <span className="text-xs text-text-3 block">Lisa calls today</span>
              <strong className="text-xl tabular-nums">
                {Number(calls.ai_calls_today || 0)} / {Number(calls.ai_call_daily_cap || 5)}
              </strong>
            </div>
            <div>
              <span className="text-xs text-text-3 block">Remaining</span>
              <strong className="text-xl tabular-nums">{Number(calls.ai_calls_remaining || 0)}</strong>
            </div>
          </div>

          <p className="text-xs text-text-2 rounded-lg border border-hairline px-3 py-2">
            Each AI call requires your approval and confirmation that the recipient requested or
            consented to it. Lisa then places that one call; there is no unattended batch dialing.
          </p>

          <Link
            href="/admin/marketing-leads"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
          >
            <Target className="w-4 h-4" />
            Open call list
          </Link>
        </Card>
      </div>

      <Card title="Call logs">
        <Table
          head={["Direction", "From", "To", "Status", "Email", "WhatsApp", "Duration", "Lead", "Started", ""]}
        >
          {stats.call_logs.length === 0 ? (
            <EmptyRow colSpan={10}>No calls logged yet.</EmptyRow>
          ) : (
            stats.call_logs.map((row) => {
              const outbound = row.direction === "outbound";
              const started = row.created_at || row.updated_at;
              return (
                <Row key={row.id}>
                  <Cell>
                    <span className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap">
                      {outbound ? (
                        <PhoneOutgoing className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <PhoneIncoming className="w-3.5 h-3.5 text-green-500" />
                      )}
                      {outbound ? "Outbound" : "Inbound"}
                    </span>
                  </Cell>
                  <Cell>
                    <a href={`tel:${row.from_number || ""}`} className="hover:text-accent">
                      {row.from_number || "Unknown"}
                    </a>
                  </Cell>
                  <Cell>
                    <a href={`tel:${row.to_number || ""}`} className="hover:text-accent">
                      {row.to_number || "Unknown"}
                    </a>
                  </Cell>
                  <Cell><StatusPill status={row.status} tone={callTone(row.status)} /></Cell>
                  <Cell>
                    {row.email_followup_status && row.email_followup_status !== "not_requested" ? (
                      <StatusPill
                        status={row.email_followup_status}
                        tone={callTone(row.email_followup_status)}
                      />
                    ) : (
                      <span className="text-xs text-text-3">Not requested</span>
                    )}
                  </Cell>
                  <Cell>
                    {row.whatsapp_followup_status ? (
                      <StatusPill
                        status={row.whatsapp_followup_status}
                        tone={callTone(row.whatsapp_followup_status)}
                      />
                    ) : (
                      <span className="text-xs text-text-3">Not requested</span>
                    )}
                  </Cell>
                  <Cell className="tabular-nums">{duration(row.duration_seconds)}</Cell>
                  <Cell className="text-text-2">
                    {row.lead_name || (outbound ? "Manual / unlinked" : "Caller")}
                  </Cell>
                  <Cell className="text-text-3 whitespace-nowrap" >{timeAgo(started)}</Cell>
                  <Cell>
                    {row.session_id ? (
                      <Button variant="outline" onClick={() => openSession(row.session_id)}>
                        <MessageSquareText className="w-4 h-4" />
                        View
                      </Button>
                    ) : (
                      <span className="text-xs text-text-3">Unavailable</span>
                    )}
                  </Cell>
                </Row>
              );
            })
          )}
        </Table>
      </Card>

      <Card title="Recent sessions">
        <Table head={["Channel", "Activity", "Turns", "Provider", "Updated", ""]}>
          {stats.recent.length === 0 ? (
            <EmptyRow colSpan={6}>No demo sessions yet.</EmptyRow>
          ) : (
            stats.recent.map((row) => (
              <Row key={row.id}>
                <Cell>
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    {row.channel === "phone" ? (
                      <Phone className="w-3.5 h-3.5 text-text-3" />
                    ) : (
                      <Globe className="w-3.5 h-3.5 text-text-3" />
                    )}
                    {row.channel}
                  </span>
                </Cell>
                <Cell className="text-text-2 max-w-md">{sessionActivity(row)}</Cell>
                <Cell className="tabular-nums">{Number(row.turn_count || 0)}</Cell>
                <Cell className="text-text-2">{row.provider || "fallback"}</Cell>
                <Cell className="text-text-3 whitespace-nowrap">{timeAgo(row.updated_at)}</Cell>
                <Cell>
                  <Button variant="outline" onClick={() => setActive(row)}>
                    <MessageSquareText className="w-4 h-4" />
                    View
                  </Button>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>

      <Modal
        isOpen={!!active}
        onClose={() => setActive(null)}
        title={
          active?.call_business_name ||
          (active?.channel === "phone"
            ? (active?.call_direction === "outbound" ? active?.to_number : active?.from_number) ||
              "Lisa voice conversation"
            : "Website visitor")
        }
        size="lg"
      >
        {active && (
          <>
            <dl className="grid sm:grid-cols-3 gap-x-4 gap-y-3 pb-4 border-b border-hairline">
              {(
                [
                  [
                    "Channel",
                    active.call_direction === "outbound"
                      ? "Outbound"
                      : active.channel === "phone"
                        ? "Inbound"
                        : "Browser demo",
                  ],
                  [
                    "Status",
                    String(
                      active.call_status || (active.channel === "web" ? "completed" : "unknown")
                    ).replace(/-/g, " "),
                  ],
                  [
                    "Duration",
                    active.channel === "phone" ? duration(active.duration_seconds) : "Web session",
                  ],
                  ["Provider", active.provider || "fallback"],
                  ["From", active.from_number || "Not recorded"],
                  ["To", active.to_number || "Not recorded"],
                ] as [string, string][]
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-text-3 uppercase tracking-wider">{label}</dt>
                  <dd className="text-sm mt-0.5">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="text-xs text-text-3">
              {active.transcript?.length ?? 0} turn{(active.transcript?.length ?? 0) === 1 ? "" : "s"}
            </p>

            {active.transcript?.length ? (
              <div className="space-y-3">
                {active.transcript.map((turn, i) => {
                  const isLisa = turn.role === "assistant";
                  return (
                    <article key={i} className="flex gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                          isLisa ? "bg-accent text-on-accent" : "bg-bg-3 text-text-2"
                        }`}
                      >
                        {isLisa ? "L" : "C"}
                      </span>
                      <div className="min-w-0">
                        <header className="flex items-baseline gap-2 mb-0.5">
                          <strong className="text-sm">{isLisa ? "Lisa" : "Customer"}</strong>
                          <span className="text-xs text-text-3">Turn {i + 1}</span>
                        </header>
                        <p className="text-sm text-text-2">{turn.text}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <MicOff className="w-7 h-7 mx-auto text-text-3 mb-2" />
                <strong className="block text-sm">No speech was captured</strong>
                <p className="text-sm text-text-3 mt-1">
                  The call connected, but no customer or Lisa speech was stored for this session.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
