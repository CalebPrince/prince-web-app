"use client";

import { useState } from "react";
import { adminApi, asList } from "@/lib/api";
import {
  Plus, Pencil, Trash2, ArrowLeft, Bot, ListOrdered, Users, Save, UserPlus,
} from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton, Modal,
  Field, Input, Textarea, Select, Tabs, StatusPill, ErrorBanner, formatDate,
  formatDateTime,
} from "@/components/admin/ui";

export type Automation = {
  id: number;
  name: string;
  description: string | null;
  trigger_event: string;
  is_active: boolean | number;
  nurturer_enabled: boolean | number;
  step_count: number;
  active_step_count: number;
  enrollment_count: number;
  active_enrollment_count: number;
};

export type Step = {
  id: number;
  day_offset: number;
  subject: string;
  body: string;
  is_active: boolean | number;
  sent_count: number;
};

export type Enrollment = {
  id: number;
  name: string | null;
  email: string;
  source: string;
  status: string;
  nurturer_enabled: boolean | number;
  steps_received: number;
  last_sent_at: string | null;
  enrolled_at: string;
};

export type NurturerSend = {
  id: number;
  name: string | null;
  email: string;
  sequence_number: number;
  subject_line: string;
  email_body: string;
  sent_at: string;
};

/** Keep in step with App\Support\Automations::TRIGGERS and the schema CHECK. */
const TRIGGERS = [
  { value: "manual", label: "Manual only", hint: "No automatic enrolment — you add contacts by hand." },
  { value: "marketing_pitch_sent", label: "Marketing pitch sent", hint: "A cold lead is enrolled when you mark their outreach pitch as sent." },
  { value: "inquiry_created", label: "Contact form inquiry", hint: "Someone sends a message through the contact form." },
  { value: "quote_requested", label: "Project / quote request", hint: "Someone submits the detailed project request form." },
  { value: "proposal_sent", label: "Proposal sent", hint: "You send a proposal to a client." },
  { value: "payment_received", label: "Payment received", hint: "A client payment succeeds." },
  { value: "appointment_booked", label: "Booking made", hint: "A lead books a call." },
  { value: "project_completed", label: "Session completed", hint: "You mark a booked session as completed." },
  { value: "newsletter_subscribed", label: "Newsletter signup", hint: "Someone subscribes to the newsletter." },
  { value: "chat_lead_captured", label: "Live chat lead", hint: "A visitor leaves their details in the live chat." },
];

const TRIGGER_MAP = Object.fromEntries(TRIGGERS.map((t) => [t.value, t]));

const SOURCE_LABEL: Record<string, string> = {
  marketing_lead: "Marketing lead",
  trigger: "Auto (trigger)",
};

/** Mirrors send_nurturer_emails.php's fallbacks — a never-saved setting reads
 *  as empty here but still falls back there. */
const NURTURER_DEFAULTS: Record<number, number> = { 2: 5, 3: 12 };

type DetailTab = "steps" | "enrollments" | "ai-sends";

const emptyAutomationForm = {
  name: "",
  description: "",
  trigger_event: "manual",
  is_active: true,
  nurturer_enabled: false,
};

const emptyStepForm = { day_offset: "0", subject: "", body: "", is_active: true };

