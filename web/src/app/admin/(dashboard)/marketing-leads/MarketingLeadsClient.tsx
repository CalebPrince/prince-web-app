"use client";

import { useMemo, useState } from "react";
import { adminApi, asList } from "@/lib/api";
import {
  Plus, Search, Star, Trash2, Trash, Telescope, ScanSearch, PenLine,
  MonitorPlay, Send, Save, ArrowUpRight, MessageSquarePlus,
} from "lucide-react";
import {
  PageHeader, Card, StatCard, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, Textarea, Select, FilterBar, Tabs, StatusPill,
  ErrorBanner, Pagination, formatDate,
} from "@/components/admin/ui";

export type AuditFindings = { issues?: { detail: string }[] };

export type MarketingLead = {
  id: number;
  business_name: string;
  website_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  fit_score: number | null;
  is_high_priority: number | boolean;
  estimated_value: number | null;
  currency: string | null;
  pitch_subject: string | null;
  pitch_body: string | null;
  pitch_channel: string | null;
  audit_findings: AuditFindings | null;
  research_summary: string | null;
  opportunity?: { label?: string } | null;
  research_agent_name?: string;
  pitch_agent_name?: string;
  created_at: string;
};

export type OutreachStats = {
  eligible_queue?: number;
  sent_today?: number;
  daily_cap?: number;
  replies?: number;
};

export type DiscoverResult = {
  business_name: string;
  website_url: string | null;
  phone: string | null;
};

/** Fit bands, mirroring how the legacy page bucketed `fit_score`. */
type FitFilter = "all" | "strong" | "qualified" | "develop" | "low" | "rejected";

const PER_PAGE = 25;

const CURRENCIES = ["GHS", "USD", "EUR", "GBP", "NGN"];

const emptyLeadForm = {
  business_name: "",
  contact_name: "",
  website_url: "",
  contact_email: "",
  contact_phone: "",
  estimated_value: "0",
  currency: "GHS",
};

const emptyIntroForm = { contact_name: "", phone_number: "", note: "" };

function fitBand(lead: MarketingLead): FitFilter {
  if (lead.status === "rejected") return "rejected";
  const score = Number(lead.fit_score);
  if (score >= 75) return "strong";
  if (score >= 55) return "qualified";
  if (score >= 35) return "develop";
  return "low";
}

const FIT_TONE: Record<string, "green" | "blue" | "amber" | "neutral" | "red"> = {
  strong: "green",
  qualified: "blue",
  develop: "amber",
  low: "neutral",
  rejected: "red",
};

const FIT_LABEL: Record<FitFilter, string> = {
  all: "All",
  strong: "Strong fit",
  qualified: "Qualified",
  develop: "Develop",
  low: "Low fit",
  rejected: "Rejected",
};

