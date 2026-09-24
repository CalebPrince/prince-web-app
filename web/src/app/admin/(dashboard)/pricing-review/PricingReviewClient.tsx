"use client";

import { useState } from "react";
import { Paperclip, X, Scale, Trash2 } from "lucide-react";
import { adminApi } from "@/lib/api";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton,
  Field, Input, Textarea, Select, StatusPill, ErrorBanner, formatDateTime,
} from "@/components/admin/ui";

export type PricingReviewAnswers = Record<string, string>;

export type PricingReview = {
  id: number;
  project_name: string;
  description: string | null;
  document_name: string | null;
  /** Minor units (cents). */
  price_amount: number;
  currency: string;
  answers: PricingReviewAnswers;
  verdict: "too_low" | "needs_adjustment" | "on_target" | "too_high";
  confidence: "low" | "medium" | "high";
  /** Minor units. Null when the model couldn't ground a range. */
  suggested_min: number | null;
  suggested_max: number | null;
  reasoning: string;
  adjustment_notes: string;
  grounding_source: string;
  grounding_note: string;
  created_at: string;
};

const CURRENCIES = ["GHS", "NGN", "USD", "ZAR"];

// Keys and options must match PricingReviewController::questions() in
// src/Controllers/PricingReviewController.php exactly — the server drops
// anything that isn't one of these, so drifting the two apart just means
// an answer silently doesn't get used.
const QUESTIONS: { key: string; label: string; options: string[] }[] = [
  {
    key: "project_type",
    label: "Project type",
    options: [
      "Website", "Mobile app", "AI voice agent", "WhatsApp / chat assistant",
      "Workflow automation", "AI operations system", "E-commerce", "Brand / design", "Other",
    ],
  },
  {
    key: "scope_size",
    label: "Scope size",
    options: [
      "Small (single feature or landing page)",
      "Medium (multi-page site or several features)",
      "Large (complex system, multiple integrations)",
      "Enterprise (mission-critical, compliance-heavy)",
    ],
  },
  { key: "integrations", label: "Third-party integrations", options: ["None", "1-2", "3-5", "6 or more"] },
  { key: "timeline", label: "Timeline pressure", options: ["Flexible", "Standard", "Rushed / urgent"] },
  {
    key: "custom_work",
    label: "How custom is the work",
    options: ["Fully custom build", "Mostly custom with reusable components", "Templated / near off-the-shelf"],
  },
  {
    key: "support_included",
    label: "Ongoing support included",
    options: ["None", "Basic (bug fixes only)", "Full (retainer / SLA)"],
  },
  {
    key: "client_budget_signal",
    label: "Client's budget signal",
    options: ["Price-sensitive", "Mid-market", "Premium / enterprise budget"],
  },
  {
    key: "client_relationship",
    label: "Relationship with this client",
    options: ["New / cold lead", "Referral", "Repeat / existing client"],
  },
  {
    key: "competing_quotes",
    label: "Competing quotes",
    options: [
      "None known", "Lower quotes seen elsewhere", "Similar quotes seen elsewhere", "Higher quotes seen elsewhere",
    ],
  },
];

const VERDICT_LABEL: Record<PricingReview["verdict"], string> = {
  too_low: "Too low",
  needs_adjustment: "Needs adjustment",
  on_target: "On target",
  too_high: "Too high",
};

const VERDICT_TONE: Record<PricingReview["verdict"], "amber" | "blue" | "green" | "red"> = {
  too_low: "amber",
  needs_adjustment: "blue",
  on_target: "green",
  too_high: "red",
};

