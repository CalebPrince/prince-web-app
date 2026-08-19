"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { adminApi, asList } from "@/lib/api";
import {
  Plus, Trash2, Pencil, Copy, Check, Send, UserPlus, ExternalLink, Sparkles, X,
} from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton, Modal,
  Field, Input, Textarea, Select, StatusPill, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type Milestone = { title: string; amount: number; due_note: string };

export type Proposal = {
  id: number;
  token: string;
  title: string;
  client_name: string;
  client_email: string;
  /** Minor units. */
  total_amount: number;
  currency: string;
  status: string;
  service_category: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_by_name: string | null;
  milestone_count: number;
  paid_milestone_count: number;
};

export type ProposalDetail = Proposal & {
  inquiry_id: number | null;
  scope: string | null;
  timeline: string | null;
  terms: string | null;
  mockup_image_url: string | null;
  milestones: Milestone[];
};

export type QuoteRequest = {
  id: number;
  name: string;
  email: string;
  project_type: string | null;
  message: string | null;
  features: string | null;
  budget: string | null;
  timeline: string | null;
  created_at: string;
};

export type ProposalDraft = {
  id: number;
  status: string;
  client_name: string;
  client_email: string;
  topic: string | null;
  title: string | null;
  error_note: string | null;
  currency?: string;
  scope?: string;
  timeline?: string;
  terms?: string;
  milestones?: { title: string; amount: number; due_note: string }[];
  grounding_source?: string;
  grounding_note?: string;
};

const SERVICE_CATEGORIES: Record<string, string> = {
  website: "Websites",
  mobile_app: "Mobile apps",
  brand_system: "Brand systems",
  strategy: "Strategy",
  other: "Other",
};

const GROUNDING_LABEL: Record<string, string> = {
  engineering_tiers: "Grounded in a real published pricing tier.",
  inquiry_budget: "Grounded in the client's own stated budget.",
  none: "No real pricing data to ground this in — these are placeholder numbers.",
};

const CURRENCIES = ["GHS", "USD", "EUR", "GBP", "NGN"];

const DEFAULT_TERMS =
  "Work begins after the first milestone payment is confirmed. Scope changes may require a revised quote. Final files and deployment are handed over after all agreed milestones are paid.";

type FormMilestone = { title: string; amount: string; due_note: string };

const defaultMilestones = (): FormMilestone[] => [
  { title: "50% deposit", amount: "", due_note: "Due before kickoff" },
  { title: "50% final payment", amount: "", due_note: "Due before final handoff" },
];

const emptyForm = {
  inquiry_id: "",
  client_name: "",
  client_email: "",
  title: "",
  currency: "GHS",
  service_category: "",
  scope: "",
  timeline: "",
  terms: DEFAULT_TERMS,
  mockup_image_url: "",
};

