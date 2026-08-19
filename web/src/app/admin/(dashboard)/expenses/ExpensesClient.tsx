"use client";

import { useMemo, useState } from "react";
import { adminApi } from "@/lib/api";
import {
  Plus, Trash2, Save, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Minus,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import {
  PageHeader, Card, StatCard, Button, IconButton, Input, Select, Tabs,
} from "@/components/admin/ui";

type Money = { total: number; currency: string };

export type ExternalExpenses = {
  currency?: string;
  /** Minor units. */
  monthly_budget?: number;
  items?: { name: string; type: string; amount: number | null }[];
  monthly_revenue?: Money[];
  monthly_revenue_by_source?: (Money & { source: string })[];
  history?: { period_month: string; total: number; currency: string }[];
};

export type ExchangeRate = {
  rate: number;
  provider?: string;
  updated_at?: string;
};

type Item = { name: string; type: string; amount: number | null };
type Period = "month" | "quarter" | "year";

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const shiftMonth = (d: Date, months: number) => new Date(d.getFullYear(), d.getMonth() + months, 1);

function monthName(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(
    new Date(year, month - 1, 1)
  );
}

function money(subunits: number, currency: string) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The comparison window for the selected period, as a list of month keys. */
function periodMonths(period: Period, previous = false): string[] {
  const now = new Date();
  if (period === "month") return [monthKey(shiftMonth(now, previous ? -1 : 0))];
  if (period === "quarter") {
    const elapsed = (now.getMonth() % 3) + 1;
    const start = new Date(
      now.getFullYear(),
      now.getMonth() - (now.getMonth() % 3) + (previous ? -3 : 0),
      1
    );
    return Array.from({ length: elapsed }, (_, i) => monthKey(shiftMonth(start, i)));
  }
  const year = now.getFullYear() - (previous ? 1 : 0);
  return Array.from({ length: now.getMonth() + 1 }, (_, i) => monthKey(new Date(year, i, 1)));
}

function periodLabel(period: Period, previous = false) {
  const now = new Date();
  if (period === "month") return monthName(monthKey(shiftMonth(now, previous ? -1 : 0)));
  if (period === "quarter") {
    const d = shiftMonth(now, previous ? -3 : 0);
    return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}${
      d.getMonth() % 3 < 2 ? " to date" : ""
    }`;
  }
  return `${now.getFullYear() - (previous ? 1 : 0)} to ${new Intl.DateTimeFormat(undefined, {
    month: "short",
  }).format(now)}`;
}

export default function ExpensesClient({
  expenses,
  fx,
}: {
  expenses: ExternalExpenses;
  fx: ExchangeRate | null;
}) {
  const usdGhsRate = Number(fx?.rate || 0) || null;

  const [currency, setCurrency] = useState((expenses.currency || "USD").toUpperCase());
  const [items, setItems] = useState<Item[]>(expenses.items ?? []);
  const [budgetInput, setBudgetInput] = useState(
    expenses.monthly_budget ? (expenses.monthly_budget / 100).toFixed(2) : ""
  );
  const [period, setPeriod] = useState<Period>("month");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const monthlyRevenue = expenses.monthly_revenue ?? [];
  const revenueBySource = expenses.monthly_revenue_by_source ?? [];
  const history = expenses.history ?? [];

  /** Converts between the only two currencies the live rate covers. */
  const convert = (subunits: number, from: string, to: string): number | null => {
    const f = String(from).toUpperCase();
    const t = String(to).toUpperCase();
    if (f === t) return Number(subunits || 0);
    if (!usdGhsRate) return null;
    if (f === "USD" && t === "GHS") return Math.round(Number(subunits || 0) * usdGhsRate);
    if (f === "GHS" && t === "USD") return Math.round(Number(subunits || 0) / usdGhsRate);
    return null;
  };

  const named = items.filter((i) => i.name);
  const fixed = named.filter((i) => i.type === "fixed").reduce((s, i) => s + (i.amount || 0), 0);
  const usage = named.filter((i) => i.type === "usage").reduce((s, i) => s + (i.amount || 0), 0);
  const total = fixed + usage;
  const budget = Math.round(Math.max(0, Number(budgetInput || 0)) * 100);
  const fixedShare = total ? Math.round((fixed / total) * 100) : 0;
  const largest = [...named].filter((i) => i.amount !== null).sort((a, b) => b.amount! - a.amount!)[0];
  const largestShare = largest && total > 0 ? Math.round((largest.amount! / total) * 100) : 0;
  const variance = budget - total;
  const missing = named.filter((i) => i.amount === null);

  const convertedRevenue = monthlyRevenue
    .map((r) => convert(r.total, r.currency, currency))
    .filter((v): v is number => v !== null);
  const hasRevenue = convertedRevenue.length > 0;
  const revenue = convertedRevenue.reduce((s, v) => s + v, 0);
  const net = revenue - total;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : null;
  const coverage = hasRevenue && total > 0 ? revenue / total : null;
  const unmatched = monthlyRevenue.filter((r) => convert(r.total, r.currency, currency) === null);
  const converted = monthlyRevenue.filter(
    (r) => String(r.currency).toUpperCase() !== currency && convert(r.total, r.currency, currency) !== null
  );

  const trend = useMemo(() => {
    const currentKey = monthKey(new Date());
    const values = new Map<string, number>();
    history.forEach((row) => {
      const v = convert(row.total, row.currency, currency);
      if (v !== null) values.set(row.period_month, v);
    });
    values.set(currentKey, total);

    const current = periodMonths(period);
    const previous = periodMonths(period, true);
    const currentRecorded = current.filter((k) => values.has(k));
    const previousRecorded = previous.filter((k) => values.has(k));
    const currentTotal = currentRecorded.reduce((s, k) => s + values.get(k)!, 0);
    const previousTotal = previousRecorded.reduce((s, k) => s + values.get(k)!, 0);

    return {
      values,
      currentKey,
      currentTotal,
      previousTotal,
      currentRecorded,
      previousRecorded,
      currentCount: current.length,
      previousCount: previous.length,
      // Only compare when both windows are fully on the record — a partial
      // month against a whole one produces a meaningless "saving".
      complete:
        currentRecorded.length === current.length && previousRecorded.length === previous.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, currency, total, period, usdGhsRate]);

  const difference = trend.currentTotal - trend.previousTotal;
  const percentage = trend.previousTotal > 0 ? Math.abs((difference / trend.previousTotal) * 100) : null;

  const historyMonths = Array.from({ length: 12 }, (_, i) => monthKey(shiftMonth(new Date(), i - 11)));
  const historyMax = Math.max(...historyMonths.map((k) => trend.values.get(k) || 0), 1);

  const setItem = (index: number, patch: Partial<Item>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const changeCurrency = (next: string) => {
    if (next === currency) return;
    // Re-price the whole ledger so the numbers keep meaning the same money.
    if (convert(100, currency, next) === null) {
      setMessage({ ok: false, text: "The live exchange rate is unavailable, so amounts were not changed." });
      return;
    }
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        amount: it.amount === null ? null : convert(it.amount, currency, next),
      }))
    );
    if (budget) setBudgetInput(((convert(budget, currency, next) ?? 0) / 100).toFixed(2));
    setCurrency(next);
    setMessage(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = items.filter((i) => i.name);
    const code = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      setMessage({ ok: false, text: "Use a three-letter currency such as USD or GHS." });
      return;
    }
    setSaving(true);
    try {
      await adminApi.put("/api/v1/admin/settings", {
        external_expense_currency: code,
        external_expense_monthly_budget: budgetInput.trim(),
        external_service_expenses: cleaned
          .map((i) => `${i.name} | ${i.amount === null ? "" : (i.amount / 100).toFixed(2)} | ${i.type}`)
          .join("\n"),
      });
      setItems(cleaned);
      setMessage({ ok: true, text: "Expense plan saved. Dashboard totals are updated." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const budgetInsight = !budget
    ? "Set a monthly budget so Chief can assess your spending pace."
    : (() => {
        const utilization = Math.round((total / budget) * 100);
        if (utilization > 100)
          return `You are ${utilization - 100}% over your monthly budget. Reduce or reclassify ${money(Math.abs(variance), currency)} of planned spend.`;
        if (utilization >= 80)
          return `You are using ${utilization}% of your monthly budget. ${money(variance, currency)} remains, so new recurring costs need scrutiny.`;
        return `You are using ${utilization}% of your monthly budget. At this pace, ${money(variance, currency)} remains within your plan.`;
      })();

  return (
    <form onSubmit={save} className="space-y-8">
      <PageHeader
        kicker="Bookings & Payments"
        title="What the business costs to run."
        description={`Operating expenses for ${new Intl.DateTimeFormat(undefined, {
          month: "long",
          year: "numeric",
        }).format(new Date())}, measured against confirmed revenue.`}
        actions={
          <Button type="submit" variant="primary" disabled={saving}>
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save expense plan"}
          </Button>
        }
      />

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.ok
              ? "border-green-500/30 bg-green-500/10 text-green-500"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div
        className={`flex items-center gap-2 text-xs ${usdGhsRate ? "text-text-3" : "text-amber-500"}`}
      >
        {usdGhsRate ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            <span>
              1 USD = {usdGhsRate.toFixed(4)} GHS · {fx?.provider || "cached rate"} · updated{" "}
              {fx?.updated_at
                ? new Date(fx.updated_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "recently"}
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="w-4 h-4" />
            <span>Live conversion is temporarily unavailable.</span>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Monthly total" value={money(total, currency)} hint={`${money(total * 12, currency)} a year`} />
        <StatCard label="Fixed" value={money(fixed, currency)} hint={`${fixedShare}% of spend`} />
        <StatCard label="Usage-based" value={money(usage, currency)} />
        <StatCard
          label="Largest cost"
          value={largest ? money(largest.amount!, currency) : "—"}
          hint={largest ? largest.name : "No costs entered"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem] items-start">
        <Card
          title="Service ledger"
          actions={
            <Button
              variant="outline"
              onClick={() => setItems((prev) => [...prev, { name: "", type: "fixed", amount: 0 }])}
            >
              <Plus className="w-4 h-4" />
              Add service
            </Button>
          }
          bodyClassName="p-4 space-y-2"
        >
          {items.length === 0 ? (
            <p className="text-sm text-text-3 py-6 text-center">
              No services recorded yet. Add the tools you pay for each month.
            </p>
          ) : (
            items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_10rem_2rem] gap-2 items-center">
                <Input
                  maxLength={80}
                  placeholder="Service name"
                  aria-label="Service name"
                  value={item.name}
                  onChange={(e) => setItem(i, { name: e.target.value })}
                />
                <Select
                  aria-label="Cost type"
                  value={item.type}
                  onChange={(e) => setItem(i, { type: e.target.value })}
                >
                  <option value="fixed">Fixed</option>
                  <option value="usage">Usage estimate</option>
                </Select>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-3 w-8">{currency}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    aria-label="Monthly amount"
                    value={item.amount === null ? "" : (item.amount / 100).toFixed(2)}
                    onChange={(e) =>
                      setItem(i, {
                        amount:
                          e.target.value === ""
                            ? null
                            : Math.round(Math.max(0, Number(e.target.value)) * 100),
                      })
                    }
                  />
                </div>
                <IconButton
                  title={`Remove ${item.name || "service"}`}
                  tone="danger"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            ))
          )}

          {missing.length > 0 && (
            <p className="text-xs text-amber-500 pt-2">
              <strong>
                {missing.length} amount{missing.length === 1 ? "" : "s"} needed:
              </strong>{" "}
              {missing.map((i) => i.name).join(", ")}
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Budget" bodyClassName="p-4 space-y-4">
            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Currency</span>
              <Select value={currency} onChange={(e) => changeCurrency(e.target.value)}>
                {Array.from(new Set(["USD", "GHS", currency])).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </label>

            <label className="block">
              <span className="block text-sm font-medium mb-1.5">Monthly ceiling</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-3 w-8">{currency}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                />
              </div>
            </label>

            <div>
              <div className="h-2 rounded-full bg-bg-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    budget > 0 && variance < 0 ? "bg-red-500" : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(100, (total / Math.max(total, budget, 1)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-text-3 mt-2">
                {!budget
                  ? "Set a budget to measure headroom."
                  : variance >= 0
                    ? `${money(variance, currency)} headroom remains.`
                    : `${money(Math.abs(variance), currency)} above budget.`}
              </p>
            </div>
          </Card>

          <Card title="Insights" bodyClassName="p-4 space-y-3">
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                largestShare >= 50 ? "bg-amber-500/10 text-amber-500" : "bg-bg-3 text-text-2"
              }`}
            >
              {largest
                ? `${largest.name} accounts for ${largestShare}% of your monthly operating expenses.${
                    largest.type === "usage"
                      ? " Because it is usage-based, watch it as activity grows."
                      : " This is a fixed monthly commitment."
                  }`
                : "Chief is waiting for your service costs."}
            </div>
            <div className="rounded-lg bg-bg-3 px-3 py-2 text-sm text-text-2">{budgetInsight}</div>
          </Card>
        </div>
      </div>

      <Card title="Revenue vs expenses this month" bodyClassName="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Confirmed revenue"
            value={money(hasRevenue ? revenue : 0, currency)}
            hint={
              revenueBySource.length
                ? `${revenueBySource.length} recorded payment source${revenueBySource.length === 1 ? "" : "s"}`
                : "No confirmed payments this month"
            }
          />
          <StatCard label="Expenses" value={money(total, currency)} />
          <StatCard
            label="Net"
            value={hasRevenue ? `${net < 0 ? "−" : ""}${money(Math.abs(net), currency)}` : "—"}
            hint={
              hasRevenue
                ? net >= 0
                  ? "Operating surplus this month"
                  : "Operating shortfall this month"
                : "No confirmed revenue this month"
            }
          />
          <StatCard
            label="Margin"
            value={margin === null ? "—" : `${margin}%`}
            hint={
              !hasRevenue
                ? "Waiting for confirmed revenue"
                : coverage === null
                  ? "Add expenses to calculate coverage"
                  : `${coverage.toFixed(1)}× expense coverage`
            }
          />
        </div>

        {revenueBySource.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {revenueBySource.map((s) => {
              const c = convert(s.total, s.currency, currency);
              return (
                <div
                  key={s.source}
                  className="flex items-center justify-between gap-3 rounded-md bg-bg-3 px-3 py-2 text-sm"
                >
                  <span>{s.source}</span>
                  <strong className="tabular-nums">
                    {c === null ? money(s.total, s.currency) : money(c, currency)}
                  </strong>
                </div>
              );
            })}
          </div>
        )}

        {(converted.length > 0 || unmatched.length > 0) && (
          <p className="text-xs text-text-3">
            {converted.length && usdGhsRate ? (
              <>
                <strong>Automatic conversion:</strong> Revenue and expenses are displayed in{" "}
                {currency} using 1 USD = {usdGhsRate.toFixed(4)} GHS.
                {unmatched.length
                  ? ` ${unmatched.map((r) => r.currency).join(", ")} could not be converted.`
                  : ""}
              </>
            ) : (
              <>
                Revenue in {unmatched.map((r) => r.currency).join(", ")} could not be converted to{" "}
                {currency}.
              </>
            )}
          </p>
        )}
      </Card>

      <Card
        title="Spending trend"
        actions={
          <Tabs<Period>
            value={period}
            onChange={setPeriod}
            options={[
              { value: "month", label: "Month" },
              { value: "quarter", label: "Quarter" },
              { value: "year", label: "Year" },
            ]}
          />
        }
        bodyClassName="p-5 space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <span className="text-xs text-text-3 uppercase tracking-wider block">
              {periodLabel(period)}
            </span>
            <strong className="text-xl tabular-nums">{money(trend.currentTotal, currency)}</strong>
            <small className="text-xs text-text-3 block">
              {trend.currentRecorded.length} of {trend.currentCount} month
              {trend.currentCount === 1 ? "" : "s"} recorded
            </small>
          </div>

          <div>
            <span className="text-xs text-text-3 uppercase tracking-wider block">
              {periodLabel(period, true)}
            </span>
            <strong className="text-xl tabular-nums">
              {trend.previousRecorded.length ? money(trend.previousTotal, currency) : "—"}
            </strong>
            <small className="text-xs text-text-3 block">
              {trend.previousRecorded.length} of {trend.previousCount} month
              {trend.previousCount === 1 ? "" : "s"} recorded
            </small>
          </div>

          <div className="flex items-start gap-2">
            {!trend.complete ? (
              <>
                <Minus className="w-4 h-4 text-text-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-sm block">Not enough history yet</strong>
                  <small className="text-xs text-text-3">
                    Both equivalent periods must be fully recorded before the difference is calculated.
                  </small>
                </div>
              </>
            ) : difference === 0 ? (
              <>
                <ArrowLeftRight className="w-4 h-4 text-text-3 mt-1 flex-shrink-0" />
                <div>
                  <strong className="text-sm block">No spending change</strong>
                  <small className="text-xs text-text-3">
                    The two periods have the same recorded expense.
                  </small>
                </div>
              </>
            ) : (
              <>
                {difference > 0 ? (
                  <ArrowUpRight className="w-4 h-4 text-red-500 mt-1 flex-shrink-0" />
                ) : (
                  <ArrowDownRight className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                )}
                <div>
                  <strong className={`text-sm block ${difference > 0 ? "text-red-500" : "text-green-500"}`}>
                    {money(Math.abs(difference), currency)} {difference > 0 ? "more" : "less"}
                  </strong>
                  <small className="text-xs text-text-3">
                    {percentage === null
                      ? "Previous period was zero."
                      : `${percentage.toFixed(1)}% ${difference > 0 ? "increase" : "decrease"} from the previous period.`}
                  </small>
                </div>
              </>
            )}
          </div>
        </div>

        {historyMonths.some((k) => trend.values.has(k)) ? (
          <div className="flex items-end gap-1.5 h-32">
            {historyMonths.map((key) => {
              const value = trend.values.get(key);
              const height = value === undefined ? 0 : Math.max(3, (value / historyMax) * 100);
              return (
                <div
                  key={key}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                  title={`${monthName(key)}: ${value === undefined ? "not recorded" : money(value, currency)}`}
                >
                  <div
                    className={`w-full rounded-t ${
                      key === trend.currentKey ? "bg-accent" : "bg-bg-3"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-[10px] text-text-3">{monthName(key).split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-3 text-center py-6">
            Save this month&apos;s expense plan to begin the comparison history.
          </p>
        )}
      </Card>
    </form>
  );
}