function money(minor: number | null, currency: string | null) {
  if (!minor) return "—";
  return `${currency || "GHS"} ${(Number(minor) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export default function MarketingLeadsClient({
  initialLeads,
  initialStats,
}: {
  initialLeads: MarketingLead[];
  initialStats: OutreachStats | null;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [stats, setStats] = useState(initialStats);
  const [search, setSearch] = useState("");
  const [fit, setFit] = useState<FitFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyLeadForm);

  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discoverQuery, setDiscoverQuery] = useState("");
  const [discoverResults, setDiscoverResults] = useState<DiscoverResult[]>([]);
  const [discoverPicked, setDiscoverPicked] = useState<Set<number>>(new Set());
  const [discoverValue, setDiscoverValue] = useState("0");
  const [discoverCurrency, setDiscoverCurrency] = useState("GHS");
  const [searching, setSearching] = useState(false);
  const [discoverNote, setDiscoverNote] = useState<string | null>(null);

  const [pitchLead, setPitchLead] = useState<MarketingLead | null>(null);
  const [pitchForm, setPitchForm] = useState({
    contact_name: "", contact_email: "", contact_phone: "",
    pitch_subject: "", pitch_body: "", estimated_value: "0", currency: "GHS",
  });
  const [pitchNote, setPitchNote] = useState<{ text: string; ok: boolean } | null>(null);

  const [introOpen, setIntroOpen] = useState(false);
  const [introForm, setIntroForm] = useState(emptyIntroForm);
  const [introNote, setIntroNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [introSending, setIntroSending] = useState(false);

  const researchName = leads[0]?.research_agent_name || "Dossier";
  const pitchName = leads[0]?.pitch_agent_name || "Beacon";

  const counts = useMemo(() => {
    const base: Record<FitFilter, number> = {
      all: leads.length, strong: 0, qualified: 0, develop: 0, low: 0, rejected: 0,
    };
    leads.forEach((l) => { base[fitBand(l)] += 1; });
    return base;
  }, [leads]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      const matchesFit = fit === "all" || fitBand(l) === fit;
      const matchesQuery =
        !q ||
        [l.business_name, l.website_url, l.contact_name, l.contact_email, l.contact_phone].some(
          (v) => String(v || "").toLowerCase().includes(q)
        );
      return matchesFit && matchesQuery;
    });
  }, [leads, search, fit]);

  const totalPages = Math.max(1, Math.ceil(matches.length / PER_PAGE));
  const pageRows = matches.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));

  const reload = async () => {
    setLeads(asList<MarketingLead>(await adminApi.get("/api/v1/admin/marketing-leads")));
    setSelected(new Set());
    // Eligible-queue count tracks lead state, so refresh it alongside.
    setStats(await adminApi.get<OutreachStats>("/api/v1/admin/outreach/stats").catch(() => stats));
  };

  const run = async (lead: MarketingLead, action: () => Promise<unknown>, label: string) => {
    setBusy(lead.id);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${label}.`);
    } finally {
      setBusy(null);
    }
  };

  const togglePriority = (lead: MarketingLead) =>
    run(
      lead,
      () =>
        adminApi.patch(`/api/v1/admin/marketing-leads/${lead.id}`, {
          is_high_priority: !Number(lead.is_high_priority),
        }),
      "update the lead"
    );

  const research = (lead: MarketingLead) =>
    run(lead, () => adminApi.post(`/api/v1/admin/marketing-leads/${lead.id}/research`), "research the lead");

  const audit = (lead: MarketingLead) =>
    run(lead, () => adminApi.post(`/api/v1/admin/marketing-leads/${lead.id}/audit`), "audit the site");

  const generatePitch = (lead: MarketingLead) =>
    run(
      lead,
      () => adminApi.post(`/api/v1/admin/marketing-leads/${lead.id}/generate-pitch`),
      "generate a pitch"
    );

  const generateDemo = (lead: MarketingLead) =>
    run(
      lead,
      () => adminApi.post(`/api/v1/admin/marketing-leads/${lead.id}/account-demo/generate`),
      "generate the demo"
    );

  const remove = (lead: MarketingLead) => {
    if (!confirm(`Delete "${lead.business_name}" permanently?`)) return;
    run(lead, () => adminApi.del(`/api/v1/admin/marketing-leads/${lead.id}`), "delete the lead");
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"} permanently?`)) return;
    try {
      await Promise.all(ids.map((id) => adminApi.del(`/api/v1/admin/marketing-leads/${id}`)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete all selected leads.");
    } finally {
      await reload();
    }
  };

  const addLead = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.post("/api/v1/admin/marketing-leads", addForm);
      setAddOpen(false);
      setAddForm(emptyLeadForm);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the lead.");
    }
  };

  const discover = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setDiscoverNote(null);
    setDiscoverResults([]);
    setDiscoverPicked(new Set());
    try {
      const res = await adminApi.post<{ results: DiscoverResult[] }>(
        "/api/v1/admin/marketing-leads/discover",
        { query: discoverQuery.trim() }
      );
      setDiscoverResults(res.results ?? []);
      if (!res.results?.length) setDiscoverNote("No results found for that search.");
    } catch (err) {
      setDiscoverNote(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  };

  const addDiscovered = async () => {
    const picked = [...discoverPicked].map((i) => discoverResults[i]);
    if (!picked.length) return;
    try {
      const res = await adminApi.post<{ added: number }>("/api/v1/admin/marketing-leads/bulk", {
        leads: picked.map((r) => ({
          business_name: r.business_name,
          website_url: r.website_url,
          phone: r.phone,
        })),
        estimated_value: discoverValue,
        currency: discoverCurrency,
      });
      setDiscoverOpen(false);
      setDiscoverResults([]);
      setDiscoverPicked(new Set());
      setDiscoverQuery("");
      await reload();
      setDiscoverNote(`Added ${res.added} lead${res.added === 1 ? "" : "s"}.`);
    } catch (err) {
      setDiscoverNote(err instanceof Error ? err.message : "Could not add leads.");
    }
  };

  const openPitch = (lead: MarketingLead) => {
    setPitchLead(lead);
    setPitchNote(null);
    setPitchForm({
      contact_name: lead.contact_name || "",
      contact_email: lead.contact_email || "",
      contact_phone: lead.contact_phone || "",
      pitch_subject: lead.pitch_subject || "",
      pitch_body: lead.pitch_body || "",
      estimated_value: String(Number(lead.estimated_value || 0) / 100),
      currency: lead.currency || "GHS",
    });
  };

  // For someone who reached out somewhere other than Lisa's WhatsApp number —
  // a personal number, a YouTube comment. WhatsApp only allows a pre-approved
  // template as the first business-initiated message, so this is a separate
  // path from the wa.me handoff below, which needs an already-open thread.
  const sendIntro = async () => {
    if (!introForm.contact_name.trim() || !introForm.phone_number.trim()) {
      setIntroNote({ ok: false, text: "Contact name and WhatsApp number are required." });
      return;
    }
    setIntroSending(true);
    setIntroNote(null);
    try {
      await adminApi.post("/api/v1/admin/whatsapp/send-intro", {
        contact_name: introForm.contact_name.trim(),
        phone_number: introForm.phone_number.trim(),
        note: introForm.note.trim(),
      });
      setIntroNote({
        ok: true,
        text: `Intro template sent to ${introForm.contact_name.trim()}. Lisa picks up the conversation once they reply.`,
      });
      setIntroForm(emptyIntroForm);
    } catch (err) {
      setIntroNote({
        ok: false,
        text: err instanceof Error ? err.message : "Could not send the intro.",
      });
    } finally {
      setIntroSending(false);
    }
  };

  const savePitch = async () => {
    if (!pitchLead) return;
    await adminApi.patch(`/api/v1/admin/marketing-leads/${pitchLead.id}`, pitchForm);
  };

  const savePitchOnly = async () => {
    try {
      await savePitch();
      setPitchNote({ ok: true, text: "Saved." });
      await reload();
    } catch (err) {
      setPitchNote({ ok: false, text: err instanceof Error ? err.message : "Could not save." });
    }
  };

  // Nothing goes out from the server: email opens the admin's own mail client
  // and phone hands off to WhatsApp. Marking the lead as sent is a separate,
  // explicitly-confirmed step so the record only claims what actually happened.
  const approveAndSend = async () => {
    if (!pitchLead) return;
    const isPhone = (pitchLead.pitch_channel || "email") === "phone";

    if (isPhone) {
      if (!pitchForm.contact_phone.trim()) {
        setPitchNote({ ok: false, text: "Add a contact phone before opening WhatsApp." });
        return;
      }
      try {
        await savePitch();
        const digits = pitchForm.contact_phone.replace(/\D/g, "");
        window.open(
          `https://wa.me/${digits}?text=${encodeURIComponent(pitchForm.pitch_body.trim())}`,
          "_blank",
          "noopener"
        );
        if (!confirm("After pressing Send in WhatsApp, mark this lead as messaged?")) return;
        await adminApi.post(`/api/v1/admin/marketing-leads/${pitchLead.id}/send`);
        setPitchLead(null);
        await reload();
      } catch (err) {
        setPitchNote({
          ok: false,
          text: err instanceof Error ? err.message : "Could not mark as messaged.",
        });
      }
      return;
    }

    if (!pitchForm.contact_email.trim()) {
      setPitchNote({ ok: false, text: "Add a contact email before sending." });
      return;
    }

    try {
      await savePitch();
      window.location.href =
        `mailto:${encodeURIComponent(pitchForm.contact_email.trim())}` +
        `?subject=${encodeURIComponent(pitchForm.pitch_subject.trim())}` +
        `&body=${encodeURIComponent(pitchForm.pitch_body.trim())}`;
      await adminApi.post(`/api/v1/admin/marketing-leads/${pitchLead.id}/send`);
      setPitchLead(null);
      await reload();
    } catch (err) {
      setPitchNote({
        ok: false,
        text: err instanceof Error ? err.message : "Could not mark as sent.",
      });
    }
  };

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Leads & Clients"
        title="Prospects worth reaching out to."
        description={`${researchName} researches them, ${pitchName} writes the pitch — you approve every send.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setAddForm(emptyLeadForm);
                setAddOpen(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add lead
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIntroForm(emptyIntroForm);
                setIntroNote(null);
                setIntroOpen(true);
              }}
            >
              <MessageSquarePlus className="w-4 h-4" />
              Send Lisa intro
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setDiscoverNote(null);
                setDiscoverOpen(true);
              }}
            >
              <Search className="w-4 h-4" />
              Find prospects
            </Button>
          </>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Eligible queue" value={stats.eligible_queue ?? 0} />
          <StatCard
            label="Sent today"
            value={`${stats.sent_today ?? 0}${stats.daily_cap ? ` / ${stats.daily_cap}` : ""}`}
          />
          <StatCard label="Replies" value={stats.replies ?? 0} />
          <StatCard label="Total leads" value={leads.length} />
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <Tabs<FitFilter>
          value={fit}
          onChange={(next) => {
            setFit(next);
            setPage(1);
          }}
          options={(Object.keys(FIT_LABEL) as FitFilter[]).map((key) => ({
            value: key,
            label: FIT_LABEL[key],
            count: counts[key],
          }))}
        />
      </div>

      <FilterBar>
        <Input
          className="w-auto min-w-72"
          placeholder="Search business, site, or contact…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-sm text-text-3">
          {matches.length} account{matches.length === 1 ? "" : "s"}
        </span>
      </FilterBar>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-hairline bg-bg-2 px-4 py-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button variant="danger" onClick={removeSelected}>
              <Trash className="w-4 h-4" />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      <Card title="Accounts">
        <Table
          head={[
            <input
              key="all"
              type="checkbox"
              aria-label="Select all on this page"
              className="accent-accent"
              checked={allOnPageSelected}
              onChange={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (allOnPageSelected) pageRows.forEach((l) => next.delete(l.id));
                  else pageRows.forEach((l) => next.add(l.id));
                  return next;
                })
              }
            />,
            "Business",
            "Contact",
            "Fit",
            "Stage",
            "Value",
            "Added",
            "Actions",
          ]}
        >
          {pageRows.length === 0 ? (
            <EmptyRow colSpan={8}>
              No accounts match this view. Find prospects by niche or add your first lead.
            </EmptyRow>
          ) : (
            pageRows.map((lead) => {
              const band = fitBand(lead);
              return (
                <Row key={lead.id}>
                  <Cell className="w-10">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      aria-label={`Select ${lead.business_name}`}
                      checked={selected.has(lead.id)}
                      onChange={() => toggle(lead.id)}
                    />
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-1.5">
                      {!!Number(lead.is_high_priority) && (
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-text truncate">{lead.business_name}</span>
                    </div>
                    {lead.website_url && (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-text-3 hover:text-accent inline-flex items-center gap-1 mt-0.5"
                      >
                        {lead.website_url}
                        <ArrowUpRight className="w-3 h-3" />
                      </a>
                    )}
                  </Cell>
                  <Cell>
                    <div className="text-text-2">{lead.contact_name || "—"}</div>
                    <div className="text-xs text-text-3 mt-0.5">
                      {lead.contact_email || lead.contact_phone || ""}
                    </div>
                  </Cell>
                  <Cell>
                    <StatusPill status={FIT_LABEL[band]} tone={FIT_TONE[band]} />
                    {lead.fit_score != null && (
                      <div className="text-xs text-text-3 mt-1 tabular-nums">
                        {lead.fit_score}/100
                      </div>
                    )}
                  </Cell>
                  <Cell><StatusPill status={lead.status} /></Cell>
                  <Cell className="tabular-nums text-text-2">
                    {money(lead.estimated_value, lead.currency)}
                  </Cell>
                  <Cell className="text-text-3 whitespace-nowrap">{formatDate(lead.created_at)}</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-1.5">
                      <IconButton
                        title={Number(lead.is_high_priority) ? "Remove high priority" : "Mark high priority"}
                        disabled={busy === lead.id}
                        onClick={() => togglePriority(lead)}
                      >
                        <Star
                          className={`w-4 h-4 ${
                            Number(lead.is_high_priority) ? "text-amber-500 fill-amber-500" : ""
                          }`}
                        />
                      </IconButton>
                      <IconButton
                        title={`Research with ${researchName}`}
                        disabled={busy === lead.id}
                        onClick={() => research(lead)}
                      >
                        <Telescope className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title="Audit their site"
                        disabled={busy === lead.id || !lead.website_url}
                        onClick={() => audit(lead)}
                      >
                        <ScanSearch className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title={`Draft a pitch with ${pitchName}`}
                        disabled={busy === lead.id}
                        onClick={() => generatePitch(lead)}
                      >
                        <PenLine className="w-4 h-4" />
                      </IconButton>
                      <IconButton
                        title="Generate account demo"
                        disabled={busy === lead.id}
                        onClick={() => generateDemo(lead)}
                      >
                        <MonitorPlay className="w-4 h-4" />
                      </IconButton>
                      <Button variant="outline" onClick={() => openPitch(lead)}>
                        Review
                      </Button>
                      <IconButton
                        title="Delete permanently"
                        tone="danger"
                        disabled={busy === lead.id}
                        onClick={() => remove(lead)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Cell>
                </Row>
              );
            })
          )}
        </Table>
        {matches.length > PER_PAGE && (
          <Pagination page={page} totalPages={totalPages} total={matches.length} onChange={setPage} />
        )}
      </Card>

      {/* Add lead */}
      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a lead"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={addLead} disabled={!addForm.business_name.trim()}>
              Add lead
            </Button>
          </>
        }
      >
        <Field label="Business name">
          <Input
            required
            value={addForm.business_name}
            onChange={(e) => setAddForm({ ...addForm, business_name: e.target.value })}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <Input
              value={addForm.contact_name}
              onChange={(e) => setAddForm({ ...addForm, contact_name: e.target.value })}
            />
          </Field>
          <Field label="Website">
            <Input
              type="url"
              value={addForm.website_url}
              onChange={(e) => setAddForm({ ...addForm, website_url: e.target.value })}
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={addForm.contact_email}
              onChange={(e) => setAddForm({ ...addForm, contact_email: e.target.value })}
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={addForm.contact_phone}
              onChange={(e) => setAddForm({ ...addForm, contact_phone: e.target.value })}
            />
          </Field>
          <Field label="Estimated value">
            <Input
              type="number"
              min="0"
              value={addForm.estimated_value}
              onChange={(e) => setAddForm({ ...addForm, estimated_value: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={addForm.currency}
              onChange={(e) => setAddForm({ ...addForm, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Send Lisa intro */}
      <Modal
        isOpen={introOpen}
        onClose={() => setIntroOpen(false)}
        title="Send Lisa intro"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIntroOpen(false)}>Close</Button>
            <Button variant="primary" onClick={sendIntro} disabled={introSending}>
              <Send className="w-4 h-4" />
              {introSending ? "Sending…" : "Send intro"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/60">
          For someone who messaged you somewhere other than Lisa&apos;s WhatsApp number.
          WhatsApp only allows an approved template as the first business-initiated
          message, so this sends that template — Lisa takes over once they reply.
        </p>
        <Field label="Contact name">
          <Input
            required
            value={introForm.contact_name}
            onChange={(e) => setIntroForm({ ...introForm, contact_name: e.target.value })}
          />
        </Field>
        <Field label="WhatsApp number">
          <Input
            required
            placeholder="+233…"
            value={introForm.phone_number}
            onChange={(e) => setIntroForm({ ...introForm, phone_number: e.target.value })}
          />
        </Field>
        <Field label="Note (for your records only)">
          <Textarea
            rows={2}
            value={introForm.note}
            onChange={(e) => setIntroForm({ ...introForm, note: e.target.value })}
          />
        </Field>
        {introNote && (
          <p className={`text-sm ${introNote.ok ? "text-emerald-400" : "text-red-400"}`}>
            {introNote.text}
          </p>
        )}
      </Modal>

      {/* Discover */}
      <Modal
        isOpen={discoverOpen}
        onClose={() => setDiscoverOpen(false)}
        title="Find prospects"
        description="Searches for businesses matching a niche, then adds the ones you pick."
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiscoverOpen(false)}>Close</Button>
            <Button variant="primary" onClick={addDiscovered} disabled={!discoverPicked.size}>
              Add {discoverPicked.size || ""} selected
            </Button>
          </>
        }
      >
        <form onSubmit={discover} className="flex gap-2">
          <Input
            required
            placeholder="e.g. dental clinics in Accra"
            value={discoverQuery}
            onChange={(e) => setDiscoverQuery(e.target.value)}
          />
          <Button type="submit" variant="primary" className="flex-shrink-0" disabled={searching}>
            <Search className="w-4 h-4" />
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>

        {discoverNote && <p className="text-sm text-text-2">{discoverNote}</p>}

        {discoverResults.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Estimated value for each">
                <Input
                  type="number"
                  min="0"
                  value={discoverValue}
                  onChange={(e) => setDiscoverValue(e.target.value)}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={discoverCurrency}
                  onChange={(e) => setDiscoverCurrency(e.target.value)}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
              {discoverResults.map((r, i) => (
                <label
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-hairline p-3 cursor-pointer hover:bg-bg-3 transition-colors"
                >
                  <input
                    type="checkbox"
                    className="accent-accent mt-0.5"
                    checked={discoverPicked.has(i)}
                    onChange={() =>
                      setDiscoverPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0">
                    <strong className="text-sm block">{r.business_name}</strong>
                    <span className="text-xs text-text-3">
                      {r.website_url || "No website"}
                      {r.phone && ` · ${r.phone}`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* Pitch review */}
      <Modal
        isOpen={!!pitchLead}
        onClose={() => setPitchLead(null)}
        title={pitchLead?.business_name ?? ""}
        description={
          pitchLead
            ? `${pitchLead.opportunity?.label || "Qualification pending"} · ${String(
                pitchLead.status || "pending"
              ).replace(/_/g, " ")}`
            : undefined
        }
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPitchLead(null)}>Close</Button>
            <Button variant="outline" onClick={savePitchOnly}>
              <Save className="w-4 h-4" />
              Save
            </Button>
            <Button variant="primary" onClick={approveAndSend}>
              <Send className="w-4 h-4" />
              {(pitchLead?.pitch_channel || "email") === "phone"
                ? "Approve & open WhatsApp"
                : "Approve & send"}
            </Button>
          </>
        }
      >
        {pitchNote && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              pitchNote.ok
                ? "border-green-500/30 bg-green-500/10 text-green-500"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {pitchNote.text}
          </div>
        )}

        {pitchLead?.research_summary && (
          <div className="rounded-lg border border-hairline p-3">
            <strong className="text-xs uppercase tracking-wider text-text-3 block mb-1">
              What {researchName} found
            </strong>
            <p className="text-sm text-text-2 whitespace-pre-wrap">{pitchLead.research_summary}</p>
          </div>
        )}

        <div>
          <strong className="text-xs uppercase tracking-wider text-text-3 block mb-1.5">
            Audit findings
          </strong>
          {!pitchLead?.website_url ? (
            <p className="text-sm text-text-3">
              No website on file — this is a generic introduction, not based on any audit.
            </p>
          ) : pitchLead.audit_findings?.issues?.length ? (
            <ul className="list-disc pl-5 space-y-1">
              {pitchLead.audit_findings.issues.map((issue, i) => (
                <li key={i} className="text-sm text-text-2">{issue.detail}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-3">No specific issues found by the audit.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Contact name">
            <Input
              value={pitchForm.contact_name}
              onChange={(e) => setPitchForm({ ...pitchForm, contact_name: e.target.value })}
            />
          </Field>
          <Field label="Contact email">
            <Input
              type="email"
              value={pitchForm.contact_email}
              onChange={(e) => setPitchForm({ ...pitchForm, contact_email: e.target.value })}
            />
          </Field>
          <Field label="Contact phone">
            <Input
              value={pitchForm.contact_phone}
              onChange={(e) => setPitchForm({ ...pitchForm, contact_phone: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Subject">
          <Input
            value={pitchForm.pitch_subject}
            onChange={(e) => setPitchForm({ ...pitchForm, pitch_subject: e.target.value })}
          />
        </Field>

        <Field label="Message">
          <Textarea
            rows={10}
            value={pitchForm.pitch_body}
            onChange={(e) => setPitchForm({ ...pitchForm, pitch_body: e.target.value })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated value">
            <Input
              type="number"
              min="0"
              value={pitchForm.estimated_value}
              onChange={(e) => setPitchForm({ ...pitchForm, estimated_value: e.target.value })}
            />
          </Field>
          <Field label="Currency">
            <Select
              value={pitchForm.currency}
              onChange={(e) => setPitchForm({ ...pitchForm, currency: e.target.value })}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