function money(subunits: number, currency: string) {
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  })}`;
}

export default function ProposalsClient({
  initialProposals,
  quoteRequests,
  initialDrafts,
}: {
  initialProposals: Proposal[];
  quoteRequests: QuoteRequest[];
  initialDrafts: ProposalDraft[];
}) {
  const [proposals, setProposals] = useState(initialProposals);
  const [drafts, setDrafts] = useState(initialDrafts);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; url?: string } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [milestones, setMilestones] = useState<FormMilestone[]>(defaultMilestones());
  const [aiBrief, setAiBrief] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);

  const searchParams = useSearchParams();
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const proposalUrl = (p: Proposal) => `${origin}/proposal.html?token=${p.token}`;

  const reloadProposals = async () => {
    setProposals(asList<Proposal>(await adminApi.get("/api/v1/admin/proposals")));
  };

  // The poll re-schedules itself, so it reads the latest implementation through
  // a ref rather than closing over the callback identity it was defined with.
  const loadDraftsRef = useRef<() => Promise<void>>(async () => {});

  const loadDrafts = useCallback(async () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    try {
      const rows = asList<ProposalDraft>(await adminApi.get("/api/v1/admin/proposal-drafts"));
      setDrafts(rows);
      // While a booking's draft is still queued the cron hasn't filled it in
      // yet — re-poll so the card flips to reviewable/failed on its own.
      if (rows.some((d) => d.status === "queued")) {
        pollTimer.current = setTimeout(() => loadDraftsRef.current(), 15000);
      }
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    loadDraftsRef.current = loadDrafts;
  }, [loadDrafts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- starts the poll only when the server already handed us a queued draft
    if (initialDrafts.some((d) => d.status === "queued")) loadDrafts();
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [initialDrafts, loadDrafts]);

  const openNew = useCallback(
    (prefill?: Partial<typeof emptyForm>) => {
      setEditingId(null);
      setForm({ ...emptyForm, ...prefill });
      setMilestones(defaultMilestones());
      setAiBrief("");
      setAiNote(null);
      setError(null);
      setIsOpen(true);
    },
    []
  );

  // Deep link from Contacts / Quote requests: open a prefilled new proposal.
  useEffect(() => {
    const inquiryId = searchParams.get("inquiry_id");
    const clientName = searchParams.get("client_name");
    const clientEmail = searchParams.get("client_email");
    if (!inquiryId && !clientEmail) return;
    if (inquiryId) {
      const q = quoteRequests.find((x) => String(x.id) === inquiryId);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot sync from the URL/localStorage on mount
      openNew(
        q
          ? {
              inquiry_id: inquiryId,
              client_name: q.name || "",
              client_email: q.email || "",
              title: `${q.project_type || "Project"} proposal`,
              timeline: q.timeline || "",
              scope: [
                q.message || "",
                q.features ? `Requested features: ${q.features}` : "",
                q.budget ? `Requested budget: ${q.budget}` : "",
              ]
                .filter(Boolean)
                .join("\n\n"),
            }
          : { inquiry_id: inquiryId }
      );
    } else {
      openNew({ client_name: clientName || "", client_email: clientEmail || "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Prefill the form from a linked quote request when one is picked. */
  const pickQuote = (id: string) => {
    const q = quoteRequests.find((x) => String(x.id) === id);
    if (!q) {
      setForm((f) => ({ ...f, inquiry_id: id }));
      return;
    }
    setForm((f) => ({
      ...f,
      inquiry_id: id,
      client_name: q.name || "",
      client_email: q.email || "",
      title: `${q.project_type || "Project"} proposal`,
      timeline: q.timeline || "",
      scope: [
        q.message || "",
        q.features ? `Requested features: ${q.features}` : "",
        q.budget ? `Requested budget: ${q.budget}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }));
  };

  const openEdit = async (id: number) => {
    try {
      const p = await adminApi.get<ProposalDetail>(`/api/v1/admin/proposals/${id}`);
      setEditingId(p.id);
      setForm({
        inquiry_id: p.inquiry_id ? String(p.inquiry_id) : "",
        client_name: p.client_name || "",
        client_email: p.client_email || "",
        title: p.title || "",
        currency: p.currency || "GHS",
        service_category: p.service_category || "",
        scope: p.scope || "",
        timeline: p.timeline || "",
        terms: p.terms || "",
        mockup_image_url: p.mockup_image_url || "",
      });
      setMilestones(
        p.milestones?.length
          ? p.milestones.map((m) => ({
              title: m.title || "",
              amount: String(Number(m.amount || 0) / 100),
              due_note: m.due_note || "",
            }))
          : [{ title: "", amount: "", due_note: "" }]
      );
      setAiNote(null);
      setError(null);
      setIsOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load proposal.");
    }
  };

  /** Same JSON shape from a live generate() call and a queued booking draft. */
  const applyDraft = (draft: Partial<ProposalDraft> & { client_name?: string }) => {
    setForm((f) => ({
      ...f,
      client_name: draft.client_name || f.client_name,
      client_email: draft.client_email || f.client_email,
      title: draft.title || "",
      currency: draft.currency || "GHS",
      scope: draft.scope || "",
      timeline: draft.timeline || "",
      terms: draft.terms || DEFAULT_TERMS,
    }));
    setMilestones(
      draft.milestones?.length
        ? draft.milestones.map((m) => ({
            title: m.title || "",
            amount: String(m.amount ?? ""),
            due_note: m.due_note || "",
          }))
        : [{ title: "", amount: "", due_note: "" }]
    );
  };

  const draftWithAi = async () => {
    if (!form.inquiry_id && !aiBrief.trim()) {
      setAiNote("Pick a quote request above, or describe the project in the box first.");
      return;
    }
    setDrafting(true);
    setAiNote(null);
    try {
      const draft = await adminApi.post<ProposalDraft>("/api/v1/admin/proposals/generate", {
        inquiry_id: form.inquiry_id || undefined,
        brief: aiBrief.trim() || undefined,
      });
      applyDraft(draft);
      setAiNote(
        (GROUNDING_LABEL[draft.grounding_source ?? ""] || "") +
          (draft.grounding_note ? ` ${draft.grounding_note}` : "")
      );
    } catch (err) {
      setAiNote(err instanceof Error ? err.message : "Could not generate a draft.");
    } finally {
      setDrafting(false);
    }
  };

  const reviewDraft = async (draft: ProposalDraft) => {
    openNew();
    applyDraft(draft);
    setAiNote(
      "Drafted automatically from a booked discovery call." +
        (GROUNDING_LABEL[draft.grounding_source ?? ""] ? ` ${GROUNDING_LABEL[draft.grounding_source!]}` : "") +
        (draft.grounding_note ? ` ${draft.grounding_note}` : "")
    );
    try {
      await adminApi.del(`/api/v1/admin/proposal-drafts/${draft.id}`);
    } catch {
      // Non-fatal — worst case this row reappears on the next load.
    }
    await loadDrafts();
  };

  const dismissDraft = async (id: number) => {
    try {
      await adminApi.del(`/api/v1/admin/proposal-drafts/${id}`);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not dismiss the draft.");
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      milestones: milestones
        .map((m) => ({
          title: m.title.trim(),
          amount: Number(m.amount),
          due_note: m.due_note.trim(),
        }))
        .filter((m) => m.title || m.amount),
    };
    try {
      const result = editingId
        ? await adminApi.put<{ url: string }>(`/api/v1/admin/proposals/${editingId}`, payload)
        : await adminApi.post<{ url: string }>("/api/v1/admin/proposals", payload);
      setIsOpen(false);
      setNotice({
        text: editingId ? "Proposal updated." : "Proposal created.",
        url: `${origin}${result.url}`,
      });
      await reloadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the proposal.");
    } finally {
      setSaving(false);
    }
  };

  const send = async (p: Proposal) => {
    setBusy(p.id);
    try {
      const result = await adminApi.post<{ url: string }>(`/api/v1/admin/proposals/${p.id}/send`);
      setNotice({ text: "Proposal email sent.", url: result.url });
      await reloadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send proposal email.");
    } finally {
      setBusy(null);
    }
  };

  const invite = async (p: Proposal) => {
    setBusy(p.id);
    try {
      const result = await adminApi.post<{ url: string }>("/api/v1/admin/clients/invite", {
        name: p.client_name,
        email: p.client_email,
      });
      setNotice({ text: "Portal invite sent.", url: result.url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send portal invite.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: Proposal) => {
    if (!confirm("Delete this proposal permanently? This can't be undone.")) return;
    try {
      await adminApi.del(`/api/v1/admin/proposals/${p.id}`);
      setProposals((prev) => prev.filter((x) => x.id !== p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the proposal.");
    }
  };

  const copyLink = async (p: Proposal) => {
    const url = proposalUrl(p);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(p.id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      prompt("Copy this proposal link:", url);
    }
  };

  const setMilestone = (index: number, patch: Partial<FormMilestone>) => {
    setMilestones((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Turn a conversation into a signed deal."
        description="Scope, milestones and terms in one shareable page the client can accept online."
        actions={
          <Button variant="primary" onClick={() => openNew()}>
            <Plus className="w-4 h-4" />
            Create proposal
          </Button>
        }
      />

      {error && !isOpen && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {notice && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500">
          <span>
            {notice.text}
            {notice.url && (
              <a
                href={notice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline ml-1.5"
              >
                Open proposal
              </a>
            )}
          </span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {drafts.length > 0 && (
        <Card title="Drafted from bookings" bodyClassName="p-4 space-y-2">
          {drafts.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-hairline p-3 flex flex-wrap items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <strong className="text-sm">{d.client_name}</strong>
                {d.status !== "queued" && (
                  <span className="text-xs text-text-3 ml-2">{d.client_email}</span>
                )}
                {d.topic && <div className="text-xs text-text-3 mt-0.5">{d.topic}</div>}

                {d.status === "queued" ? (
                  <div className="text-xs text-text-3 mt-1">
                    Drafting a proposal from the booking…
                  </div>
                ) : d.status === "failed" ? (
                  <div className="text-xs text-red-400 mt-1">
                    Could not draft a proposal automatically
                    {d.error_note ? ` — ${d.error_note.replace(/\.+$/, "")}` : ""}. Use &quot;Draft with
                    AI&quot; on a new proposal instead.
                  </div>
                ) : (
                  <div className="text-sm mt-1">{d.title || ""}</div>
                )}
              </div>

              <div className="flex gap-2 flex-shrink-0">
                {d.status !== "queued" && d.status !== "failed" && (
                  <Button variant="primary" onClick={() => reviewDraft(d)}>
                    Review &amp; create
                  </Button>
                )}
                <Button variant="outline" onClick={() => dismissDraft(d.id)}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Card title="Proposals">
        <Table head={["Proposal", "Client", "Total", "Status", "Milestones", "Actions"]}>
          {proposals.length === 0 ? (
            <EmptyRow colSpan={6}>No proposals yet.</EmptyRow>
          ) : (
            proposals.map((p) => (
              <Row key={p.id}>
                <Cell>
                  <div className="font-semibold text-text flex items-center gap-2 flex-wrap">
                    {p.title}
                    {p.service_category && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider bg-bg-3 text-text-2">
                        {SERVICE_CATEGORIES[p.service_category] || p.service_category}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-3 mt-0.5">{formatDateTime(p.created_at)}</div>
                </Cell>
                <Cell>
                  <div className="text-text">{p.client_name}</div>
                  <div className="text-xs text-text-3 mt-0.5">{p.client_email}</div>
                </Cell>
                <Cell className="tabular-nums font-medium">
                  {money(p.total_amount, p.currency)}
                </Cell>
                <Cell>
                  <StatusPill status={p.status} />
                  {p.status === "accepted" && (
                    <div className="text-xs text-text-3 mt-1">
                      Signed by {p.accepted_by_name || p.client_name}
                      <br />
                      {formatDateTime(p.accepted_at)}
                    </div>
                  )}
                </Cell>
                <Cell className="tabular-nums text-text-2 whitespace-nowrap">
                  {p.paid_milestone_count || 0}/{p.milestone_count || 0} paid
                </Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-1.5">
                    <a
                      href={proposalUrl(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View proposal"
                      aria-label="View proposal"
                      className="p-1.5 text-text-3 rounded hover:bg-bg-3 hover:text-text transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <IconButton
                      title="Edit"
                      disabled={p.status === "accepted"}
                      onClick={() => openEdit(p.id)}
                    >
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Copy link" onClick={() => copyLink(p)}>
                      {copied === p.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </IconButton>
                    <IconButton
                      title="Email proposal"
                      disabled={busy === p.id}
                      onClick={() => send(p)}
                    >
                      <Send className="w-4 h-4" />
                    </IconButton>
                    <IconButton
                      title="Invite to portal"
                      disabled={busy === p.id}
                      onClick={() => invite(p)}
                    >
                      <UserPlus className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Delete permanently" tone="danger" onClick={() => remove(p)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editingId ? "Edit proposal" : "Create proposal"}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : editingId ? "Save changes" : "Create proposal"}
            </Button>
          </>
        }
      >
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <Field label="Linked quote request">
          <Select
            value={form.inquiry_id}
            disabled={!!editingId}
            onChange={(e) => pickQuote(e.target.value)}
          >
            <option value="">No linked quote request</option>
            {quoteRequests.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name} — {q.project_type || "Project"} —{" "}
                {new Date(q.created_at).toLocaleDateString()}
              </option>
            ))}
          </Select>
        </Field>

        {!editingId && (
          <div className="rounded-lg border border-hairline p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-accent" />
              <strong className="text-sm">Draft with AI</strong>
            </div>
            <Textarea
              rows={2}
              placeholder="Or describe the project in a sentence or two…"
              value={aiBrief}
              onChange={(e) => setAiBrief(e.target.value)}
            />
            <Button variant="outline" onClick={draftWithAi} disabled={drafting}>
              <Sparkles className="w-4 h-4" />
              {drafting ? "Drafting…" : "Draft with AI"}
            </Button>
            {aiNote && <p className="text-sm text-text-2">{aiNote}</p>}
          </div>
        )}

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
        </div>

        <Field label="Title">
          <Input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency">
            <Select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Service category">
            <Select
              value={form.service_category}
              onChange={(e) => setForm({ ...form, service_category: e.target.value })}
            >
              <option value="">Uncategorised</option>
              {Object.entries(SERVICE_CATEGORIES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Scope">
          <Textarea
            rows={6}
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          />
        </Field>

        <Field label="Timeline">
          <Input
            value={form.timeline}
            onChange={(e) => setForm({ ...form, timeline: e.target.value })}
          />
        </Field>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Milestones</span>
            <Button
              variant="outline"
              onClick={() =>
                setMilestones((prev) => [...prev, { title: "", amount: "", due_note: "" }])
              }
            >
              <Plus className="w-4 h-4" />
              Add milestone
            </Button>
          </div>

          <div className="space-y-2">
            {milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem_1fr_2rem] gap-2 items-center">
                <Input
                  placeholder="50% deposit"
                  aria-label="Milestone"
                  value={m.title}
                  onChange={(e) => setMilestone(i, { title: e.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  aria-label="Amount"
                  value={m.amount}
                  onChange={(e) => setMilestone(i, { amount: e.target.value })}
                />
                <Input
                  placeholder="Due before kickoff"
                  aria-label="Due note"
                  value={m.due_note}
                  onChange={(e) => setMilestone(i, { due_note: e.target.value })}
                />
                <IconButton
                  title="Remove milestone"
                  tone="danger"
                  onClick={() => setMilestones((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>

        <Field label="Terms">
          <Textarea
            rows={4}
            value={form.terms}
            onChange={(e) => setForm({ ...form, terms: e.target.value })}
          />
        </Field>

        <Field label="Mockup image URL" hint="Shown at the top of the client-facing proposal page.">
          <Input
            type="url"
            value={form.mockup_image_url}
            onChange={(e) => setForm({ ...form, mockup_image_url: e.target.value })}
          />
        </Field>

        {form.mockup_image_url && (
          // Remote, admin-entered URL — next/image would need host allowlisting.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.mockup_image_url}
            alt="Mockup preview"
            className="w-full rounded-lg border border-hairline"
          />
        )}
      </Modal>
    </div>
  );
}
