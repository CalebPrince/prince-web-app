"use client";

import { useState, useEffect, useCallback } from "react";
import { api, AdminReportSummary, AdminAnalyticsSummary } from "@/lib/api";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

function formatMoney(subunits: number, currency: string) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString(undefined, { month: "short", year: "2-digit" });
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function MetricTile({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number | null }) {
  const TrendIcon = trend == null ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend == null ? "" : trend > 0 ? "text-emerald-500" : trend < 0 ? "text-red-500" : "text-text-3";
  return (
    <div className="rounded-xl border border-hairline bg-bg p-4">
      <div className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-2">{label}</div>
      <div className="text-2xl font-bold text-text mb-1">{value}</div>
      {(sub || TrendIcon) && (
        <div className={`text-xs flex items-center gap-1 ${trendColor || "text-text-3"}`}>
          {TrendIcon && <TrendIcon className="w-3.5 h-3.5" />}
          {trend != null && <span>{Math.abs(trend).toFixed(1)}%</span>}
          {sub && <span className="text-text-3">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-bold text-text-3 uppercase tracking-widest border-b border-hairline pb-2 mb-4">
      {children}
    </h3>
  );
}

export default function ReportsClient({ initialReport }: { initialReport: AdminReportSummary | null }) {
  const [report, setReport] = useState<AdminReportSummary | null>(initialReport);
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(null);
  const [from, setFrom] = useState(initialReport?.period?.from ?? "");
  const [to, setTo] = useState(initialReport?.period?.to ?? "");
  const [analyticsDays, setAnalyticsDays] = useState(30);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Revenue target form state
  const [targetAmount, setTargetAmount] = useState(
    initialReport ? String(initialReport.revenue_target.target / 100) : ""
  );
  const [targetCurrency, setTargetCurrency] = useState(initialReport?.revenue_target?.currency || "GHS");
  const [targetSaving, setTargetSaving] = useState(false);

  const loadReport = useCallback(async (params?: { from?: string; to?: string }) => {
    setIsLoading(true);
    try {
      const data = await api.adminReportSummary(undefined, params);
      setReport(data);
      setError(null);
      setFrom(data.period.from);
      setTo(data.period.to);
      setTargetAmount(String(data.revenue_target.target / 100));
      setTargetCurrency(data.revenue_target.currency);
    } catch (err) {
      // Carry the API's own message through to the screen. "Failed to load,
      // please refresh" is the one thing refreshing will not fix when the
      // cause is a missing table or a 500 - and it costs a round trip through
      // the server logs to find out which.
      setError(err instanceof Error ? err.message : "Could not load the report.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (days: number) => {
    try {
      const data = await api.adminAnalyticsSummary(days);
      setAnalytics(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadAnalytics(analyticsDays);
  }, [analyticsDays, loadAnalytics]);

  // The page is rendered on the server with the report already fetched, and
  // that fetch is allowed to fail quietly. Ask again from the browser when it
  // did: the session cookie is unambiguously present here, so anything that
  // was only wrong about the server-side request fixes itself, and anything
  // genuinely broken says so below instead of leaving an empty page.
  useEffect(() => {
    if (initialReport) return;
    // Off the effect body itself: loadReport sets its loading flag before it
    // awaits anything, and a setState run synchronously during an effect is
    // a cascading render.
    queueMicrotask(() => loadReport());
  }, [initialReport, loadReport]);

  const presetRange = (preset: string) => {
    const now = new Date();
    let start: Date;
    let end = now;
    if (preset === "this_month") start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (preset === "last_month") {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === "this_quarter") {
      start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    } else {
      start = new Date(now.getFullYear(), 0, 1);
    }
    loadReport({ from: isoDate(start), to: isoDate(end) });
  };

  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    setTargetSaving(true);
    try {
      await api.adminSaveSettings({
        monthly_revenue_target: targetAmount || "0",
        revenue_target_currency: targetCurrency,
      });
      await loadReport({ from, to });
    } catch (err: any) {
      alert(err.message || "Could not save target.");
    } finally {
      setTargetSaving(false);
    }
  };

  if (!report) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-text-2">
          {isLoading ? "Loading the report…" : "The report could not be loaded."}
        </p>
        {error && !isLoading && (
          <p className="mt-3 break-words rounded-lg border border-hairline bg-bg-2 px-4 py-3 text-sm text-text-3">
            {error}
          </p>
        )}
        {!isLoading && (
          <button
            type="button"
            onClick={() => loadReport()}
            className="mt-6 rounded-full border border-hairline px-5 py-2 text-sm text-text-2 transition-colors hover:border-accent hover:text-text"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const currency = report.currency;
  const revenueByMonth = report.revenue.by_month.map(r => ({
    name: monthLabel(r.month),
    revenue: Number(r.amount) / 100,
  }));
  const sixMonthData = report.six_month_view.map(r => ({
    name: monthLabel(r.month),
    revenue: Number(r.revenue) / 100,
    margin: Number(r.margin_est) / 100,
  }));
  const bookingsData = report.bookings.by_month.map(r => ({
    name: monthLabel(r.month),
    bookings: Number(r.count),
  }));

  // Revenue target bar
  const target = report.revenue_target.target;
  const actual = report.revenue_target.actual;
  const forecast = report.revenue_target.weighted_forecast;
  // The server already computes both of these against the same target, and
  // projected_pct is cumulative (collected + weighted), which is what the
  // overlaid bar is drawing.
  const actualPct = Math.min(100, Math.round(report.revenue_target.actual_pct));
  const projectedPct = Math.min(100, Math.round(report.revenue_target.projected_pct));

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Business at a glance</div>
          <h2 className="text-3xl font-bold tracking-tight">Reports</h2>
          <p className="text-text-2 mt-1">Revenue, pipeline, bookings and website traffic.</p>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="rounded-xl border border-hairline bg-bg p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-text-3 block mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="bg-bg-2 border border-hairline rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text-3 block mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="bg-bg-2 border border-hairline rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <button
          onClick={() => loadReport({ from, to })}
          disabled={isLoading}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Apply"}
        </button>
        <div className="flex gap-1">
          {(["this_month", "last_month", "this_quarter", "ytd"] as const).map(p => (
            <button
              key={p}
              onClick={() => presetRange(p)}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-bg-3 text-text-2 hover:bg-bg-3/80 transition-colors capitalize"
            >
              {p === "ytd" ? "YTD" : p.replace("_", " ")}
            </button>
          ))}
        </div>
        {report.period.from && (
          <span className="text-xs text-text-3 ml-auto">
            {report.period.from} → {report.period.to}
          </span>
        )}
      </div>

      {/* Revenue Target */}
      <div className="rounded-xl border border-hairline bg-bg p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-text-3 uppercase tracking-wider mb-1">Monthly direction</div>
            <h3 className="font-bold text-lg">Revenue target</h3>
            <p className="text-sm text-text-2">Compare cash collected with closed and likely work.</p>
          </div>
          <form onSubmit={handleSaveTarget} className="flex items-center gap-2 flex-wrap shrink-0">
            <select
              value={targetCurrency}
              onChange={e => setTargetCurrency(e.target.value)}
              className="bg-bg-2 border border-hairline rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {["GHS", "USD", "GBP", "EUR"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input
              type="number"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              min="0"
              step="0.01"
              placeholder="Monthly target"
              className="bg-bg-2 border border-hairline rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent w-36"
            />
            <button
              type="submit"
              disabled={targetSaving}
              className="px-4 py-1.5 rounded-md text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {targetSaving ? "Saving..." : "Save target"}
            </button>
          </form>
        </div>

        {target > 0 && (
          <div className="space-y-2">
            <div className="relative h-4 bg-bg-3 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500 rounded-full transition-all"
                style={{ width: `${actualPct}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-accent/40 rounded-full transition-all"
                style={{ width: `${projectedPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-text-3 text-xs">Monthly target</div>
                <div className="font-bold">{formatMoney(target, report.revenue_target.currency)}</div>
              </div>
              <div>
                <div className="text-text-3 text-xs">Collected</div>
                <div className="font-bold text-emerald-500">{formatMoney(actual, report.revenue_target.currency)}</div>
                {target > 0 && <div className="text-xs text-text-3">{actualPct}% of target</div>}
              </div>
              <div>
                <div className="text-text-3 text-xs">Deals won this month</div>
                <div className="font-bold">{formatMoney(report.revenue_target.won, report.revenue_target.currency)}</div>
              </div>
              <div>
                <div className="text-text-3 text-xs">Weighted forecast</div>
                <div className="font-bold text-accent">{formatMoney(forecast, report.revenue_target.currency)}</div>
                {target > 0 && <div className="text-xs text-text-3">{projectedPct}% of target projected</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div>
        <SectionLabel>Key metrics · selected period</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricTile
            label="Revenue"
            value={formatMoney(report.period.revenue, currency)}
            trend={report.period.revenue_change_pct}
            sub="vs previous period"
          />
          <MetricTile
            label="Gross margin"
            value={`${Math.round(report.estimates.gross_margin_pct)}%`}
            sub={report.estimates.gross_margin_is_estimate ? "est. (no cost data)" : undefined}
          />
          <MetricTile
            label="Win rate"
            value={report.pipeline.win_rate != null ? `${report.pipeline.win_rate}%` : "—"}
            sub={report.pipeline.paying_customers > 0 ? `${report.pipeline.paying_customers} paying clients` : undefined}
          />
          <MetricTile
            label="Utilization"
            value={`${Math.round(report.estimates.utilization_pct)}%`}
            sub={report.estimates.utilization_is_estimate ? "est. (no hours data)" : undefined}
          />
        </div>
      </div>

      {/* Revenue Charts */}
      <div>
        <SectionLabel>Revenue</SectionLabel>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <MetricTile label="Revenue (all time)" value={formatMoney(report.revenue.all_time, currency)} />
          <MetricTile label="Revenue · last 30 days" value={formatMoney(report.revenue.last_30_days, currency)} sub="successful payments" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2 rounded-xl border border-hairline bg-bg p-4">
            <h4 className="text-sm font-semibold mb-4">Revenue · last 12 months</h4>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={revenueByMonth}>
                <defs>
                  <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b93a7" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8b93a7" }} />
                <Tooltip formatter={(v: any) => [`${currency} ${Number(v).toLocaleString()}`, "Revenue"]} contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" fill="url(#revenueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-hairline bg-bg p-4">
            <h4 className="text-sm font-semibold mb-4">Revenue by source</h4>
            <div className="space-y-2">
              {report.revenue.by_source.length === 0 ? (
                <p className="text-xs text-text-3">No data</p>
              ) : (
                report.revenue.by_source.map((s, i) => {
                  const total = report.revenue.all_time || 1;
                  const pct = Math.round((s.amount / total) * 100);
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-text-2">{s.label}</span>
                        <span className="font-semibold">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rounded-xl border border-hairline bg-bg p-4">
            <h4 className="text-sm font-semibold mb-1">Revenue mix</h4>
            <p className="text-xs text-text-3 mb-3">By service · {formatMoney(report.period.revenue, currency)}</p>
            <div className="space-y-3">
              {report.period.revenue_mix.length === 0 ? (
                <p className="text-xs text-text-3">No revenue in this period.</p>
              ) : (
                report.period.revenue_mix.map((m, i) => {
                  const total = report.period.revenue || 1;
                  const pct = Math.round((m.amount / total) * 100);
                  return (
                    <div key={m.label}>
                      <div className="flex justify-between text-xs mb-1">
                        <span>{m.label}</span>
                        <span className="font-semibold">{pct}% · {formatMoney(m.amount, currency)}</span>
                      </div>
                      <div className="h-1.5 bg-bg-3 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PALETTE[i % PALETTE.length] }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {report.period.revenue_mix.length > 0 && (
            <div className="rounded-xl border border-hairline bg-bg p-4 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={report.period.revenue_mix.map(m => ({ name: m.label, value: m.amount }))} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`} labelLine={false}>
                    {report.period.revenue_mix.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => [formatMoney(v, currency), "Revenue"]} contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-hairline bg-bg p-4">
          <h4 className="text-sm font-semibold mb-1">Six month view</h4>
          <p className="text-xs text-text-3 mb-4">Revenue and margin</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={sixMonthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b93a7" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b93a7" }} />
              <Tooltip formatter={(v: any, name: any) => [`${currency} ${Number(v).toLocaleString()}`, String(name)]} contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="margin" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sales & Pipeline */}
      <div>
        <SectionLabel>Sales &amp; pipeline</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-hairline bg-bg p-4">
            <h4 className="text-sm font-semibold mb-4">Activity funnel</h4>
            {report.pipeline.funnel.length === 0 ? (
              <p className="text-xs text-text-3">No funnel data.</p>
            ) : (
              <div className="space-y-2">
                {report.pipeline.funnel.map((f, i) => (
                  <div key={f.label} className="flex items-center gap-3">
                    <div className="text-xs text-text-3 w-24 shrink-0">{f.label}</div>
                    <div className="flex-1 h-6 rounded-md flex items-center overflow-hidden bg-bg-3">
                      <div
                        className="h-full rounded-md flex items-center px-2 text-xs font-medium text-white"
                        style={{
                          width: `${report.pipeline.funnel[0].count > 0 ? Math.round((f.count / report.pipeline.funnel[0].count) * 100) : 0}%`,
                          background: PALETTE[i % PALETTE.length],
                          minWidth: f.count > 0 ? "2rem" : 0
                        }}
                      >
                        {f.count > 0 ? f.count : ""}
                      </div>
                    </div>
                    <div className="text-xs font-semibold w-8 text-right">{f.count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-hairline bg-bg p-4">
            <h4 className="text-sm font-semibold mb-4">Lead sources</h4>
            {report.lead_sources.length === 0 ? (
              <p className="text-xs text-text-3">No lead source data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={report.lead_sources.map(s => ({ name: s.label, count: s.count }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b93a7" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#8b93a7" }} />
                  <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {report.top_clients.length > 0 && (
          <div className="rounded-xl border border-hairline bg-bg overflow-hidden mt-4">
            <div className="p-4 border-b border-hairline">
              <h4 className="text-sm font-semibold">Top clients by revenue</h4>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Client</th>
                  <th className="px-4 py-3 text-right font-medium">Payments</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {report.top_clients.map((c, i) => (
                  <tr key={i} className="hover:bg-bg-2/50">
                    <td className="px-4 py-3 font-medium">{c.name || c.email}</td>
                    <td className="px-4 py-3 text-right text-text-2">{c.payments_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatMoney(c.total, c.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Automations */}
      {report.automations.length > 0 && (
        <div>
          <SectionLabel>Automations</SectionLabel>
          <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Automation</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 text-right font-medium">Enrolled</th>
                    <th className="px-4 py-3 text-right font-medium">Active</th>
                    <th className="px-4 py-3 text-right font-medium">Steps sent</th>
                    <th className="px-4 py-3 text-right font-medium">Unsubs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {report.automations.map(a => (
                    <tr key={a.id} className="hover:bg-bg-2/50">
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${a.is_active ? "bg-green-500/10 text-green-500" : "bg-bg-3 text-text-3"}`}>
                          {a.is_active ? "active" : "paused"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-text-2">{a.enrollments}</td>
                      <td className="px-4 py-3 text-right text-text-2">{a.active_enrollments}</td>
                      <td className="px-4 py-3 text-right text-text-2">{a.steps_sent}</td>
                      <td className="px-4 py-3 text-right text-text-2">{a.unsubscribed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Bookings */}
      <div>
        <SectionLabel>Bookings</SectionLabel>
        <div className="rounded-xl border border-hairline bg-bg p-4">
          <h4 className="text-sm font-semibold mb-4">Bookings · last 12 months</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={bookingsData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b93a7" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8b93a7" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
              <Bar dataKey="bookings" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Website Traffic */}
      <div>
        <div className="flex items-end justify-between mb-4">
          <div>
            <SectionLabel>Website traffic</SectionLabel>
            <p className="text-xs text-text-3 -mt-3">First-party page views — no cookies, no IP storage, no third party.</p>
          </div>
          <select
            value={analyticsDays}
            onChange={e => setAnalyticsDays(Number(e.target.value))}
            className="bg-bg-2 border border-hairline rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {analytics ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <MetricTile label="Total page views" value={analytics.total_views.toLocaleString()} />
              <MetricTile label="Calculator runs" value={String(analytics.funnel?.calculator_runs || 0)} />
              <MetricTile label="Request step 3" value={String(analytics.funnel?.request_step_3 || 0)} />
              <MetricTile label="Successful requests" value={String(analytics.funnel?.request_submit_success || 0)} />
            </div>

            <div className="rounded-xl border border-hairline bg-bg p-4">
              <h4 className="text-sm font-semibold mb-4">Views over time</h4>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={analytics.by_day.map(d => ({ name: d.day.slice(5), views: d.views }))}>
                  <defs>
                    <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#8b93a7" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#8b93a7" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--bg)", border: "1px solid var(--hairline)", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="views" stroke="#0ea5e9" fill="url(#viewsGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { title: "Top pages", data: analytics.top_pages, key: "path", valueKey: "views" },
                { title: "Top funnel events", data: analytics.top_events, key: "path", valueKey: "views" },
                { title: "Top referrers", data: analytics.top_referrers, key: "referrer", valueKey: "views" },
              ].map(({ title, data, key, valueKey }) => (
                <div key={title} className="rounded-xl border border-hairline bg-bg overflow-hidden">
                  <div className="p-4 border-b border-hairline">
                    <h4 className="text-sm font-semibold">{title}</h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-bg-2/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-text-3">Path</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-text-3">Views</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {data.length === 0 ? (
                        <tr><td colSpan={2} className="px-4 py-3 text-center text-text-3 text-xs">No data yet.</td></tr>
                      ) : (
                        data.map((row: any, i) => (
                          <tr key={i} className="hover:bg-bg-2/50">
                            <td className="px-4 py-2 text-xs text-text-2 max-w-[160px] truncate">{row[key]}</td>
                            <td className="px-4 py-2 text-right text-xs font-medium">{Number(row[valueKey]).toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-text-3 text-sm">Loading analytics...</div>
        )}
      </div>
    </div>
  );
}
