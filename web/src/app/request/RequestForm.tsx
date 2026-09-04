"use client";

import { useState, useEffect, useRef } from "react";
import { Check, ArrowRight, ArrowLeft } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "project_request_draft_v1";
const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const PROJECT_TYPES = [
  "AI voice agent",
  "WhatsApp or chat assistant",
  "Business workflow automation",
  "Autonomous AI agent",
  "Connected AI operations system",
  "Custom software foundation",
  "Other",
];

const BUDGETS = [
  "Under GHS 10,000",
  "GHS 10,000 – GHS 50,000",
  "GHS 50,000 – GHS 150,000",
  "GHS 150,000+",
  "Not sure yet",
];

const TIMELINES = [
  "As soon as possible",
  "Within 1 month",
  "2–3 months",
  "Flexible / not urgent",
];

const FEATURES = [
  "Call answering",
  "WhatsApp or chat",
  "Booking or scheduling",
  "CRM or system integration",
  "Human handoff and approvals",
  "Reporting and audit trail",
  "Follow-up automation",
];

export function RequestForm() {
  const [currentStep, setCurrentStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [projectType, setProjectType] = useState("");
  const [budget, setBudget] = useState("");
  const [timeline, setTimeline] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [attachments, setAttachments] = useState<FileList | null>(null);

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [restored, setRestored] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      let wasRestored = false;
      if (draft.name) { setName(draft.name); wasRestored = true; }
      if (draft.email) { setEmail(draft.email); wasRestored = true; }
      if (draft.project_type) { setProjectType(draft.project_type); wasRestored = true; }
      if (draft.budget) { setBudget(draft.budget); wasRestored = true; }
      if (draft.timeline) { setTimeline(draft.timeline); wasRestored = true; }
      if (draft.message) { setMessage(draft.message); wasRestored = true; }
      if (Array.isArray(draft.features) && draft.features.length) { setFeatures(draft.features); wasRestored = true; }
      
      if (wasRestored) {
        setRestored(true);
        setTimeout(() => setRestored(false), 4000);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "pricing-calculator") {
      localStorage.removeItem(DRAFT_KEY);
      const low = Number(params.get("estimate_low"));
      const high = Number(params.get("estimate_high"));
      const qFeatures = (params.get("features") || "").split(",").map(v => v.trim()).filter(Boolean);
      
      // Mapping logic could be refined here based on query params if needed
      
      if ((low || high) && !message) {
        setMessage(`Previous estimate context: ${low ? 'GHS ' + low.toLocaleString() : ''}${low && high ? ' - ' : ''}${high ? 'GHS ' + high.toLocaleString() : ''}.\n\nWorkflow details:`);
      }
    }
  }, []);

  useEffect(() => {
    if (name || email || projectType || budget || timeline || message || features.length) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        name, email, project_type: projectType, budget, timeline, message, features
      }));
    }
  }, [name, email, projectType, budget, timeline, message, features]);

  const toggleFeature = (feat: string) => {
    setFeatures(prev => prev.includes(feat) ? prev.filter(f => f !== feat) : [...prev, feat]);
  };

  const handleNext = () => {
    if (!formRef.current) return;
    const requiredInputs = Array.from(formRef.current.querySelectorAll(`[data-step="${currentStep}"] [required]`)) as HTMLInputElement[];
    const isValid = requiredInputs.every(input => {
      if (!input.checkValidity()) {
        input.reportValidity();
        return false;
      }
      return true;
    });

    if (isValid) {
      setError(null);
      setCurrentStep(s => Math.min(3, s + 1));
      window.scrollTo({ top: document.getElementById("request-form")?.offsetTop! - 100, behavior: "smooth" });
    }
  };

  const handlePrev = () => {
    setCurrentStep(s => Math.max(1, s - 1));
    window.scrollTo({ top: document.getElementById("request-form")?.offsetTop! - 100, behavior: "smooth" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentStep !== 3) return;
    
    setError(null);

    if (attachments) {
      if (attachments.length > MAX_ATTACHMENTS) {
        setError(`You can upload up to ${MAX_ATTACHMENTS} attachments.`);
        return;
      }
      for (let i = 0; i < attachments.length; i++) {
        if (attachments[i].size > MAX_FILE_BYTES) {
          setError(`${attachments[i].name} exceeds the 10MB limit.`);
          return;
        }
      }
    }

    setSending(true);

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("project_type", projectType);
    formData.append("budget", budget);
    formData.append("timeline", timeline);
    formData.append("message", message);
    formData.append("website", website);
    features.forEach(f => formData.append("features[]", f));
    if (attachments) {
      for (let i = 0; i < attachments.length; i++) {
        formData.append("attachments[]", attachments[i]);
      }
    }

    try {
      await api.submitProjectRequest(formData);
      setSent(true);
      localStorage.removeItem(DRAFT_KEY);
      window.scrollTo({ top: document.getElementById("request-form")?.offsetTop! - 100, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Request a workflow review</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 max-w-4xl text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Show me where the <span className="text-accent">work</span> gets stuck.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              Explain what triggers the work, what your team does now, and what should happen at the end. Attach an existing script, process, or reference if you have one.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32" id="request-form">
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 md:p-10 glass">
            {sent ? (
              <div className="flex flex-col items-center py-8 text-center animate-in fade-in zoom-in duration-500">
                <span className="tilt-3d tilt-3d-tile grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                  <Check className="icon-3d icon-3d-on-accent size-7" />
                </span>
                <p className="label mt-6 text-accent">Workflow request received</p>
                <h3 className="mt-2 text-2xl font-bold tracking-tight">Thanks, I'll review your workflow.</h3>
                <p className="mt-3 text-text-2">I will get back to you within a couple of business days with a tailored AI agent or automation proposal.</p>
              </div>
            ) : (
              <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
                <div className="mb-8">
                  <div className="flex justify-between text-sm text-text-2 mb-2">
                    <span className="font-semibold uppercase tracking-wider">Step {currentStep} of 3</span>
                    <span>{Math.round((currentStep / 3) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline-strong">
                    <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(currentStep / 3) * 100}%` }} />
                  </div>
                </div>

                {restored && (
                  <div className="rounded border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-200">
                    Saved draft restored.
                  </div>
                )}

                <div className={cn("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500", currentStep !== 1 && "hidden")} data-step="1">
                  <div className="grid gap-6 md:grid-cols-2">
                    <Field label="Name" htmlFor="name">
                      <input id="name" required maxLength={255} placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} className={inputCls} />
                    </Field>
                    <Field label="Email" htmlFor="email">
                      <input id="email" type="email" required maxLength={255} placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
                    </Field>
                  </div>
                  <div className="grid gap-6 md:grid-cols-3">
                    <Field label="Starting point" htmlFor="project_type">
                      <select id="project_type" required value={projectType} onChange={e => setProjectType(e.target.value)} className={inputCls}>
                        <option value="" disabled>Select one</option>
                        {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Budget" htmlFor="budget">
                      <select id="budget" required value={budget} onChange={e => setBudget(e.target.value)} className={inputCls}>
                        <option value="" disabled>Select a range</option>
                        {BUDGETS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                    <Field label="Timeline" htmlFor="timeline">
                      <select id="timeline" required value={timeline} onChange={e => setTimeline(e.target.value)} className={inputCls}>
                        <option value="" disabled>Select one</option>
                        {TIMELINES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                <div className={cn("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500", currentStep !== 2 && "hidden")} data-step="2">
                  <fieldset>
                    <legend className="label mb-3 block text-text">What should the workflow include? (optional)</legend>
                    <div className="flex flex-wrap gap-3">
                      {FEATURES.map(feat => (
                        <label key={feat} className="flex cursor-pointer items-center gap-2 rounded-full border border-hairline-strong bg-bg/50 px-4 py-2 text-sm transition-colors hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent/10 has-[:checked]:text-accent glass">
                          <input type="checkbox" className="hidden" checked={features.includes(feat)} onChange={() => toggleFeature(feat)} />
                          {feat}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field label="Describe what happens today" htmlFor="message">
                    <textarea id="message" required rows={5} maxLength={5000} placeholder="What starts the workflow? What does your team do manually? Where does it fail or slow down? What should a successful result look like?" value={message} onChange={e => setMessage(e.target.value)} className={cnResize} />
                  </Field>

                  <Field label="Attachments (optional)" htmlFor="attachments">
                    <input id="attachments" type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" onChange={e => setAttachments(e.target.files)} className="block w-full text-sm text-text-2 file:mr-4 file:rounded-full file:border-0 file:bg-bg file:px-4 file:py-2 file:text-sm file:font-semibold file:text-text hover:file:bg-bg-2" />
                    <p className="mt-2 text-xs text-muted">Briefs, mockups, or reference docs. Up to 5 files, 10MB each, PDF, Word, or images.</p>
                  </Field>
                </div>

                <div className={cn("space-y-6 animate-in fade-in slide-in-from-right-4 duration-500", currentStep !== 3 && "hidden")} data-step="3">
                  <h3 className="text-xl font-bold">Review your request</h3>
                  <div className="grid gap-4 sm:grid-cols-2 text-sm">
                    <div><span className="text-muted block">Name:</span> <strong className="text-text">{name || " "}</strong></div>
                    <div><span className="text-muted block">Email:</span> <strong className="text-text">{email || " "}</strong></div>
                    <div><span className="text-muted block">Starting point:</span> <strong className="text-text">{projectType || " "}</strong></div>
                    <div><span className="text-muted block">Budget:</span> <strong className="text-text">{budget || " "}</strong></div>
                    <div><span className="text-muted block">Timeline:</span> <strong className="text-text">{timeline || " "}</strong></div>
                    <div className="sm:col-span-2"><span className="text-muted block">Features:</span> <strong className="text-text">{features.length ? features.join(", ") : "None selected"}</strong></div>
                    <div className="sm:col-span-2"><span className="text-muted block">Workflow details:</span> <strong className="text-text whitespace-pre-wrap">{message || " "}</strong></div>
                  </div>
                </div>

                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <label htmlFor="website">Leave this blank</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                {error && <p className="text-sm text-red-400 p-4 border border-red-900/50 rounded bg-red-900/10">{error}</p>}

                <div className="flex gap-3 pt-4">
                  {currentStep > 1 && (
                    <Button type="button" variant="outline" onClick={handlePrev} disabled={sending} className="w-full">
                      <ArrowLeft className="mr-2 size-4" /> Back
                    </Button>
                  )}
                  {currentStep < 3 ? (
                    <Button type="button" onClick={handleNext} className="w-full">
                      Next <ArrowRight className="ml-2 size-4" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={sending} className="w-full">
                      {sending ? "Sending…" : "Send workflow request"}
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        </Reveal>
      </section>
    </>
  );
}

const inputCls = "h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none";
const cnResize = `${inputCls} h-auto py-3.5`;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="label mb-2 block text-muted">{label}</span>
      {children}
    </label>
  );
}
