"use client";

import { useMemo, useState } from "react";
import { adminApi, asList, postJson } from "@/lib/api";
import { Plus, Trash2, RefreshCw, StickyNote, Copy, Check, Ban } from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, Textarea, Select, Tabs, StatusPill, ErrorBanner,
  formatDateTime, formatDate,
} from "@/components/admin/ui";

export type Payment = {
  reference: string;
  customer_name: string | null;
  email: string;
  /** Minor units. */
  amount: number;
  currency: string;
  source: string;
  status: string;
  reviewed: boolean | number;
  notes: string | null;
  tos_accepted: boolean | number;
  tos_accepted_at: string | null;
  tos_version: string | null;
  created_at: string;
};

export type PaymentLink = {
  id: number;
  token: string;
  client_name: string;
  client_email: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
};

export type Subscription = {
  id: number;
  client_name: string;
  client_email: string;
  plan_name: string;
  amount: number;
  currency: string;
  billing_interval: string;
  status: string;
  next_payment_at: string | null;
  charge_count: number;
  charged_total: number;
  checkout_url: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  payment_link: "Payment link",
  tier_checkout: "Tier checkout",
  manual: "Manual",
};

const INTERVAL_LABEL: Record<string, string> = {
  monthly: "/month",
  quarterly: "/quarter",
  biannually: "/6 months",
  annually: "/year",
};

const CURRENCIES = ["GHS", "USD", "EUR", "GBP", "NGN"];

type Tab = "transactions" | "links" | "subscriptions";