function money(subunits: number | null, currency: string) {
  if (subunits === null) return "—";
  return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

const EMPTY_ANSWERS: PricingReviewAnswers = Object.fromEntries(QUESTIONS.map((q) => [q.key, ""]));

export default function PricingReviewClient({ initialReviews }: { initialReviews: PricingReview[] }) {
  const [reviews, setReviews] = useState<PricingReview[]>(initialReviews);
  const [result, setResult] = useState<PricingReview | null>(initialReviews[0] ?? null);

  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [priceAmount, setPriceAmount] = useState("");
  const [currency, setCurrency] = useState("GHS");
  const [answers, setAnswers] = useState<PricingReviewAnswers>(EMPTY_ANSWERS);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAnswer = (key: string, value: string) => setAnswers((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError(null);

    if (!projectName.trim()) {
      setError("Give the project a name.");
      return;
    }
    const price = Number(priceAmount);
    if (!price || price <= 0) {
      setError("Enter the price you're charging (a positive number).");
      return;
    }
    if (!description.trim() && !pendingFile) {
      setError("Describe the project, or upload a document — there's nothing to evaluate otherwise.");
      return;
    }

    setSubmitting(true);
    try {
      const document = pendingFile
        ? { name: pendingFile.name, data: await readFileAsBase64(pendingFile) }
        : undefined;

      const review = await adminApi.post<PricingReview>("/api/v1/admin/pricing-review/generate", {
        project_name: projectName.trim(),
        description: description.trim() || undefined,
        price_amount: price,
        currency,
        answers,
        document,
      });

      setResult(review);
      setReviews((prev) => [review, ...prev]);
      // Keep the price/currency/questionnaire (a common next move is
      // re-checking the same project at a different price) but clear the
      // one-shot inputs.
      setDescription("");
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a verdict.");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Delete this pricing check?")) return;
    try {
      await adminApi.del(`/api/v1/admin/pricing-review/${id}`);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setResult((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this review.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Ledger"
        title="Pricing Check"
        description="Describe a project (or upload the proposal/contract), answer a few questions about it, and get an honest verdict on the price."
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Project & price">
          <div className="p-5 space-y-4">
            <Field label="Project name">
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Meridian Logistics — dispatch portal"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price you're charging">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceAmount}
                  onChange={(e) => setPriceAmount(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Currency">
                <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Description" hint="What's being built. Optional if you upload a document below.">
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short brief of the scope, e.g. what's included, key features, integrations..."
              />
            </Field>

            <Field label="Or upload a document" hint="Proposal, contract, or quote — pdf, png, jpg, webp, txt, md, csv or json, up to 8MB.">
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-hairline-strong text-sm font-medium hover:bg-bg-3 transition-colors cursor-pointer">
                  <Paperclip className="w-4 h-4" />
                  Choose file
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json"
                    onChange={(e) => {
                      setPendingFile(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
                {pendingFile && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-3 text-xs">
                    {pendingFile.name}
                    <button
                      type="button"
                      aria-label={`Remove ${pendingFile.name}`}
                      onClick={() => setPendingFile(null)}
                      className="text-text-3 hover:text-text"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}
              </div>
            </Field>
          </div>
        </Card>

        <Card title="A few questions about the project" bodyClassName="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {QUESTIONS.map((q) => (
              <Field key={q.key} label={q.label}>
                <Select value={answers[q.key] ?? ""} onChange={(e) => setAnswer(q.key, e.target.value)}>
                  <option value="">Not sure / skip</option>
                  {q.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button variant="accent" onClick={submit} disabled={submitting}>
              <Scale className="w-4 h-4" />
              {submitting ? "Checking…" : "Check this price"}
            </Button>
          </div>
        </Card>
      </div>

      {result && (
        <Card title="Verdict">
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill status={VERDICT_LABEL[result.verdict]} tone={VERDICT_TONE[result.verdict]} />
              <span className="text-sm text-text-3">{result.confidence} confidence</span>
              <span className="text-sm text-text-3">•</span>
              <span className="text-sm text-text-2">{result.project_name}</span>
              <span className="text-sm text-text-3">•</span>
              <span className="text-sm font-medium">{money(result.price_amount, result.currency)}</span>
            </div>

            {(result.suggested_min !== null || result.suggested_max !== null) && (
              <div className="rounded-lg border border-hairline bg-bg-2 px-4 py-3">
                <div className="text-xs font-medium text-text-3 uppercase tracking-wider mb-1">Suggested fair range</div>
                <div className="text-lg font-semibold tabular-nums">
                  {money(result.suggested_min, result.currency)} – {money(result.suggested_max, result.currency)}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-text-3 uppercase tracking-wider mb-1">Reasoning</div>
              <p className="text-sm text-text-2 whitespace-pre-wrap">{result.reasoning}</p>
            </div>

            {result.adjustment_notes && (
              <div>
                <div className="text-xs font-medium text-text-3 uppercase tracking-wider mb-1">What to adjust</div>
                <p className="text-sm text-text-2 whitespace-pre-wrap">{result.adjustment_notes}</p>
              </div>
            )}

            {result.grounding_note && (
              <p className="text-xs text-text-3">
                Grounded in: {result.grounding_source.replace(/_/g, " ")} — {result.grounding_note}
              </p>
            )}
          </div>
        </Card>
      )}

      <Card title="History">
        <Table head={["Project", "Price", "Verdict", "Suggested range", "Checked", ""]}>
          {reviews.length === 0 ? (
            <EmptyRow colSpan={6}>No pricing checks yet.</EmptyRow>
          ) : (
            reviews.map((r) => (
              <Row key={r.id} onClick={() => setResult(r)}>
                <Cell>{r.project_name}</Cell>
                <Cell>{money(r.price_amount, r.currency)}</Cell>
                <Cell><StatusPill status={VERDICT_LABEL[r.verdict]} tone={VERDICT_TONE[r.verdict]} /></Cell>
                <Cell>
                  {r.suggested_min !== null || r.suggested_max !== null
                    ? `${money(r.suggested_min, r.currency)} – ${money(r.suggested_max, r.currency)}`
                    : "—"}
                </Cell>
                <Cell className="text-text-3">{formatDateTime(r.created_at)}</Cell>
                <Cell className="text-right">
                  <IconButton
                    title="Delete"
                    tone="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(r.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </IconButton>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>
    </div>
  );
}
