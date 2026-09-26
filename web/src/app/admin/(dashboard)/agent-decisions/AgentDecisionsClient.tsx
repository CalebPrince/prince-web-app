"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { RefreshCw, Settings2, Send, BellOff, Users, Brain } from "lucide-react";
import {
  PageHeader, Card, Button, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatLabel,
} from "@/components/admin/ui";

type Mode = "shadow" | "live" | "off";

type Held = {
  id: number;
  agent: string;
  kind: string;
  subject: string;
  body: string;
  importance: number | null;
  reason: string | null;
  duplicate_of: number | null;
  created_at: string;
};

type Recent = {
  id: number;
  area: "owner_message" | "customer_message" | "decision";
  agent: string;
  kind: string;
  ref: string | null;
  mode: string;
  jev_json: string | null;
  decision: string;
  detail: string | null;
  outcome: string | null;
  created_at: string;
};

export type AgentDecisionsData = {
  has_key: boolean;
  owner_mode: Mode;
  customer_mode: Mode;
  decisions_mode: Mode;
  digest_times: string;
  last_digest_slot: string | null;
  counts_7d: Record<string, { area: string; decision: string; n: number }[]>;
  held: Held[];
  recent: Recent[];
};

type View = "held" | "owner_message" | "customer_message" | "decision";

const AREA_LABEL: Record<string, string> = {
  owner_message: "Messages to you",
  customer_message: "Messages to customers",
  decision: "Agent decisions",
};

const DECISION_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  send: "green", pass: "green", allow: "green", ranked: "green", interested: "green", question: "green",
  hold: "amber", collapse: "amber", skip: "amber", send_back: "amber", raise: "amber", abandon: "amber",
  stop: "red", block: "red", unsubscribe: "red", not_interested: "red", needs_review: "amber",
};

function parse<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

function ModeCard({ icon, title, mode, text }: { icon: React.ReactNode; title: string; mode: Mode; text: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-text-3 flex items-center gap-2">
        {icon} {title}
      </div>
      <StatusPill status={mode} tone={mode === "live" ? "green" : mode === "off" ? "neutral" : "amber"} />
      <p className="text-xs text-text-3">{text}</p>
    </div>
  );
}

