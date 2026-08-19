"use client";

import { useEffect, useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import { PenLine, ArrowUpRight } from "lucide-react";
import { Card, StatCard, Button, Select, FilterBar, ErrorBanner } from "@/components/admin/ui";

export type ChiefBrief = {
  brief_date: string;
  headline: string;
  body: string;
  provider: string | null;
  emailed_at: string | null;
};

export type ChiefAgent = {
  name: string;
  role: string;
  state: string;
  runs: string;
  actions: number;
  config_note?: string | null;
  did?: { label: string; count: number; context?: boolean }[];
};

export type ChiefDashboard = {
  snapshot: {
    agents?: ChiefAgent[];
    waiting_on_you?: { label: string; count: number; url: string }[];
    command_center?: { actions?: number; did?: { label: string; count: number }[] };
    since?: string;
  };
  briefs?: { brief_date: string; headline: string }[];
};

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

const FOCUSES = [
  { value: "all", label: "All agents" },
  { value: "active", label: "Active only" },
  { value: "always_on", label: "Always-on" },
  { value: "on_demand", label: "On demand" },
];

const VIEW_KEY = "chief-reporting-view-v1";

function briefDate(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Chief's daily brief plus the verified-team-output dashboard.
 *
 * Both /admin/chief and /admin/team show this — the legacy admin duplicated the
 * whole thing across two pages, so it lives here once instead. The window/focus
 * pair is a per-reader preference shared by both pages via one localStorage key,
 * exactly as the legacy pages did.
 */
export function ChiefReport({
  initialBrief,
  initialDashboard,
}: {
  initialBrief: ChiefBrief | null;
  initialDashboard: ChiefDashboard;
}) {
  const [brief, setBrief] = useState(initialBrief);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [hours, setHours] = useState("24");
  const [focus, setFocus] = useState("all");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(VIEW_KEY) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from localStorage on mount
      if (saved.window) setHours(String(saved.window));
      if (saved.focus) setFocus(String(saved.focus));
    } catch {
      /* corrupt preference — fall back to the defaults */
    }
  }, []);

  const persist = (nextWindow: string, nextFocus: string) => {
    localStorage.setItem(VIEW_KEY, JSON.stringify({ window: nextWindow, focus: nextFocus }));
  };

  const loadDashboard = async (nextHours: string) => {
    try {
      setDashboard(
        await adminApi.get<ChiefDashboard>(
          `/api/v1/admin/chief/dashboard?hours=${encodeURIComponent(nextHours)}`
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Chief's report.");
    }
  };

  const changeWindow = (next: string) => {
    setHours(next);
    persist(next, focus);
    loadDashboard(next);
  };

  const changeFocus = (next: string) => {
    setFocus(next);
    persist(hours, next);
  };

  const writeBrief = async () => {
    setWriting(true);
    try {
      const result = await adminApi.post<{ brief: ChiefBrief }>("/api/v1/admin/chief/brief", {
        hours: 24,
      });
      setBrief(result.brief);
      await loadDashboard(hours);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not write the brief.");
    } finally {
      setWriting(false);
    }
  };

  const openBrief = async (date: string) => {
    try {
      const result = await adminApi.get<{ brief: ChiefBrief | null }>(
        `/api/v1/admin/chief/brief?date=${encodeURIComponent(date)}`
      );
      setBrief(result.brief ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that brief.");
    }
  };

  const snapshot = dashboard.snapshot ?? {};

  const agents = useMemo(
    () =>
      (snapshot.agents ?? []).filter((agent) => {
        if (focus === "active") return Number(agent.actions || 0) > 0;
        if (focus === "always_on") return agent.runs === "always_on";
        if (focus === "on_demand") return agent.runs === "on_demand";
        return true;
      }),
    [snapshot.agents, focus]
  );

  const actions = agents.reduce((sum, a) => sum + Number(a.actions || 0), 0);
  const worked = agents.filter((a) => Number(a.actions || 0) > 0).length;
  const waiting = snapshot.waiting_on_you ?? [];
  const waitingTotal = waiting.reduce((sum, w) => sum + Number(w.count || 0), 0);
  const maxActions = Math.max(1, ...agents.map((a) => Number(a.actions || 0)));
  const commandCenter = snapshot.command_center ?? {};
  const periodLabel = WINDOWS.find((w) => w.value === hours)?.label ?? "";

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card bodyClassName="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <span className="text-xs font-semibold text-text-3 uppercase tracking-wider">
              Daily brief{brief ? ` — ${briefDate(brief.brief_date)}` : ""}
            </span>
            <h3 className="text-xl font-semibold mt-1">{brief ? brief.headline : "No brief yet"}</h3>
          </div>
          <Button variant="outline" onClick={writeBrief} disabled={writing}>
            <PenLine className="w-4 h-4" />
            {writing ? "Writing…" : "Write today's brief"}
          </Button>
        </div>

        {brief ? (
          <>
            <p className="text-text-2 whitespace-pre-wrap">{brief.body}</p>
            <p className="text-xs text-text-3 mt-3">
              {brief.provider
                ? "Written by Chief"
                : "Written from verified counts — no AI provider answered"}
              {brief.emailed_at ? " · emailed to you" : " · not emailed"}
            </p>
          </>
        ) : (
          <p className="text-sm text-text-3">
            Chief reports what every agent actually did, what is waiting, and what needs your
            decision. Schedule{" "}
            <code className="bg-bg-3 px-1 rounded">database/send_daily_brief.php</code> daily, or
            write one now.
          </p>
        )}
      </Card>

      <FilterBar>
        <Select className="w-auto min-w-44" value={hours} onChange={(e) => changeWindow(e.target.value)}>
          {WINDOWS.map((w) => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </Select>
        <Select className="w-auto min-w-44" value={focus} onChange={(e) => changeFocus(e.target.value)}>
          {FOCUSES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </Select>
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Agent actions in view" value={actions} />
        <StatCard label="Selected agents active" value={`${worked}/${agents.length}`} />
        <StatCard label="Your command-center actions" value={Number(commandCenter.actions || 0)} />
        <StatCard label="Items waiting on you" value={waitingTotal} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem] items-start">
        <Card
          title={`Verified team output — ${periodLabel}`}
          actions={<span className="text-xs text-text-3">{snapshot.since || ""}</span>}
          bodyClassName="p-5 space-y-4"
        >
          {agents.length === 0 ? (
            <p className="text-sm text-text-3">No agents match this focus.</p>
          ) : (
            agents.map((agent) => {
              // Context-only entries are annotations, not output — the legacy
              // page filtered them out of the "what it did" summary line.
              const meaningful = (agent.did ?? []).filter(
                (item) => !item.context && Number(item.count) > 0
              );
              const detail = meaningful.length
                ? meaningful.map((item) => `${Number(item.count)} ${item.label}`).join(" · ")
                : agent.config_note || `No recorded output in ${periodLabel.toLowerCase()}.`;
              const width = Math.max(2, Math.round((Number(agent.actions || 0) / maxActions) * 100));

              return (
                <div key={agent.name} className="grid grid-cols-[10rem_1fr_3rem] gap-4 items-center">
                  <div className="min-w-0">
                    <b className="text-sm block truncate">{agent.name}</b>
                    <small className="text-xs text-text-3 block truncate">
                      {agent.role} · {agent.state}
                    </small>
                  </div>
                  <div className="min-w-0">
                    <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden mb-1">
                      <div className="h-full bg-accent rounded-full" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-xs text-text-2">{detail}</span>
                  </div>
                  <strong className="text-right tabular-nums">{Number(agent.actions || 0)}</strong>
                </div>
              );
            })
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Waiting on you" bodyClassName="p-4 space-y-2">
            {waiting.length === 0 ? (
              <p className="text-sm text-text-3">Nothing is waiting for your review.</p>
            ) : (
              waiting.map((item) => (
                <a
                  key={item.label}
                  href={item.url}
                  className="flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-bg-3 transition-colors"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {item.label}
                    <ArrowUpRight className="w-3.5 h-3.5 text-text-3" />
                  </span>
                  <strong className="tabular-nums">{Number(item.count)}</strong>
                </a>
              ))
            )}
          </Card>

          {(commandCenter.did ?? []).length > 0 && (
            <Card title="Command center" bodyClassName="p-4 space-y-1.5">
              {commandCenter.did!.map((item) => (
                <div key={item.label} className="flex justify-between text-sm">
                  <span className="text-text-2">{item.label}</span>
                  <strong className="tabular-nums">{Number(item.count)}</strong>
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>

      {(dashboard.briefs ?? []).length > 0 && (
        <Card title="Recent briefs" bodyClassName="p-4 flex flex-wrap gap-2">
          {dashboard.briefs!.map((b) => (
            <button
              key={b.brief_date}
              onClick={() => openBrief(b.brief_date)}
              className="text-left rounded-lg border border-hairline px-3 py-2 max-w-64 hover:bg-bg-3 transition-colors"
            >
              <strong className="text-xs block">{b.brief_date}</strong>
              <span className="text-xs text-text-2 line-clamp-2">{b.headline}</span>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
