"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi, asList } from "@/lib/api";
import {
  UserPlus, Plus, Download, Trash2, Power, Copy, Send, Upload, ArrowUpRight, Kanban,
} from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, Select, Textarea, FilterBar, StatusPill, ErrorBanner,
  Pagination, formatDate,
} from "@/components/admin/ui";

export type ClientRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  has_password: boolean | number;
  is_active: boolean | number;
  project_count: number;
  proposal_count: number;
  outstanding_invoice_count: number;
  last_proposal_at: string | null;
  created_at: string;
};

export type Automation = { id: number; name: string };

type Money = { total: number; currency: string };

export type ClientDetail = ClientRow & {
  intelligence?: {
    total_paid?: Money[];
    outstanding?: Money[];
    outstanding_invoices?: {
      invoice_number: string;
      due_date: string | null;
      total: number;
      currency: string;
    }[];
    project_count?: number;
    active_project_count?: number;
    project_history?: {
      id: number;
      title: string;
      progress_percent: number;
      updated_at: string;
      delivery_status: string;
    }[];
    last_contact?: { contacted_at: string; label: string } | null;
  };
  projects?: {
    id: number;
    title: string;
    progress_percent: number;
    delivery_status: string;
    is_published: boolean | number;
    contract_value: number;
    profit: number;
    margin_percent: number;
    hours_worked: number;
    finance_currency: string | null;
  }[];
  proposals?: { title: string; status: string; total_amount: number; currency: string }[];
  files?: { file_path: string; original_name: string; uploaded_by: string; created_at: string }[];
  messages?: { sender_type: string; body: string; created_at: string }[];
};

export type Enrollment = {
  id: number;
  automation_id: number;
  automation_name: string;
  enrolled_at: string;
  steps_received: number;
  status: string;
};

const TABS = ["overview", "projects", "proposals", "files", "messages", "automations"] as const;
type Tab = (typeof TABS)[number];

const PROJECT_STATUS: Record<string, string> = {
  on_track: "On track",
  needs_attention: "Needs attention",
  at_risk: "At risk",
  due_this_month: "Due this month",
};

const PROJECT_STATUS_TONE: Record<string, "green" | "amber" | "red" | "blue"> = {
  on_track: "green",
  needs_attention: "amber",
  at_risk: "red",
  due_this_month: "blue",
};

const PER_PAGE = 20;

function money(subunits: number, currency: string) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
}

function initials(name: string) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] || "")
    .join("")
    .toUpperCase();
}