export default function DripClient({
  initialAutomations,
  settings,
  loadError,
}: {
  initialAutomations: Automation[];
  settings: Record<string, string>;
  loadError?: string | null;
}) {
  const [automations, setAutomations] = useState(initialAutomations);
  const [current, setCurrent] = useState<Automation | null>(null);
  const [tab, setTab] = useState<DetailTab>("steps");
  const [steps, setSteps] = useState<Step[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [nurturerSends, setNurturerSends] = useState<NurturerSend[]>([]);
  const [error, setError] = useState<string | null>(loadError ?? null);

  const [automationOpen, setAutomationOpen] = useState(false);
  const [editingAutomationId, setEditingAutomationId] = useState<number | null>(null);
  const [automationForm, setAutomationForm] = useState(emptyAutomationForm);

  const [stepOpen, setStepOpen] = useState(false);
  const [editingStepId, setEditingStepId] = useState<number | null>(null);
  const [stepForm, setStepForm] = useState(emptyStepForm);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ name: "", email: "" });

  const [offsets, setOffsets] = useState({
    2: settings.nurturer_sequence_2_day_offset || String(NURTURER_DEFAULTS[2]),
    3: settings.nurturer_sequence_3_day_offset || String(NURTURER_DEFAULTS[3]),
  });
  const [timingSaved, setTimingSaved] = useState(false);

  const reloadAutomations = async () => {
    const rows = asList<Automation>(await adminApi.get("/api/v1/admin/automations"));
    setAutomations(rows);
    return rows;
  };

  const loadSteps = async (automationId: number) => {
    setSteps(asList<Step>(await adminApi.get(`/api/v1/admin/drip/steps?automation_id=${automationId}`)));
  };

  const loadEnrollments = async (automationId: number) => {
    setEnrollments(
      asList<Enrollment>(await adminApi.get(`/api/v1/admin/drip/enrollments?automation_id=${automationId}`))
    );
  };

  const openDetail = async (automation: Automation) => {
    setCurrent(automation);
    setTab("steps");
    try {
      await Promise.all([loadSteps(automation.id), loadEnrollments(automation.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the automation.");
    }
  };

  const changeTab = async (next: DetailTab) => {
    setTab(next);
    if (next === "ai-sends" && nurturerSends.length === 0) {
      try {
        setNurturerSends(
          asList<NurturerSend>(await adminApi.get("/api/v1/admin/drip/nurturer-sends"))
        );
      } catch {
        /* AI sends are supplementary — the rest of the page still works */
      }
    }
  };

  const toggleAutomation = async (a: Automation, next: boolean) => {
    setAutomations((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, is_active: next } : x))
    );
    if (current?.id === a.id) setCurrent({ ...current, is_active: next });
    try {
      await adminApi.patch(`/api/v1/admin/automations/${a.id}`, { is_active: next });
    } catch (err) {
      setAutomations((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x))
      );
      setError(err instanceof Error ? err.message : "Could not update the automation.");
    }
  };

  const removeAutomation = async (a: Automation) => {
    if (!confirm(`Delete "${a.name}"? Its steps and enrolment history are removed too. This cannot be undone.`)) return;
    try {
      await adminApi.del(`/api/v1/admin/automations/${a.id}`);
      await reloadAutomations();
      if (current?.id === a.id) setCurrent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the automation.");
    }
  };

  const openAutomationModal = (a?: Automation) => {
    setEditingAutomationId(a?.id ?? null);
    setAutomationForm(
      a
        ? {
            name: a.name,
            description: a.description || "",
            trigger_event: a.trigger_event,
            is_active: Boolean(Number(a.is_active)),
            nurturer_enabled: Boolean(Number(a.nurturer_enabled)),
          }
        : emptyAutomationForm
    );
    setError(null);
    setAutomationOpen(true);
  };

  const saveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingAutomationId) {
        await adminApi.put(`/api/v1/admin/automations/${editingAutomationId}`, automationForm);
      } else {
        await adminApi.post("/api/v1/admin/automations", automationForm);
      }
      setAutomationOpen(false);
      const rows = await reloadAutomations();
      // If the open automation was the one edited, refresh its header too.
      if (editingAutomationId && current?.id === editingAutomationId) {
        const fresh = rows.find((a) => a.id === editingAutomationId);
        if (fresh) setCurrent(fresh);
        else setCurrent(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the automation.");
    }
  };

  const openStepModal = (step?: Step) => {
    setEditingStepId(step?.id ?? null);
    setStepForm(
      step
        ? {
            day_offset: String(step.day_offset),
            subject: step.subject,
            body: step.body,
            is_active: Boolean(step.is_active),
          }
        : emptyStepForm
    );
    setError(null);
    setStepOpen(true);
  };

  const saveStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const payload = {
      automation_id: current.id,
      day_offset: Number(stepForm.day_offset),
      subject: stepForm.subject,
      body: stepForm.body,
      is_active: stepForm.is_active,
    };
    try {
      if (editingStepId) await adminApi.put(`/api/v1/admin/drip/steps/${editingStepId}`, payload);
      else await adminApi.post("/api/v1/admin/drip/steps", payload);
      setStepOpen(false);
      await loadSteps(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the step.");
    }
  };

  const toggleStep = async (step: Step, next: boolean) => {
    if (!current) return;
    try {
      await adminApi.put(`/api/v1/admin/drip/steps/${step.id}`, { ...step, is_active: next });
      setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, is_active: next } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the step.");
    }
  };

  const removeStep = async (step: Step) => {
    if (!confirm("Delete this step? Emails already sent are unaffected.")) return;
    if (!current) return;
    try {
      await adminApi.del(`/api/v1/admin/drip/steps/${step.id}`);
      await loadSteps(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the step.");
    }
  };

  const setEnrollmentStatus = async (en: Enrollment, status: string) => {
    if (!current) return;
    try {
      await adminApi.patch(`/api/v1/admin/drip/enrollments/${en.id}`, { status });
      await loadEnrollments(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the enrolment.");
    }
  };

  // Opting a lead in after the fact matters most for the automated path:
  // markSent enrols with Nurturer off, so without this the whole outbound
  // pipeline could never receive an AI follow-up.
  const toggleNurturer = async (en: Enrollment, next: boolean) => {
    setEnrollments((prev) =>
      prev.map((x) => (x.id === en.id ? { ...x, nurturer_enabled: next } : x))
    );
    try {
      await adminApi.patch(`/api/v1/admin/drip/enrollments/${en.id}`, { nurturer_enabled: next });
    } catch (err) {
      setEnrollments((prev) =>
        prev.map((x) => (x.id === en.id ? { ...x, nurturer_enabled: !next } : x))
      );
      setError(err instanceof Error ? err.message : "Could not update the enrolment.");
    }
  };

  const removeEnrollment = async (en: Enrollment) => {
    if (!confirm("Delete this enrolment and its send history?")) return;
    if (!current) return;
    try {
      await adminApi.del(`/api/v1/admin/drip/enrollments/${en.id}`);
      await loadEnrollments(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the enrolment.");
    }
  };

  const enroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    try {
      await adminApi.post("/api/v1/admin/drip/enrollments", {
        automation_id: current.id,
        ...enrollForm,
      });
      setEnrollOpen(false);
      setEnrollForm({ name: "", email: "" });
      await loadEnrollments(current.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enrol that contact.");
    }
  };

  const saveTiming = async () => {
    try {
      await adminApi.put("/api/v1/admin/settings", {
        nurturer_sequence_2_day_offset: offsets[2],
        nurturer_sequence_3_day_offset: offsets[3],
      });
      setTimingSaved(true);
      setTimeout(() => setTimingSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the timing.");
    }
  };

  const activeStepCount = steps.filter((s) => s.is_active).length;

  /* ---------- list view ---------- */

  if (!current) {
    return (
      <div className="space-y-8">
        <PageHeader
          kicker="Leads & Clients"
          title="Email that sends itself."
          description="Trigger-driven sequences that follow up without you remembering to."
          actions={
            <Button variant="primary" onClick={() => openAutomationModal()}>
              <Plus className="w-4 h-4" />
              New automation
            </Button>
          }
        />

        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        {automations.length === 0 ? (
          <Card>
            <div className="px-6 py-16 text-center text-text-3">
              No automations yet. Create one to start following up automatically.
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {automations.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-hairline bg-bg-2 p-4 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent">
                      {TRIGGER_MAP[a.trigger_event]?.label ?? a.trigger_event}
                    </span>
                    {Number(a.nurturer_enabled) === 1 && (
                      <span
                        title="Nurturer AI follow-ups on"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-500/10 text-violet-400"
                      >
                        <Bot className="w-3 h-3" />
                        AI
                      </span>
                    )}
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4"
                      checked={!!Number(a.is_active)}
                      onChange={(e) => toggleAutomation(a, e.target.checked)}
                      aria-label={a.is_active ? "Active" : "Paused"}
                    />
                  </label>
                </div>

                <div>
                  <h5 className="font-semibold">{a.name}</h5>
                  <p className="text-sm text-text-2 mt-1">{a.description || "No description."}</p>
                </div>

                <div className="flex gap-4 text-xs text-text-3 mt-auto">
                  <span className="inline-flex items-center gap-1">
                    <ListOrdered className="w-3.5 h-3.5" />
                    {a.active_step_count}/{a.step_count} step{a.step_count === 1 ? "" : "s"} on
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {a.active_enrollment_count}/{a.enrollment_count} active
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="primary" onClick={() => openDetail(a)}>Open</Button>
                  <IconButton title="Edit" onClick={() => openAutomationModal(a)}>
                    <Pencil className="w-4 h-4" />
                  </IconButton>
                  <IconButton
                    title="Delete automation"
                    tone="danger"
                    className="ml-auto"
                    onClick={() => removeAutomation(a)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <AutomationModal
          isOpen={automationOpen}
          onClose={() => setAutomationOpen(false)}
          editing={!!editingAutomationId}
          form={automationForm}
          setForm={setAutomationForm}
          onSave={saveAutomation}
          error={error}
          clearError={() => setError(null)}
        />
      </div>
    );
  }

  /* ---------- detail view ---------- */

  return (
    <div className="space-y-8">
      <div className="space-y-4 border-b border-hairline pb-6">
        <Button variant="ghost" onClick={() => setCurrent(null)}>
          <ArrowLeft className="w-4 h-4" />
          All automations
        </Button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-accent">
              {TRIGGER_MAP[current.trigger_event]?.label ?? current.trigger_event}
            </span>
            <h2 className="text-3xl font-bold tracking-tight mt-2 mb-1">{current.name}</h2>
            {current.description && <p className="text-text-2">{current.description}</p>}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="accent-accent w-4 h-4"
                checked={!!Number(current.is_active)}
                onChange={(e) => toggleAutomation(current, e.target.checked)}
              />
              {Number(current.is_active) ? "Active" : "Paused"}
            </label>
            <Button variant="outline" onClick={() => openAutomationModal(current)}>
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Tabs<DetailTab>
        value={tab}
        onChange={changeTab}
        options={[
          { value: "steps", label: "Steps", count: steps.length },
          { value: "enrollments", label: "Enrolments", count: enrollments.length },
          { value: "ai-sends", label: "AI sends" },
        ]}
      />

      {tab === "steps" && (
        <Card
          title="Sequence steps"
          actions={
            <Button variant="primary" onClick={() => openStepModal()}>
              <Plus className="w-4 h-4" />
              Add step
            </Button>
          }
        >
          <Table head={["When", "Email", "Active", "Sent", "Actions"]}>
            {steps.length === 0 ? (
              <EmptyRow colSpan={5}>No steps yet. Add the first email in this sequence.</EmptyRow>
            ) : (
              steps.map((s) => (
                <Row key={s.id}>
                  <Cell className="font-semibold whitespace-nowrap">Day {s.day_offset}</Cell>
                  <Cell>
                    <div className="font-medium text-text">{s.subject}</div>
                    <div className="text-xs text-text-3 mt-0.5 line-clamp-1">{s.body}</div>
                  </Cell>
                  <Cell>
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4"
                      aria-label={`Step ${s.day_offset} active`}
                      checked={!!s.is_active}
                      onChange={(e) => toggleStep(s, e.target.checked)}
                    />
                  </Cell>
                  <Cell className="text-text-3 tabular-nums">{s.sent_count} sent</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      <IconButton title="Edit" onClick={() => openStepModal(s)}>
                        <Pencil className="w-4 h-4" />
                      </IconButton>
                      <IconButton title="Delete" tone="danger" onClick={() => removeStep(s)}>
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

      {tab === "enrollments" && (
        <Card
          title="Enrolments"
          actions={
            <Button variant="primary" onClick={() => setEnrollOpen(true)}>
              <UserPlus className="w-4 h-4" />
              Enrol a contact
            </Button>
          }
        >
          <Table head={["Contact", "Source", "Status", "AI", "Progress", "Enrolled", "Actions"]}>
            {enrollments.length === 0 ? (
              <EmptyRow colSpan={7}>
                No enrolments yet. Contacts are added automatically when this automation&apos;s trigger
                fires, or enrol one by hand.
              </EmptyRow>
            ) : (
              enrollments.map((en) => (
                <Row key={en.id}>
                  <Cell>
                    <div className="font-medium text-text">{en.name || "—"}</div>
                    <div className="text-xs text-text-3 mt-0.5">{en.email}</div>
                  </Cell>
                  <Cell className="text-text-2 text-xs">
                    {SOURCE_LABEL[en.source] ?? "Manual"}
                  </Cell>
                  <Cell><StatusPill status={en.status} /></Cell>
                  <Cell>
                    <input
                      type="checkbox"
                      className="accent-accent w-4 h-4"
                      aria-label={`Nurturer AI for ${en.email}`}
                      checked={!!Number(en.nurturer_enabled)}
                      onChange={(e) => toggleNurturer(en, e.target.checked)}
                    />
                  </Cell>
                  <Cell className="text-xs">
                    {en.steps_received}/{activeStepCount || "?"} emails
                    {en.last_sent_at && (
                      <div className="text-text-3 mt-0.5">last: {formatDate(en.last_sent_at)}</div>
                    )}
                  </Cell>
                  <Cell className="text-text-3 whitespace-nowrap">{formatDate(en.enrolled_at)}</Cell>
                  <Cell>
                    <div className="flex items-center justify-end gap-2">
                      {en.status === "active" && (
                        <Button variant="outline" onClick={() => setEnrollmentStatus(en, "stopped")}>
                          Stop
                        </Button>
                      )}
                      {en.status === "stopped" && (
                        <Button variant="outline" onClick={() => setEnrollmentStatus(en, "active")}>
                          Resume
                        </Button>
                      )}
                      <IconButton title="Delete enrolment" tone="danger" onClick={() => removeEnrollment(en)}>
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

      {tab === "ai-sends" && (
        <div className="space-y-4">
          <Card title="Nurturer timing" bodyClassName="p-5 space-y-4">
            <p className="text-sm text-text-2">
              How many days after enrolment the second and third AI-personalised follow-ups go out.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sequence 2 — day offset">
                <Input
                  type="number"
                  min="0"
                  value={offsets[2]}
                  onChange={(e) => setOffsets({ ...offsets, 2: e.target.value })}
                />
              </Field>
              <Field label="Sequence 3 — day offset">
                <Input
                  type="number"
                  min="0"
                  value={offsets[3]}
                  onChange={(e) => setOffsets({ ...offsets, 3: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={saveTiming}>
                <Save className="w-4 h-4" />
                Save timing
              </Button>
              {timingSaved && <span className="text-sm text-green-500">Saved.</span>}
            </div>
          </Card>

          <Card title="AI-personalised emails sent">
            <Table head={["Contact", "Sequence", "Email", "Sent"]}>
              {nurturerSends.length === 0 ? (
                <EmptyRow colSpan={4}>No AI-personalized emails sent yet.</EmptyRow>
              ) : (
                nurturerSends.map((s) => (
                  <Row key={s.id}>
                    <Cell>
                      <div className="font-medium text-text">{s.name || "—"}</div>
                      <div className="text-xs text-text-3 mt-0.5">{s.email}</div>
                    </Cell>
                    <Cell className="text-text-2 text-xs whitespace-nowrap">
                      Sequence {s.sequence_number}
                    </Cell>
                    <Cell>
                      <div className="font-medium text-text">{s.subject_line}</div>
                      <div className="text-xs text-text-3 mt-0.5 line-clamp-1">{s.email_body}</div>
                    </Cell>
                    <Cell className="text-text-3 whitespace-nowrap">{formatDateTime(s.sent_at)}</Cell>
                  </Row>
                ))
              )}
            </Table>
          </Card>
        </div>
      )}

      <AutomationModal
        isOpen={automationOpen}
        onClose={() => setAutomationOpen(false)}
        editing={!!editingAutomationId}
        form={automationForm}
        setForm={setAutomationForm}
        onSave={saveAutomation}
        error={error}
        clearError={() => setError(null)}
      />

      <Modal
        isOpen={stepOpen}
        onClose={() => setStepOpen(false)}
        title={editingStepId ? "Edit step" : "Add step"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStepOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveStep}>Save step</Button>
          </>
        }
      >
        <Field label="Day offset" hint="Days after enrolment that this email goes out.">
          <Input
            type="number"
            min="0"
            required
            value={stepForm.day_offset}
            onChange={(e) => setStepForm({ ...stepForm, day_offset: e.target.value })}
          />
        </Field>
        <Field label="Subject">
          <Input
            required
            value={stepForm.subject}
            onChange={(e) => setStepForm({ ...stepForm, subject: e.target.value })}
          />
        </Field>
        <Field label="Body">
          <Textarea
            rows={8}
            required
            value={stepForm.body}
            onChange={(e) => setStepForm({ ...stepForm, body: e.target.value })}
          />
        </Field>
        <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            className="accent-accent w-4 h-4"
            checked={stepForm.is_active}
            onChange={(e) => setStepForm({ ...stepForm, is_active: e.target.checked })}
          />
          Step is active
        </label>
      </Modal>

      <Modal
        isOpen={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Enrol a contact"
        description={`Adds this person to "${current.name}" straight away.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={enroll} disabled={!enrollForm.email}>Enrol</Button>
          </>
        }
      >
        <Field label="Name">
          <Input
            value={enrollForm.name}
            onChange={(e) => setEnrollForm({ ...enrollForm, name: e.target.value })}
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            required
            value={enrollForm.email}
            onChange={(e) => setEnrollForm({ ...enrollForm, email: e.target.value })}
          />
        </Field>
      </Modal>
    </div>
  );
}

function AutomationModal({
  isOpen,
  onClose,
  editing,
  form,
  setForm,
  onSave,
  error,
  clearError,
}: {
  isOpen: boolean;
  onClose: () => void;
  editing: boolean;
  form: typeof emptyAutomationForm;
  setForm: (f: typeof emptyAutomationForm) => void;
  onSave: (e: React.FormEvent) => void;
  error: string | null;
  clearError: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editing ? "Edit automation" : "New automation"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>
            Save automation
          </Button>
        </>
      }
    >
      {error && <ErrorBanner message={error} onDismiss={clearError} />}

      <Field label="Name">
        <Input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>

      <Field label="Description">
        <Textarea
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </Field>

      <Field label="Trigger" hint={TRIGGER_MAP[form.trigger_event]?.hint}>
        <Select
          value={form.trigger_event}
          onChange={(e) => setForm({ ...form, trigger_event: e.target.value })}
        >
          {TRIGGERS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          className="accent-accent w-4 h-4"
          checked={form.is_active}
          onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
        />
        Automation is active
      </label>

      <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
        <input
          type="checkbox"
          className="accent-accent w-4 h-4"
          checked={form.nurturer_enabled}
          onChange={(e) => setForm({ ...form, nurturer_enabled: e.target.checked })}
        />
        Let Nurturer send AI-personalised follow-ups
      </label>
    </Modal>
  );
}