function money(subunits: number, currency: string) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export default function PaymentsClient({
  initialPayments,
  initialLinks,
  initialSubscriptions,
}: {
  initialPayments: Payment[];
  initialLinks: PaymentLink[];
  initialSubscriptions: Subscription[];
}) {
  const [payments, setPayments] = useState(initialPayments);
  const [links, setLinks] = useState(initialLinks);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [tab, setTab] = useState<Tab>("transactions");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [notesFor, setNotesFor] = useState<Payment | null>(null);
  const [notesText, setNotesText] = useState("");

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({
    client_name: "", client_email: "", amount: "", currency: "GHS", description: "",
  });
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({
    client_name: "", client_email: "", plan_name: "", amount: "", currency: "GHS",
    billing_interval: "monthly",
  });
  const [subUrl, setSubUrl] = useState<string | null>(null);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordForm, setRecordForm] = useState({
    description: "", amount: "", currency: "GHS", customer_name: "", email: "",
    paid_at: "", notes: "", send_receipt: false,
  });

  const stats = useMemo(() => {
    const successful = payments.filter((p) => p.status === "success");
    const byCurrency: Record<string, number> = {};
    successful.forEach((p) => {
      byCurrency[p.currency] = (byCurrency[p.currency] || 0) + p.amount;
    });
    const entries = Object.entries(byCurrency);
    return {
      revenue: entries.length ? entries.map(([c, t]) => money(t, c)).join(" + ") : "—",
      successful: successful.length,
      pending: payments.filter((p) => p.status === "pending").length,
      failed: payments.filter((p) => p.status === "failed").length,
      total: payments.length,
    };
  }, [payments]);

  const reloadPayments = async () =>
    setPayments(asList<Payment>(await adminApi.get("/api/v1/admin/payments")));
  const reloadLinks = async () =>
    setLinks(asList<PaymentLink>(await adminApi.get("/api/v1/admin/payment-links")));
  const reloadSubs = async () =>
    setSubscriptions(asList<Subscription>(await adminApi.get("/api/v1/admin/subscriptions")));

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("Copy this link:", text);
    }
  };

  /* ---------- transactions ---------- */

  const recheck = async (p: Payment) => {
    setBusy(p.reference);
    // Same public verify endpoint the checkout page calls after a charge —
    // reused here to re-ask Paystack about a row stuck pending or failed
    // (e.g. the webhook never fired). A "not found" is a legitimate answer
    // for an abandoned checkout, so either way we just reload.
    try {
      await postJson("/api/v1/payments/verify", { reference: p.reference });
    } catch {
      /* expected for checkouts the customer never finished */
    }
    await reloadPayments();
    setBusy(null);
  };

  const toggleReviewed = async (p: Payment) => {
    const next = !p.reviewed;
    setPayments((prev) =>
      prev.map((x) => (x.reference === p.reference ? { ...x, reviewed: next } : x))
    );
    try {
      await adminApi.patch(`/api/v1/admin/payments/${encodeURIComponent(p.reference)}`, {
        reviewed: next,
      });
    } catch (err) {
      setPayments((prev) =>
        prev.map((x) => (x.reference === p.reference ? { ...x, reviewed: !next } : x))
      );
      setError(err instanceof Error ? err.message : "Could not update the review flag.");
    }
  };

  const removePayment = async (p: Payment) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await adminApi.del(`/api/v1/admin/payments/${encodeURIComponent(p.reference)}`);
      await reloadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the transaction.");
    }
  };

  const saveNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notesFor) return;
    try {
      await adminApi.patch(`/api/v1/admin/payments/${encodeURIComponent(notesFor.reference)}`, {
        notes: notesText,
      });
      setNotesFor(null);
      await reloadPayments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the note.");
    }
  };

  const recordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("record");
    try {
      const result = await adminApi.post<{ receipt_sent?: boolean }>(
        "/api/v1/admin/payments/manual",
        { ...recordForm, amount: Number(recordForm.amount) }
      );
      setRecordOpen(false);
      await reloadPayments();
      if (recordForm.send_receipt && !result.receipt_sent) {
        setError(
          "Payment recorded, but the receipt email could not be sent — check Email delivery (SMTP) settings."
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------- links ---------- */

  const createLink = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await adminApi.post<{ url: string }>("/api/v1/admin/payment-links", {
        ...linkForm,
        amount: Number(linkForm.amount),
      });
      setLinkUrl(`${window.location.origin}${result.url}`);
      await reloadLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the payment link.");
    }
  };

  const markLinkPaid = async (l: PaymentLink) => {
    if (!confirm("Mark this as paid? Only do this once you've actually confirmed the money in your wallet/account.")) return;
    setBusy(`link-${l.id}`);
    try {
      await adminApi.post(`/api/v1/admin/payment-links/${l.id}/mark-paid`);
      await Promise.all([reloadLinks(), reloadPayments()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark the link as paid.");
    } finally {
      setBusy(null);
    }
  };

  /* ---------- subscriptions ---------- */

  const createSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await adminApi.post<{ checkout_url: string }>("/api/v1/admin/subscriptions", {
        ...subForm,
        amount: Number(subForm.amount),
      });
      setSubUrl(result.checkout_url);
      await reloadSubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the subscription.");
    }
  };

  const cancelSubscription = async (s: Subscription) => {
    if (!confirm("Cancel this subscription? Paystack will stop charging the client.")) return;
    setBusy(`sub-${s.id}`);
    try {
      await adminApi.post(`/api/v1/admin/subscriptions/${s.id}/cancel`);
      await reloadSubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the subscription.");
    } finally {
      setBusy(null);
    }
  };

  const deleteSubscription = async (s: Subscription) => {
    if (!confirm("Delete this subscription record?")) return;
    try {
      await adminApi.del(`/api/v1/admin/subscriptions/${s.id}`);
      await reloadSubs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the subscription.");
    }
  };

  /** Terms acceptance is only meaningful for the self-serve tier checkout. */
  const termsCell = (p: Payment) => {
    if (p.source !== "tier_checkout") return <span className="text-xs text-text-3">N/A</span>;
    if (!p.tos_accepted) return <StatusPill status="Missing" tone="red" />;
    return (
      <>
        <StatusPill status="Accepted" tone="green" />
        <div className="text-xs text-text-3 mt-1">
          v{p.tos_version || "unknown"} ·{" "}
          {p.tos_accepted_at ? formatDateTime(p.tos_accepted_at) : "Recorded"}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Bookings & Payments"
        title="Every cedi in and out."
        description="Paystack transactions, one-off payment links, and recurring subscriptions."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRecordForm({
                  description: "", amount: "", currency: "GHS", customer_name: "",
                  email: "", paid_at: "", notes: "", send_receipt: false,
                });
                setRecordOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Record a payment
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setLinkForm({
                  client_name: "", client_email: "", amount: "", currency: "GHS", description: "",
                });
                setLinkUrl(null);
                setLinkOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              New payment link
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setSubForm({
                  client_name: "", client_email: "", plan_name: "", amount: "",
                  currency: "GHS", billing_interval: "monthly",
                });
                setSubUrl(null);
                setSubOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              New subscription
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={stats.revenue} hint={`${stats.successful} successful`} />
        <StatCard label="Pending" value={stats.pending} />
        <StatCard label="Failed" value={stats.failed} />
        <StatCard label="Transactions" value={stats.total} />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "transactions", label: "Transactions", count: payments.length },
          { value: "links", label: "Payment links", count: links.length },
          { value: "subscriptions", label: "Subscriptions", count: subscriptions.length },
        ]}
      />

      {tab === "transactions" && (
        <Card title="Transactions">
          <Table
            head={["Reference", "Customer", "Amount", "Source", "Terms", "Status", "Reviewed", "When", "Actions"]}
          >
            {payments.length === 0 ? (
              <EmptyRow colSpan={9}>No transactions yet.</EmptyRow>
            ) : (
              payments.map((p) => (
                <Row key={p.reference}>
                  <Cell><code className="text-xs text-text-2">{p.reference}</code></Cell>
                  <Cell>
                    <div className="font-medium text-text">{p.customer_name || "—"}</div>
                    <div className="text-xs text-text-3 mt-0.5">{p.email}</div>
                  </Cell>
                  <Cell className="tabular-nums font-medium">{money(p.amount, p.currency)}</Cell>
                  <Cell className="text-text-2 text-xs">
                    {SOURCE_LABEL[p.source] || "Tier checkout"}
                  </Cell>
                  <Cell>{termsCell(p)}</Cell>
                  <Cell><StatusPill status={p.status} /></Cell>
                  <Cell>
                    <input
                      type="checkbox"
                      className="accent-accent"
                      aria-label={`Mark ${p.reference} reviewed`}
                      checked={!!p.reviewed}
                      onChange={() => toggleReviewed(p)}
                    />
                  </Cell>
                  <Cell className="text-text-3 whitespace-nowrap">{formatDateTime(p.created_at)}</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-1.5">
                      {(p.status === "pending" || p.status === "failed") && (
                        <IconButton
                          title="Recheck with Paystack"
                          disabled={busy === p.reference}
                          onClick={() => recheck(p)}
                        >
                          <RefreshCw
                            className={`w-4 h-4 ${busy === p.reference ? "animate-spin" : ""}`}
                          />
                        </IconButton>
                      )}
                      <IconButton
                        title={p.notes ? "Edit note" : "Add note"}
                        className={p.notes ? "text-accent" : ""}
                        onClick={() => {
                          setNotesFor(p);
                          setNotesText(p.notes || "");
                        }}
                      >
                        <StickyNote className="w-4 h-4" />
                      </IconButton>
                      <IconButton title="Delete" tone="danger" onClick={() => removePayment(p)}>
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Cell>
                </Row>
              ))
            )}
          </Table>
        </Card>
      )}

      {tab === "links" && (
        <Card title="Payment links">
          <Table head={["Client", "Description", "Amount", "Status", "Actions"]}>
            {links.length === 0 ? (
              <EmptyRow colSpan={5}>No payment links yet.</EmptyRow>
            ) : (
              links.map((l) => {
                const url = `${typeof window === "undefined" ? "" : window.location.origin}/pay.html?token=${l.token}`;
                return (
                  <Row key={l.id}>
                    <Cell>
                      <div className="font-medium text-text">{l.client_name}</div>
                      <div className="text-xs text-text-3 mt-0.5">{l.client_email}</div>
                    </Cell>
                    <Cell className="text-text-2">{l.description}</Cell>
                    <Cell className="tabular-nums font-medium">{money(l.amount, l.currency)}</Cell>
                    <Cell><StatusPill status={l.status} /></Cell>
                    <Cell>
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" onClick={() => copy(`link-${l.id}`, url)}>
                          {copied === `link-${l.id}` ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          {copied === `link-${l.id}` ? "Copied" : "Copy link"}
                        </Button>
                        {l.status === "pending" && (
                          <Button
                            variant="outline"
                            disabled={busy === `link-${l.id}`}
                            onClick={() => markLinkPaid(l)}
                          >
                            Mark as paid
                          </Button>
                        )}
                      </div>
                    </Cell>
                  </Row>
                );
              })
            )}
          </Table>
        </Card>
      )}

      {tab === "subscriptions" && (
        <Card title="Subscriptions">
          <Table head={["Client", "Plan", "Amount", "Status", "Next payment", "Charged", "Actions"]}>
            {subscriptions.length === 0 ? (
              <EmptyRow colSpan={7}>
                No subscriptions yet. Create one to bill a client on a schedule.
              </EmptyRow>
            ) : (
              subscriptions.map((s) => (
                <Row key={s.id}>
                  <Cell>
                    <div className="font-medium text-text">{s.client_name}</div>
                    <div className="text-xs text-text-3 mt-0.5">{s.client_email}</div>
                  </Cell>
                  <Cell className="text-text-2">{s.plan_name}</Cell>
                  <Cell className="tabular-nums font-medium whitespace-nowrap">
                    {money(s.amount, s.currency)}
                    <span className="text-xs text-text-3 font-normal">
                      {INTERVAL_LABEL[s.billing_interval] || ""}
                    </span>
                  </Cell>
                  <Cell><StatusPill status={s.status} /></Cell>
                  <Cell className="text-text-3 whitespace-nowrap">
                    {s.next_payment_at ? formatDate(s.next_payment_at) : "—"}
                  </Cell>
                  <Cell className="tabular-nums">
                    {s.charge_count > 0 ? (
                      <>
                        {money(s.charged_total, s.currency)}{" "}
                        <span className="text-text-3">({s.charge_count})</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      {s.status === "pending" && s.checkout_url && (
                        <Button
                          variant="outline"
                          onClick={() => copy(`sub-${s.id}`, s.checkout_url!)}
                        >
                          {copied === `sub-${s.id}` ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          {copied === `sub-${s.id}` ? "Copied" : "Copy checkout"}
                        </Button>
                      )}
                      {(s.status === "active" || s.status === "past_due") && (
                        <IconButton
                          title="Cancel subscription"
                          tone="danger"
                          disabled={busy === `sub-${s.id}`}
                          onClick={() => cancelSubscription(s)}
                        >
                          <Ban className="w-4 h-4" />
                        </IconButton>
                      )}
                      {(s.status === "pending" || s.status === "cancelled") && (
                        <IconButton
                          title="Delete record"
                          tone="danger"
                          onClick={() => deleteSubscription(s)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      )}
                    </div>
                  </Cell>
                </Row>
              ))
            )}
          </Table>
        </Card>
      )}

      {/* Notes */}
      <Modal
        isOpen={!!notesFor}
        onClose={() => setNotesFor(null)}
        title="Transaction note"
        description={notesFor?.reference}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNotesFor(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveNotes}>Save note</Button>
          </>
        }
      >
        <Field label="Note" hint="Only visible to you, in this admin.">
          <Textarea rows={4} value={notesText} onChange={(e) => setNotesText(e.target.value)} />
        </Field>
      </Modal>

      {/* Record a manual payment */}
      <Modal
        isOpen={recordOpen}
        onClose={() => setRecordOpen(false)}
        title="Record a payment"
        description="For money received outside Paystack — bank transfer, cash, mobile money."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRecordOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={recordPayment} disabled={busy === "record"}>
              {busy === "record" ? "Saving…" : "Record payment"}
            </Button>
          </>
        }
      >
        <Field label="Description">
          <Input
            required
            value={recordForm.description}
            onChange={(e) => setRecordForm({ ...recordForm, description: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" hint="In major units — e.g. 1500 for GHS 1,500.">
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={recordForm.amount}
              onChange={(e) => setRecordForm({ ...recordForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={recordForm.currency}
              onChange={(e) => setRecordForm({ ...recordForm, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Client name">
            <Input
              value={recordForm.customer_name}
              onChange={(e) => setRecordForm({ ...recordForm, customer_name: e.target.value })}
            />
          </Field>
          <Field label="Client email">
            <Input
              type="email"
              value={recordForm.email}
              onChange={(e) => setRecordForm({ ...recordForm, email: e.target.value })}
            />
          </Field>
          <Field label="Paid at">
            <Input
              type="date"
              value={recordForm.paid_at}
              onChange={(e) => setRecordForm({ ...recordForm, paid_at: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea
            rows={2}
            value={recordForm.notes}
            onChange={(e) => setRecordForm({ ...recordForm, notes: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent w-4 h-4"
            checked={recordForm.send_receipt}
            onChange={(e) => setRecordForm({ ...recordForm, send_receipt: e.target.checked })}
          />
          Email a receipt to the client
        </label>
      </Modal>

      {/* New payment link */}
      <Modal
        isOpen={linkOpen}
        onClose={() => setLinkOpen(false)}
        title="New payment link"
        description="A one-off pay-online link you can send to a client."
        footer={
          linkUrl ? (
            <Button variant="primary" onClick={() => setLinkOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={createLink}>Create link</Button>
            </>
          )
        }
      >
        {linkUrl ? (
          <Field label="Payment link">
            <div className="flex gap-2">
              <Input readOnly value={linkUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                className="flex-shrink-0"
                onClick={() => copy("new-link", linkUrl)}
              >
                {copied === "new-link" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client name">
                <Input
                  required
                  value={linkForm.client_name}
                  onChange={(e) => setLinkForm({ ...linkForm, client_name: e.target.value })}
                />
              </Field>
              <Field label="Client email">
                <Input
                  type="email"
                  required
                  value={linkForm.client_email}
                  onChange={(e) => setLinkForm({ ...linkForm, client_email: e.target.value })}
                />
              </Field>
              <Field label="Amount">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={linkForm.amount}
                  onChange={(e) => setLinkForm({ ...linkForm, amount: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={linkForm.currency}
                  onChange={(e) => setLinkForm({ ...linkForm, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Input
                required
                value={linkForm.description}
                onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })}
              />
            </Field>
          </>
        )}
      </Modal>

      {/* New subscription */}
      <Modal
        isOpen={subOpen}
        onClose={() => setSubOpen(false)}
        title="New subscription"
        description="Bills the client on a repeating schedule through Paystack."
        footer={
          subUrl ? (
            <Button variant="primary" onClick={() => setSubOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setSubOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={createSubscription}>Create subscription</Button>
            </>
          )
        }
      >
        {subUrl ? (
          <Field label="Checkout link" hint="Send this to the client to authorise the first charge.">
            <div className="flex gap-2">
              <Input readOnly value={subUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                className="flex-shrink-0"
                onClick={() => copy("new-sub", subUrl)}
              >
                {copied === "new-sub" ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                Copy
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Client name">
                <Input
                  required
                  value={subForm.client_name}
                  onChange={(e) => setSubForm({ ...subForm, client_name: e.target.value })}
                />
              </Field>
              <Field label="Client email">
                <Input
                  type="email"
                  required
                  value={subForm.client_email}
                  onChange={(e) => setSubForm({ ...subForm, client_email: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Plan name">
              <Input
                required
                value={subForm.plan_name}
                onChange={(e) => setSubForm({ ...subForm, plan_name: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Amount">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={subForm.amount}
                  onChange={(e) => setSubForm({ ...subForm, amount: e.target.value })}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={subForm.currency}
                  onChange={(e) => setSubForm({ ...subForm, currency: e.target.value })}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Interval">
                <Select
                  value={subForm.billing_interval}
                  onChange={(e) => setSubForm({ ...subForm, billing_interval: e.target.value })}
                >
                  {Object.keys(INTERVAL_LABEL).map((k) => (
                    <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>
                  ))}
                </Select>
              </Field>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