function amountList(rows: Money[] | undefined, emptyLabel: string) {
  return rows?.length ? rows.map((r) => money(r.total, r.currency)).join(" + ") : emptyLabel;
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export default function ClientsClient({
  initialClients,
  automations,
}: {
  initialClients: ClientRow[];
  automations: Automation[];
}) {
  const [clients, setClients] = useState(initialClients);
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [workFilter, setWorkFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", phone: "" });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "" });

  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [selectedAutomation, setSelectedAutomation] = useState("");
  const [busy, setBusy] = useState(false);
  const searchParams = useSearchParams();

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => {
      const matchesQuery =
        !q || [c.name, c.email, c.phone].some((v) => String(v || "").toLowerCase().includes(q));
      const matchesAccount =
        accountFilter === "all" ||
        (accountFilter === "active" && Number(c.is_active)) ||
        (accountFilter === "invited" && !c.has_password && Number(c.is_active)) ||
        (accountFilter === "deactivated" && !Number(c.is_active));
      const matchesWork =
        workFilter === "all" ||
        (workFilter === "projects" && Number(c.project_count) > 0) ||
        (workFilter === "no_projects" && Number(c.project_count) === 0) ||
        (workFilter === "outstanding" && Number(c.outstanding_invoice_count) > 0);
      return matchesQuery && matchesAccount && matchesWork;
    });
  }, [clients, search, accountFilter, workFilter]);

  const totalPages = Math.max(1, Math.ceil(matches.length / PER_PAGE));
  const pageRows = matches.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const refresh = async () => {
    setClients(asList<ClientRow>(await adminApi.get("/api/v1/admin/clients")));
  };

  const loadEnrollments = async (email: string) => {
    try {
      setEnrollments(
        await adminApi.get<Enrollment[]>(
          `/api/v1/admin/drip/enrollments?email=${encodeURIComponent(email)}`
        )
      );
    } catch {
      setEnrollments([]);
    }
  };

  const openDetail = async (id: number, initialTab: Tab = "overview") => {
    try {
      const client = await adminApi.get<ClientDetail>(`/api/v1/admin/clients/${id}`);
      setDetail(client);
      setTab(initialTab);
      setMessageBody("");
      await loadEnrollments(client.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that client.");
    }
  };

  // Deep link: ?open=<id>&tab=<tab>
  useEffect(() => {
    const openId = Number(searchParams.get("open"));
    if (!openId || !clients.some((c) => Number(c.id) === openId)) return;
    const requested = searchParams.get("tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
    openDetail(openId, TABS.includes(requested as Tab) ? (requested as Tab) : "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleActive = async (c: ClientRow) => {
    try {
      await adminApi.patch(`/api/v1/admin/clients/${c.id}`, { is_active: !Number(c.is_active) });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the client.");
    }
  };

  const remove = async (c: ClientRow) => {
    if (!confirm("Delete this client permanently? This removes their portal account, files, and messages. This can't be undone.")) return;
    try {
      await adminApi.del(`/api/v1/admin/clients/${c.id}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the client.");
    }
  };

  const exportCsv = () => {
    const headings = [
      "Name", "Email", "Phone", "Portal setup", "Account status",
      "Projects", "Proposals", "Outstanding invoices", "Created",
    ];
    const lines = [
      headings,
      ...matches.map((c) => [
        c.name, c.email, c.phone || "",
        c.has_password ? "Activated" : "Awaiting setup",
        Number(c.is_active) ? "Active" : "Deactivated",
        Number(c.project_count || 0),
        Number(c.proposal_count || 0),
        Number(c.outstanding_invoice_count || 0),
        c.created_at,
      ]),
    ];
    const blob = new Blob(
      ["﻿" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n")],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.post<{ url: string }>("/api/v1/admin/clients/invite", inviteForm);
      setInviteUrl(result.url);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setBusy(false);
    }
  };

  const addClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.post("/api/v1/admin/clients", addForm);
      setAddOpen(false);
      setAddForm({ name: "", email: "", phone: "" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the client.");
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !messageBody.trim()) return;
    try {
      await adminApi.post(`/api/v1/admin/clients/${detail.id}/messages`, { body: messageBody });
      setMessageBody("");
      const messages = await adminApi.get<ClientDetail["messages"]>(
        `/api/v1/admin/clients/${detail.id}/messages`
      );
      setDetail({ ...detail, messages });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the message.");
    }
  };

  const uploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      // Multipart upload can't go through the JSON helper.
      const res = await fetch(`/api/v1/admin/clients/${detail.id}/files`, {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed.");
      }
      setDetail(await adminApi.get<ClientDetail>(`/api/v1/admin/clients/${detail.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the file.");
    } finally {
      e.target.value = "";
    }
  };

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail || !selectedAutomation) return;
    try {
      await adminApi.post("/api/v1/admin/drip/enrollments", {
        automation_id: Number(selectedAutomation),
        email: detail.email,
        name: detail.name,
      });
      await loadEnrollments(detail.email);
      setSelectedAutomation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enroll the client.");
    }
  };

  const toggleEnrollment = async (en: Enrollment) => {
    try {
      await adminApi.patch(`/api/v1/admin/drip/enrollments/${en.id}`, {
        status: en.status === "active" ? "stopped" : "active",
      });
      if (detail) await loadEnrollments(detail.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the enrollment.");
    }
  };

  const removeEnrollment = async (en: Enrollment) => {
    if (!confirm("Remove this automation enrollment?")) return;
    try {
      await adminApi.del(`/api/v1/admin/drip/enrollments/${en.id}`);
      if (detail) await loadEnrollments(detail.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the enrollment.");
    }
  };

  const enrolledIds = new Set(enrollments.map((e) => Number(e.automation_id)));
  const availableAutomations = automations.filter((a) => !enrolledIds.has(Number(a.id)));
  const intel = detail?.intelligence ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="The people you're actually working for."
        description="Portal accounts, linked projects, proposals, files, and the money still owed."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAddForm({ name: "", email: "", phone: "" });
                setAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add client
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setInviteForm({ name: "", email: "", phone: "" });
                setInviteUrl(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4" />
              Invite to portal
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total clients" value={clients.length} />
        <StatCard label="Portal activated" value={clients.filter((c) => c.has_password).length} />
        <StatCard label="Active accounts" value={clients.filter((c) => Number(c.is_active)).length} />
      </div>

      <FilterBar>
        <Input
          className="w-auto min-w-64"
          placeholder="Search name, email or phone…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          className="w-auto min-w-44"
          value={accountFilter}
          onChange={(e) => {
            setAccountFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All accounts</option>
          <option value="active">Active</option>
          <option value="invited">Invited (no password)</option>
          <option value="deactivated">Deactivated</option>
        </Select>
        <Select
          className="w-auto min-w-48"
          value={workFilter}
          onChange={(e) => {
            setWorkFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">All work</option>
          <option value="projects">Has projects</option>
          <option value="no_projects">No projects</option>
          <option value="outstanding">Outstanding invoices</option>
        </Select>
      </FilterBar>

      <Card title={`Clients (${matches.length})`}>
        <Table head={["Client", "Portal", "Projects", "Proposals", "Last proposal", "Account", "Actions"]}>
          {pageRows.length === 0 ? (
            <EmptyRow colSpan={7}>
              {clients.length
                ? "No matching clients. Try another search or filter."
                : "No clients yet. Invite a client to give them access to proposals, files, and messages."}
            </EmptyRow>
          ) : (
            pageRows.map((c) => (
              <Row key={c.id} onClick={() => openDetail(c.id)}>
                <Cell>
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-bg-3 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                      {initials(c.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="font-medium text-text truncate">{c.name}</div>
                      <div className="text-xs text-text-3 truncate">
                        {c.email}
                        {c.phone && ` · ${c.phone}`}
                      </div>
                    </div>
                  </div>
                </Cell>
                <Cell>
                  <StatusPill
                    status={c.has_password ? "Active" : "Invited"}
                    tone={c.has_password ? "green" : "amber"}
                  />
                </Cell>
                <Cell className="tabular-nums text-text-2">{c.project_count || 0}</Cell>
                <Cell className="tabular-nums text-text-2">{c.proposal_count || 0}</Cell>
                <Cell className="text-text-3 whitespace-nowrap">
                  {c.last_proposal_at ? formatDate(c.last_proposal_at) : "—"}
                </Cell>
                <Cell>
                  <StatusPill
                    status={c.is_active ? "Active" : "Deactivated"}
                    tone={c.is_active ? "green" : "neutral"}
                  />
                </Cell>
                <Cell>
                  <div
                    className="flex items-center justify-end gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button variant="outline" onClick={() => openDetail(c.id)}>Open</Button>
                    <IconButton
                      title={c.is_active ? "Deactivate account" : "Reactivate account"}
                      onClick={() => toggleActive(c)}
                    >
                      <Power className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Delete permanently" tone="danger" onClick={() => remove(c)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
        {matches.length > PER_PAGE && (
          <Pagination page={page} totalPages={totalPages} total={matches.length} onChange={setPage} />
        )}
      </Card>

      {/* Invite */}
      <Modal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a client to the portal"
        description="Sends a setup link so they can pick their own password."
        footer={
          inviteUrl ? (
            <Button variant="primary" onClick={() => setInviteOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={invite} disabled={busy || !inviteForm.email}>
                {busy ? "Sending…" : "Send invite"}
              </Button>
            </>
          )
        }
      >
        {inviteUrl ? (
          <Field label="Setup link" hint="Share this if the email doesn't arrive.">
            <div className="flex gap-2">
              <Input readOnly value={inviteUrl} onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                className="flex-shrink-0"
              >
                <Copy className="w-4 h-4" />
                Copy
              </Button>
            </div>
          </Field>
        ) : (
          <>
            <Field label="Name">
              <Input
                required
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={inviteForm.phone}
                onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
              />
            </Field>
          </>
        )}
      </Modal>

      {/* Add client */}
      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a client"
        description="Creates the record without sending a portal invite."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addClient} disabled={busy || !addForm.email}>
              {busy ? "Saving…" : "Add client"}
            </Button>
          </>
        }
      >
        <Field label="Name">
          <Input
            required
            value={addForm.name}
            onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            required
            value={addForm.email}
            onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <Input
            value={addForm.phone}
            onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
          />
        </Field>
      </Modal>

      {/* Client detail */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.name ?? ""}
        description={detail ? detail.email + (detail.phone ? ` · ${detail.phone}` : "") : undefined}
        size="xl"
      >
        {detail && (
          <>
            <div className="flex flex-wrap gap-1 border-b border-hairline pb-3">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                    tab === t ? "bg-bg-3 text-text" : "text-text-2 hover:text-text"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <div className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Total paid"
                    value={amountList(intel.total_paid, "No payments")}
                    hint="Successful Paystack payments"
                  />
                  <StatCard
                    label="Outstanding"
                    value={amountList(intel.outstanding, "Nothing due")}
                    hint={`${intel.outstanding_invoices?.length ?? 0} sent invoice${
                      intel.outstanding_invoices?.length === 1 ? "" : "s"
                    }`}
                  />
                  <StatCard
                    label="Project history"
                    value={Number(intel.project_count || 0)}
                    hint={`${Number(intel.active_project_count || 0)} currently active`}
                  />
                  <StatCard
                    label="Last contact"
                    value={
                      intel.last_contact
                        ? formatDate(intel.last_contact.contacted_at)
                        : "No contact yet"
                    }
                    hint={intel.last_contact?.label || "No linked interaction"}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card title="Outstanding invoices" bodyClassName="p-4 space-y-2">
                    {intel.outstanding_invoices?.length ? (
                      intel.outstanding_invoices.map((inv) => {
                        const overdue = !!inv.due_date && inv.due_date < today;
                        return (
                          <a
                            key={inv.invoice_number}
                            href="/admin/invoices"
                            className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-bg-3 transition-colors"
                          >
                            <div>
                              <strong className="text-sm block">{inv.invoice_number}</strong>
                              <small className={overdue ? "text-red-500" : "text-text-3"}>
                                {inv.due_date
                                  ? `${overdue ? "Overdue" : "Due"} ${formatDate(inv.due_date)}`
                                  : "No due date"}
                              </small>
                            </div>
                            <b className="tabular-nums text-sm">{money(inv.total, inv.currency)}</b>
                          </a>
                        );
                      })
                    ) : (
                      <p className="text-sm text-text-3">No sent invoices are awaiting payment.</p>
                    )}
                  </Card>

                  <Card title="Recent project history" bodyClassName="p-4 space-y-2">
                    {intel.project_history?.length ? (
                      intel.project_history.map((p) => (
                        <a
                          key={p.id}
                          href={`/admin/projects?edit=${p.id}`}
                          className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-bg-3 transition-colors"
                        >
                          <div className="min-w-0">
                            <strong className="text-sm block truncate">{p.title}</strong>
                            <small className="text-text-3">
                              {Number(p.progress_percent)}% complete · updated {formatDate(p.updated_at)}
                            </small>
                          </div>
                          <StatusPill
                            status={PROJECT_STATUS[p.delivery_status] || "On track"}
                            tone={PROJECT_STATUS_TONE[p.delivery_status] ?? "green"}
                          />
                        </a>
                      ))
                    ) : (
                      <p className="text-sm text-text-3">No projects are linked to this client.</p>
                    )}
                  </Card>
                </div>
              </div>
            )}

            {tab === "projects" && (
              <div className="space-y-3">
                {detail.projects?.length ? (
                  detail.projects.map((p) => {
                    const currency = p.finance_currency || "GHS";
                    const hasValue = Number(p.contract_value || 0) > 0;
                    return (
                      <article
                        key={p.id}
                        className="rounded-lg border border-hairline p-4 grid gap-4 sm:grid-cols-[1fr_12rem_auto] items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <StatusPill
                              status={PROJECT_STATUS[p.delivery_status] || "On track"}
                              tone={PROJECT_STATUS_TONE[p.delivery_status] ?? "green"}
                            />
                            <span className="text-xs text-text-3">
                              {p.is_published ? "Published" : "Internal draft"}
                            </span>
                          </div>
                          <h6 className="font-semibold text-sm truncate">{p.title}</h6>
                          <div className="h-1.5 rounded-full bg-bg-3 overflow-hidden mt-2">
                            <div
                              className="h-full bg-accent rounded-full"
                              style={{ width: `${Number(p.progress_percent || 0)}%` }}
                            />
                          </div>
                          <small className="text-xs text-text-3">
                            {Number(p.progress_percent || 0)}% complete
                          </small>
                        </div>

                        <div>
                          <span className="text-xs text-text-3 block">Project value</span>
                          <strong className="text-sm">
                            {hasValue ? money(p.contract_value, currency) : "Not set"}
                          </strong>
                          <small className="text-xs text-text-3 block mt-0.5">
                            {hasValue
                              ? `${money(p.profit, currency)} profit · ${p.margin_percent}% margin`
                              : `${Number(p.hours_worked || 0).toLocaleString()} hours logged`}
                          </small>
                        </div>

                        <a
                          href={`/admin/projects?edit=${p.id}`}
                          className="inline-flex items-center gap-1.5 text-sm font-medium hover:text-accent transition-colors whitespace-nowrap"
                        >
                          Edit project
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-hairline p-6 text-center">
                    <Kanban className="w-7 h-7 mx-auto text-text-3 mb-2" />
                    <strong className="block text-sm">No linked projects</strong>
                    <p className="text-sm text-text-3 mt-1 mb-3">
                      Assign this client while editing a project to show it here.
                    </p>
                    <a
                      href="/admin/projects"
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors"
                    >
                      Open Projects
                    </a>
                  </div>
                )}
              </div>
            )}

            {tab === "proposals" && (
              <div className="space-y-2">
                {detail.proposals?.length ? (
                  detail.proposals.map((p, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-hairline p-3 flex items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-sm">{p.title}</div>
                        <div className="text-xs text-text-3 mt-0.5">
                          {money(p.total_amount, p.currency)}
                        </div>
                      </div>
                      <StatusPill status={p.status} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-3">No proposals for this client yet.</p>
                )}
              </div>
            )}

            {tab === "files" && (
              <div className="space-y-3">
                <label className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors cursor-pointer w-fit">
                  <Upload className="w-4 h-4" />
                  Upload a file
                  <input type="file" className="sr-only" onChange={uploadFile} />
                </label>

                {detail.files?.length ? (
                  detail.files.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-hairline px-3 py-2 flex items-center justify-between gap-3"
                    >
                      <a
                        href={f.file_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:text-accent truncate"
                      >
                        {f.original_name}
                      </a>
                      <span className="text-xs text-text-3 whitespace-nowrap">
                        {f.uploaded_by === "admin" ? "Sent by you" : "From client"} ·{" "}
                        {formatDate(f.created_at)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-3">No files yet.</p>
                )}
              </div>
            )}

            {tab === "messages" && (
              <div className="space-y-3">
                <div className="max-h-80 overflow-y-auto custom-scrollbar space-y-2 rounded-lg border border-hairline p-3">
                  {detail.messages?.length ? (
                    detail.messages.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-lg px-3 py-2 max-w-[80%] ${
                          m.sender_type === "admin"
                            ? "bg-accent-soft ml-auto"
                            : "bg-bg-3"
                        }`}
                      >
                        <p className="text-sm">{m.body}</p>
                        <span className="text-xs text-text-3 mt-1 block">
                          {new Date(m.created_at.replace(" ", "T") + "Z").toLocaleString()}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-text-3">No messages yet.</p>
                  )}
                </div>

                <form onSubmit={sendMessage} className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="Write a message to this client"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                  />
                  <Button type="submit" variant="primary" disabled={!messageBody.trim()}>
                    <Send className="w-4 h-4" />
                    Send message
                  </Button>
                </form>
              </div>
            )}

            {tab === "automations" && (
              <div className="space-y-3">
                {enrollments.length ? (
                  enrollments.map((en) => (
                    <div
                      key={en.id}
                      className="rounded-lg border border-hairline p-3 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div>
                        <div className="font-semibold text-sm">{en.automation_name}</div>
                        <div className="text-xs text-text-3 mt-0.5">
                          Enrolled {formatDate(en.enrolled_at)} · {en.steps_received || 0} step
                          {Number(en.steps_received) === 1 ? "" : "s"} sent
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill
                          status={en.status === "active" ? "Active" : "Stopped"}
                          tone={en.status === "active" ? "green" : "neutral"}
                        />
                        <Button variant="outline" onClick={() => toggleEnrollment(en)}>
                          {en.status === "active" ? "Stop" : "Reactivate"}
                        </Button>
                        <IconButton title="Remove enrollment" tone="danger" onClick={() => removeEnrollment(en)}>
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-3">Not enrolled in any automation yet.</p>
                )}

                <form onSubmit={enroll} className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-hairline">
                  <Select
                    value={selectedAutomation}
                    onChange={(e) => setSelectedAutomation(e.target.value)}
                    disabled={!availableAutomations.length}
                  >
                    <option value="">
                      {availableAutomations.length ? "Choose an automation…" : "No automations available"}
                    </option>
                    {availableAutomations.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-shrink-0"
                    disabled={!selectedAutomation}
                  >
                    Enroll
                  </Button>
                </form>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
