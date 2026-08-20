import { useState, useEffect, useRef } from "react";
import { AdminProject, AdminTestimonial, api, adminApi } from "@/lib/api";
import { X, Upload, Trash2, Plus } from "lucide-react";

type ClientOption = { id: number; name: string; email: string };
type AgentOption = { key: string; name: string; role: string };
type Milestone = { id?: number; title: string; due_date: string; is_completed: boolean };
type Metric = { value: string; label: string };

function slugify(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseMetrics(text: string): Metric[] {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [value, ...rest] = line.split("|");
      return { value: value.trim(), label: rest.join("|").trim() };
    })
    .filter(m => m.value || m.label);
}

function metricsToText(metrics?: Metric[] | unknown): string {
  if (!Array.isArray(metrics)) return "";
  return metrics.map((m: Metric) => `${m.value || ""} | ${m.label || ""}`.trim()).join("\n");
}

const inputClass = "w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-sm font-medium mb-1";
const sectionHeadingClass = "text-sm font-semibold text-text-3 uppercase tracking-wider";

export default function ProjectModal({
  isOpen,
  onClose,
  project,
  onSave
}: {
  isOpen: boolean;
  onClose: () => void;
  project: AdminProject | null;
  onSave: (data: Partial<AdminProject>) => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AdminProject>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugEditedManually, setSlugEditedManually] = useState(false);

  const [tagsText, setTagsText] = useState("");
  const [metricsText, setMetricsText] = useState("");
  const [galleryPaths, setGalleryPaths] = useState<string[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const [coverUploading, setCoverUploading] = useState(false);
  const [coverUploadError, setCoverUploadError] = useState("");
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [galleryUploadError, setGalleryUploadError] = useState("");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [testimonials, setTestimonials] = useState<AdminTestimonial[]>([]);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    setFormData(project || {
      title: "",
      slug: "",
      summary: "",
      category: "custom_solution",
      finance_currency: "GHS",
      contract_value: 0,
      estimated_cost: 0,
      actual_cost: 0,
      hours_worked: 0,
      delivery_status: "on_track",
      progress_percent: 0,
      is_published: false
    });
    setSlugEditedManually(!!project);
    setTagsText((project?.tags || []).map(t => t.name).join(", "));
    setMetricsText(metricsToText(project?.metrics));
    setGalleryPaths([...(project?.gallery || [])]);
    setMilestones(((project as unknown as { milestones?: Milestone[] })?.milestones || []).map(m => ({
      id: m.id, title: m.title, due_date: m.due_date || "", is_completed: !!m.is_completed
    })));
    setCoverUploadError("");
    setGalleryUploadError("");

    adminApi.get<ClientOption[]>("/api/v1/admin/clients").then(setClients).catch(() => setClients([]));
    api.adminTestimonials().then(list => setTestimonials(list.filter(t => t.status === "approved"))).catch(() => setTestimonials([]));
    adminApi.get<{ agents: AgentOption[] }>("/api/v1/admin/team").then(res => setAgents(res.agents || [])).catch(() => setAgents([]));
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              type === 'number' || type === 'range' ? Number(value) : value
    }));

    if (name === "title" && !slugEditedManually) {
      setFormData(prev => ({ ...prev, title: value, slug: slugify(value) }));
    }
    if (name === "slug") {
      setSlugEditedManually(true);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploadError("");
    setCoverUploading(true);
    try {
      const { path } = await api.adminUploadFile(file);
      setFormData(prev => ({ ...prev, cover_image_path: path }));
    } catch (err) {
      setCoverUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setGalleryUploadError("");
    setGalleryUploading(true);
    try {
      for (const file of files) {
        const { path } = await api.adminUploadFile(file);
        setGalleryPaths(prev => [...prev, path]);
      }
    } catch (err) {
      setGalleryUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setGalleryUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  const removeGalleryImage = (index: number) => {
    setGalleryPaths(prev => prev.filter((_, i) => i !== index));
  };

  const addMilestone = () => {
    setMilestones(prev => [...prev, { title: "", due_date: "", is_completed: false }]);
  };

  const updateMilestone = (index: number, patch: Partial<Milestone>) => {
    setMilestones(prev => prev.map((m, i) => i === index ? { ...m, ...patch } : m));
  };

  const removeMilestone = (index: number) => {
    setMilestones(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        ...formData,
        slug: (formData.slug || "").trim() || slugify(formData.title || ""),
        tags: tagsText.split(",").map(t => t.trim()).filter(Boolean),
        gallery: galleryPaths,
        metrics: parseMetrics(metricsText),
        milestones: milestones
          .filter(m => m.title.trim())
          .map(m => ({ id: m.id || null, title: m.title.trim(), due_date: m.due_date || null, is_completed: m.is_completed })),
      };
      await onSave(payload as Partial<AdminProject>);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-hairline">
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <h2 className="text-lg font-semibold">{project ? "Edit Project" : "New Project"}</h2>
          <button onClick={onClose} className="p-1 text-text-3 hover:text-text rounded-md hover:bg-bg-3 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          <form id="project-form" onSubmit={handleSubmit} className="space-y-8">
            {/* Core Info */}
            <div className="space-y-4">
              <h3 className={sectionHeadingClass}>Core Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Title</label>
                  <input required name="title" value={formData.title || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Slug</label>
                  <input name="slug" value={formData.slug || ""} onChange={handleChange} placeholder="Auto-generated if empty" className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Summary</label>
                  <textarea required name="summary" value={formData.summary || ""} onChange={handleChange} rows={2} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Case study body</label>
                  <textarea name="case_study_body" value={(formData.case_study_body as string) || ""} onChange={handleChange} rows={6} className={`${inputClass} font-mono`} placeholder="Full case-study write-up..." />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Outcome metrics</label>
                  <textarea name="outcome_metrics" value={(formData.outcome_metrics as string) || ""} onChange={handleChange} rows={2} className={inputClass} placeholder="Results / outcomes summary" />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Tags</label>
                  <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Comma-separated, e.g. React, Payments, CMS" className={inputClass} />
                </div>
              </div>
            </div>

            {/* Media */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className={sectionHeadingClass}>Media</h3>
              <div>
                <label className={labelClass}>Cover image</label>
                <div className="flex items-center gap-4">
                  {formData.cover_image_path ? (
                    <img src={formData.cover_image_path as string} alt="Cover preview" className="w-16 h-16 object-cover rounded-md border border-hairline" />
                  ) : (
                    <div className="w-16 h-16 rounded-md border border-dashed border-hairline flex items-center justify-center text-text-3">
                      <Upload className="w-5 h-5" />
                    </div>
                  )}
                  <div className="flex-1 space-y-1">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleCoverUpload}
                      className="block w-full text-sm text-text-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-hairline file:bg-bg-2 file:text-sm file:font-medium hover:file:bg-bg-3"
                    />
                    {coverUploading && <p className="text-xs text-text-3">Uploading…</p>}
                    {coverUploadError && <p className="text-xs text-red-500">{coverUploadError}</p>}
                  </div>
                </div>
              </div>
              <div>
                <label className={labelClass}>Gallery</label>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  className="block w-full text-sm text-text-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-hairline file:bg-bg-2 file:text-sm file:font-medium hover:file:bg-bg-3"
                />
                {galleryUploading && <p className="text-xs text-text-3 mt-1">Uploading…</p>}
                {galleryUploadError && <p className="text-xs text-red-500 mt-1">{galleryUploadError}</p>}
                {galleryPaths.length > 0 && (
                  <div className="flex flex-wrap gap-3 mt-2">
                    {galleryPaths.map((path, i) => (
                      <div key={i} className="relative">
                        <img src={path} alt="" className="w-16 h-16 object-cover rounded-md border border-hairline" />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-bg border border-hairline flex items-center justify-center text-text-3 hover:text-red-500"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Classification */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className={sectionHeadingClass}>Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Category</label>
                  <select name="category" value={formData.category || "custom_solution"} onChange={handleChange} className={inputClass}>
                    <option value="custom_solution">Custom Solution</option>
                    <option value="cms">CMS</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Live URL</label>
                  <input name="live_url" type="url" value={formData.live_url || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Repo URL</label>
                  <input name="repo_url" type="url" value={formData.repo_url || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Client</label>
                  <select name="client_id" value={(formData.client_id as number) || ""} onChange={handleChange} className={inputClass}>
                    <option value="">Unassigned</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} — {c.email}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Testimonial</label>
                  <select name="testimonial_id" value={(formData.testimonial_id as number) || ""} onChange={handleChange} className={inputClass}>
                    <option value="">None</option>
                    {testimonials.map(t => <option key={t.id} value={t.id}>{t.client_name} — &quot;{(t.quote || "").slice(0, 60)}{(t.quote || "").length > 60 ? "…" : ""}&quot;</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Sort order</label>
                  <input name="sort_order" type="number" value={formData.sort_order ?? 0} onChange={handleChange} className={`${inputClass} font-mono`} />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" name="is_featured" checked={!!formData.is_featured} onChange={handleChange} className="w-4 h-4 accent-accent rounded" />
                  Display on homepage (featured)
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" name="is_embeddable" checked={!!formData.is_embeddable} onChange={handleChange} className="w-4 h-4 accent-accent rounded" />
                  Allow embedded live demo
                </label>
              </div>
            </div>

            {/* Public showcase */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className={sectionHeadingClass}>Public showcase</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Tagline</label>
                  <input name="tagline" value={(formData.tagline as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Showcase category</label>
                  <input name="showcase_category" value={(formData.showcase_category as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Client name (public)</label>
                  <input name="client_name" value={(formData.client_name as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Role</label>
                  <input name="role" value={(formData.role as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Timeline</label>
                  <input name="timeline" value={(formData.timeline as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Project year</label>
                  <input name="project_year" value={(formData.project_year as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Result headline</label>
                  <input name="result_headline" value={(formData.result_headline as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Metrics <span className="text-text-3 font-normal normal-case">(one per line: value | label)</span></label>
                  <textarea value={metricsText} onChange={(e) => setMetricsText(e.target.value)} rows={3} className={inputClass} placeholder={"3× | Booked calls\n40% | Faster checkout"} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Challenge</label>
                  <textarea name="challenge" value={(formData.challenge as string) || ""} onChange={handleChange} rows={2} className={inputClass} />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Solution</label>
                  <textarea name="solution" value={(formData.solution as string) || ""} onChange={handleChange} rows={2} className={inputClass} />
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className={sectionHeadingClass}>Delivery</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Status</label>
                  <select name="delivery_status" value={formData.delivery_status || "on_track"} onChange={handleChange} className={inputClass}>
                    <option value="on_track">On track</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="at_risk">At risk</option>
                    <option value="due_this_month">Due this month</option>
                  </select>
                </div>
                <div>
                  <label className={`${labelClass} flex justify-between`}>
                    <span>Progress</span>
                    <span className="text-text-3">{formData.progress_percent || 0}%</span>
                  </label>
                  <input name="progress_percent" type="range" min="0" max="100" step="5" value={formData.progress_percent || 0} onChange={handleChange} className="w-full mt-2 accent-accent" />
                </div>
                <div>
                  <label className={labelClass}>Deadline</label>
                  <input name="deadline" type="date" value={(formData.deadline as string) || ""} onChange={handleChange} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Assigned agent</label>
                  <select name="assigned_agent_key" value={(formData.assigned_agent_key as string) || ""} onChange={handleChange} className={inputClass}>
                    <option value="">No supporting agent</option>
                    {agents.map(a => <option key={a.key} value={a.key}>{a.name} — {a.role}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <label className={labelClass + " mb-0"}>Milestones</label>
                  <button type="button" onClick={addMilestone} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add milestone
                  </button>
                </div>
                {milestones.length === 0 ? (
                  <p className="text-xs text-text-3">No milestones yet.</p>
                ) : (
                  <div className="space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="checkbox" checked={m.is_completed} onChange={(e) => updateMilestone(i, { is_completed: e.target.checked })} className="w-4 h-4 accent-accent rounded" />
                        <input value={m.title} onChange={(e) => updateMilestone(i, { title: e.target.value })} placeholder="Milestone title" maxLength={160} className={`${inputClass} flex-1`} />
                        <input type="date" value={m.due_date} onChange={(e) => updateMilestone(i, { due_date: e.target.value })} className={inputClass} />
                        <button type="button" onClick={() => removeMilestone(i)} className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Finances */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className={sectionHeadingClass}>Finances</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className={labelClass}>Currency</label>
                  <select name="finance_currency" value={formData.finance_currency || "GHS"} onChange={handleChange} className={inputClass}>
                    <option>GHS</option>
                    <option>USD</option>
                    <option>GBP</option>
                    <option>EUR</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Project Value</label>
                  <input name="contract_value" type="number" min="0" step="0.01" value={formData.contract_value || 0} onChange={handleChange} className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>Estimated Cost</label>
                  <input name="estimated_cost" type="number" min="0" step="0.01" value={formData.estimated_cost || 0} onChange={handleChange} className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>Actual Cost</label>
                  <input name="actual_cost" type="number" min="0" step="0.01" value={formData.actual_cost || 0} onChange={handleChange} className={`${inputClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>Hours Worked</label>
                  <input name="hours_worked" type="number" min="0" step="0.25" value={formData.hours_worked || 0} onChange={handleChange} className={`${inputClass} font-mono`} />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-hairline flex items-center gap-2">
              <input type="checkbox" id="is_published" name="is_published" checked={formData.is_published || false} onChange={handleChange} className="w-4 h-4 accent-accent rounded" />
              <label htmlFor="is_published" className="text-sm font-medium cursor-pointer">Published to live site</label>
            </div>
          </form>
        </div>

        <div className="p-4 border-t border-hairline flex justify-end gap-3 bg-bg-2 rounded-b-xl">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-text hover:bg-bg-3 rounded-md transition-colors border border-transparent hover:border-hairline">
            Cancel
          </button>
          <button type="submit" form="project-form" disabled={isSubmitting || coverUploading || galleryUploading} className="px-4 py-2 text-sm font-medium bg-text text-bg hover:bg-text/90 rounded-md transition-colors disabled:opacity-50">
            {isSubmitting ? "Saving..." : "Save Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