export default function AgentDecisionsClient({ initialData }: { initialData: AgentDecisionsData }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<View>("held");
  const [agent, setAgent] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      setData(await adminApi.get<AgentDecisionsData>("/api/v1/admin/agent-decisions"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the agent decisions.");
    } finally {
      setRefreshing(false);
    }
  };

  const sendDigest = async () => {
    setSending(true);
    setNote(null);
    try {
      const r = await adminApi.post<{ sent: number; note: string | null }>("/api/v1/admin/agent-decisions/digest");
      setNote(r.sent > 0 ? `Digest sent: ${r.sent} held update(s).` : r.note ?? "Nothing was waiting.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The digest did not send.");
    } finally {
      setSending(false);
    }
  };

  const agents = useMemo(() => {
    const set = new Set<string>();
    data.recent.forEach((r) => set.add(r.agent));
    data.held.forEach((h) => set.add(h.agent));
    return Array.from(set).sort();
  }, [data]);

  const shown = data.recent.filter((r) => r.area === view && (agent === "all" || r.agent === agent));
  const heldShown = data.held.filter((h) => agent === "all" || h.agent === agent);
  const countFor = (area: string) => data.recent.filter((r) => r.area === area).length;

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="All agents"
        title="What Jev decided across your team."
        description={"Jev is the decision layer for every agent: what they send you, what they send customers, and their own "
          + "judgment calls. The AI providers only write words afterwards. In shadow mode nothing changes: this page shows what "
          + "would have happened. Lisa has her own page."}
        actions={
          <>
            <Link href="/admin/settings?tab=agent-decisions">
              <Button variant="outline">
                <Settings2 className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            <Button variant="outline" onClick={sendDigest} disabled={sending || data.held.length === 0}>
              <Send className={`w-4 h-4 ${sending ? "animate-pulse" : ""}`} />
              {sending ? "Sending..." : "Send the digest now"}
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
          No TypeSafe API key is saved, so Jev cannot decide anything and every agent behaves as it did before. Add it under
          Settings, Integrations.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <ModeCard
          icon={<BellOff className="w-4 h-4" />}
          title="Messages to you"
          mode={data.owner_mode}
          text="Routine ones wait for the digest. Critical ones (outages, customers who need you) always go out at once."
        />
        <ModeCard
          icon={<Users className="w-4 h-4" />}
          title="Messages to customers"
          mode={data.customer_mode}
          text="Nurturer, drip email and drip WhatsApp. A pushy message is skipped, and someone who lost interest is stopped."
        />
        <ModeCard
          icon={<Brain className="w-4 h-4" />}
          title="Agent decisions"
          mode={data.decisions_mode}
          text="Nurturer replies, Chloe escalations, Chief's ordering, Allie's evidence check, Sage's spam check."
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs<View>
          value={view}
          onChange={setView}
          options={[
            { value: "held", label: "Held for the digest", count: data.held.length },
            { value: "owner_message", label: AREA_LABEL.owner_message, count: countFor("owner_message") },
            { value: "customer_message", label: AREA_LABEL.customer_message, count: countFor("customer_message") },
            { value: "decision", label: AREA_LABEL.decision, count: countFor("decision") },
          ]}
        />
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="h-9 rounded-md border border-hairline bg-bg px-3 text-sm"
          aria-label="Filter by agent"
        >
          <option value="all">All agents</option>
          {agents.map((a) => (
            <option key={a} value={a}>{formatLabel(a)}</option>
          ))}
        </select>
      </div>

      {view === "held" ? (
        heldShown.length === 0 ? (
          <Card>
            <div className="px-6 py-10 text-center text-text-3">
              Nothing is held. Routine messages wait here for the digest once messages to you are live
              (digest times: {data.digest_times}{data.last_digest_slot ? `, last sent ${data.last_digest_slot}` : ""}).
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {heldShown.map((h) => (
              <article key={h.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={h.duplicate_of ? "repeat" : "held"} tone="amber" />
                    <strong>{formatLabel(h.agent)}</strong>
                    <span className="text-xs text-text-3">{formatLabel(h.kind)}</span>
                  </div>
                  <span className="text-xs text-text-3">{formatDateTime(h.created_at)}</span>
                </div>
                <div className="text-base font-semibold">{h.subject}</div>
                <p className="text-sm text-text-2 whitespace-pre-line">{h.body.slice(0, 400)}</p>
                {h.reason && <p className="text-xs text-text-3">Held because: {h.reason}</p>}
              </article>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <Card>
          <div className="px-6 py-10 text-center text-text-3">
            Nothing recorded here yet. Entries appear as agents run once Jev is switched on.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
            const jev = parse<Record<string, unknown>>(r.jev_json);
            return (
              <article key={r.id} className="rounded-xl border border-hairline bg-bg-2 p-5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={r.decision} tone={DECISION_TONE[r.decision] ?? "neutral"} />
                    <strong>{formatLabel(r.agent)}</strong>
                    <span className="text-xs text-text-3">{formatLabel(r.kind)}</span>
                    <StatusPill status={r.mode} tone={r.mode === "live" ? "green" : "amber"} />
                  </div>
                  <span className="text-xs text-text-3">{formatDateTime(r.created_at)}</span>
                </div>
                {r.detail && <p className="text-sm text-text-2">{r.detail}</p>}
                {r.outcome && <p className="text-xs text-text-3">{r.outcome}</p>}
                {jev && !Array.isArray(jev) && (
                  <p className="text-xs text-text-3">
                    Jev:{" "}
                    {Object.entries(jev)
                      .filter(([, v]) => typeof v === "number" || typeof v === "string")
                      .map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(2)) : v}`)
                      .join(", ")}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
