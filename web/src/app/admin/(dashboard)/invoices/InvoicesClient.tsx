"use client";

import { useMemo, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Plus, Trash2, Send, Check, Ban, Pencil, ExternalLink, X } from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, Textarea, Select, StatusPill, ErrorBanner,
} from "@/components/admin/ui";

export type InvoiceItem = {
  description: string;
  quantity: number;
  /** Minor units, as stored by the API. */
  unit_amount?: number;
};

export type Invoice = {
  id: number;
  invoice_number: string;
  token: string;
  client_name: string;
  client_email: string;
  /** Minor units. */
  total: number;
  currency: string;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  notes?: string | null;
  items?: InvoiceItem[];
};

type FormItem = { description: string; quantity: string; unit_price: string };

const blankItem = (): FormItem => ({ description: "", quantity: "1", unit_price: "" });

const emptyForm = {
  client_name: "",
  client_email: "",
  currency: "GHS",
  issue_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  notes: "",
};

function formatAmount(subunits: number, currency: string) {
  return `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

const isOverdue = (inv: Invoice) =>
  inv.status === "sent" && !!inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10);

export default function InvoicesClient({ initialInvoices }: { initialInvoices: Invoice[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState<FormItem[]>([blankItem()]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid");
    const outstanding = invoices.filter((i) => i.status === "sent");
    // Invoices can be issued in more than one currency, so totals are summed
    // per currency and joined rather than added into a single meaningless number.
    const sumByCurrency = (list: Invoice[]) => {
      const totals: Record<string, number> = {};
      list.forEach((i) => {
        totals[i.currency] = (totals[i.currency] || 0) + i.total;
      });
      const entries = Object.entries(totals);
      return entries.length ? entries.map(([c, t]) => formatAmount(t, c)).join(" + ") : "—";
    };
    return {
      collected: sumByCurrency(paid),
      paidCount: paid.length,
      outstanding: sumByCurrency(outstanding),
      outstandingCount: outstanding.length,
      drafts: invoices.filter((i) => i.status === "draft").length,
      overdue: invoices.filter(isOverdue).length,
    };
  }, [invoices]);

  const total = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        0
      ),
    [items]
  );

  const refresh = async () => {
    setInvoices(asList<Invoice>(await adminApi.get("/api/v1/admin/invoices")));
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm);
    setItems([blankItem()]);
    setError(null);
    setIsOpen(true);
  };

  const openEdit = async (id: number) => {
    try {
      const inv = await adminApi.get<Invoice>(`/api/v1/admin/invoices/${id}`);
      setEditingId(id);
      setForm({
        client_name: inv.client_name,
        client_email: inv.client_email,
        currency: inv.currency,
        issue_date: inv.issue_date || "",
        due_date: inv.due_date || "",
        notes: inv.notes || "",
      });
      setItems(
        inv.items?.length
          ? inv.items.map((it) => ({
              description: it.description || "",
              quantity: String(it.quantity ?? 1),
              unit_price: it.unit_amount != null ? (it.unit_amount / 100).toFixed(2) : "",
            }))
          : [blankItem()]
      );
      setError(null);
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load that invoice.");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      due_date: form.due_date || null,
      items: items
        .map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        }))
        .filter((it) => it.description !== "" || it.unit_price > 0),
    };
    try {
      if (editingId) await adminApi.put(`/api/v1/admin/invoices/${editingId}`, payload);
      else await adminApi.post("/api/v1/admin/invoices", payload);
      setIsOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the invoice.");
    } finally {
      setSaving(false);
    }
  };

  const act = async (id: number, run: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await run();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const send = (inv: Invoice) => {
    if (!confirm("Email this invoice to the client (with a pay-online link)?")) return;
    act(inv.id, () => adminApi.post(`/api/v1/admin/invoices/${inv.id}/send`));
  };

  const markPaid = (inv: Invoice) => {
    if (!confirm("Mark this invoice as paid (e.g. bank transfer or cash received outside Paystack)?")) return;
    act(inv.id, () => adminApi.patch(`/api/v1/admin/invoices/${inv.id}`, { status: "paid" }));
  };

  const voidInvoice = (inv: Invoice) => {
    if (!confirm("Void this invoice? It stays viewable but can no longer be paid or edited.")) return;
    act(inv.id, () => adminApi.patch(`/api/v1/admin/invoices/${inv.id}`, { status: "void" }));
  };

  const remove = (inv: Invoice) => {
    if (!confirm("Delete this invoice permanently?")) return;
    act(inv.id, () => adminApi.del(`/api/v1/admin/invoices/${inv.id}`));
  };

  const setItem = (index: number, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Bookings & Payments"
        title="Get paid on time."
        description="Issue invoices with a pay-online link, then track what's collected and what's late."
        actions={
          <Button variant="primary" onClick={openNew}>
            <Plus className="w-4 h-4" />
            New invoice
          </Button>
        }
      />

      {error && !isOpen && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Collected" value={stats.collected} hint={`${stats.paidCount} paid`} />
        <StatCard
          label="Outstanding"
          value={stats.outstanding}
          hint={`${stats.outstandingCount} awaiting payment`}
        />
        <StatCard label="Drafts" value={stats.drafts} />
        <StatCard label="Overdue" value={stats.overdue} />
      </div>

      <Card title="Invoices">
        <Table head={["Number", "Client", "Total", "Status", "Issued", "Due", "Actions"]}>
          {invoices.length === 0 ? (
            <EmptyRow colSpan={7}>No invoices yet. Create your first one.</EmptyRow>
          ) : (
            invoices.map((inv) => {
              const editable = inv.status !== "paid" && inv.status !== "void";
              return (
                <Row key={inv.id}>
                  <Cell>
                    <code className="text-xs text-text-2">{inv.invoice_number}</code>
                  </Cell>
                  <Cell>
                    <div className="font-medium text-text">{inv.client_name}</div>
                    <div className="text-xs text-text-3 mt-0.5">{inv.client_email}</div>
                  </Cell>
                  <Cell className="tabular-nums font-medium">
                    {formatAmount(inv.total, inv.currency)}
                  </Cell>
                  <Cell>
                    <div className="flex flex-wrap gap-1">
                      <StatusPill status={inv.status} />
                      {isOverdue(inv) && <StatusPill status="overdue" />}
                    </div>
                  </Cell>
                  <Cell className="text-text-3 whitespace-nowrap">{inv.issue_date || "—"}</Cell>
                  <Cell className="text-text-3 whitespace-nowrap">{inv.due_date || "—"}</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={`/invoice?token=${encodeURIComponent(inv.token)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View invoice"
                        aria-label="View invoice"
                        className="p-1.5 text-text-3 rounded hover:bg-bg-3 hover:text-text transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      {editable && (
                        <>
                          <IconButton title="Edit" onClick={() => openEdit(inv.id)}>
                            <Pencil className="w-4 h-4" />
                          </IconButton>
                          <IconButton
                            title={inv.status === "sent" ? "Re-send" : "Send"}
                            disabled={busyId === inv.id}
                            onClick={() => send(inv)}
                          >
                            <Send className="w-4 h-4" />
                          </IconButton>
                          <IconButton
                            title="Mark paid"
                            tone="success"
                            disabled={busyId === inv.id}
                            onClick={() => markPaid(inv)}
                          >
                            <Check className="w-4 h-4" />
                          </IconButton>
                          <IconButton
                            title="Void"
                            tone="danger"
                            disabled={busyId === inv.id}
                            onClick={() => voidInvoice(inv)}
                          >
                            <Ban className="w-4 h-4" />
                          </IconButton>
                        </>
                      )}
                      {inv.status !== "paid" && (
                        <IconButton
                          title="Delete"
                          tone="danger"
                          disabled={busyId === inv.id}
                          onClick={() => remove(inv)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })
          )}
        </Table>
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit invoice" : "New invoice"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save invoice"}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name">
            <Input
              required
              value={form.client_name}
              onChange={(e) => setForm({ ...form, client_name: e.target.value })}
            />
          </Field>
          <Field label="Client email">
            <Input
              type="email"
              required
              value={form.client_email}
              onChange={(e) => setForm({ ...form, client_email: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {["GHS", "USD", "EUR", "GBP", "NGN"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Issue date">
            <Input
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Line items</span>
            <Button variant="outline" onClick={() => setItems((prev) => [...prev, blankItem()])}>
              <Plus className="w-4 h-4" />
              Add line
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_5rem_8rem_2rem] gap-2 items-center">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => setItem(i, { description: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => setItem(i, { quantity: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Unit price"
                  value={item.unit_price}
                  onChange={(e) => setItem(i, { unit_price: e.target.value })}
                />
                <IconButton
                  title="Remove line"
                  tone="danger"
                  onClick={() =>
                    setItems((prev) =>
                      prev.length > 1 ? prev.filter((_, idx) => idx !== i) : [blankItem()]
                    )
                  }
                >
                  <X className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>

          <div className="text-right text-sm font-semibold mt-3 tabular-nums">
            Total: {form.currency}{" "}
            {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>

        <Field label="Notes">
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>
      </Modal>
    </div>
  );
}
