import { useState, useEffect } from "react";
import { Project, AdminProject } from "@/lib/api";
import { X } from "lucide-react";

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

  useEffect(() => {
    if (isOpen) {
      setFormData(project || {
        title: "",
        slug: "",
        summary: "",
        category: "custom_solution",
        finance_currency: "GHS",
        contract_value: 0,
        actual_cost: 0,
        hours_worked: 0,
        delivery_status: "on_track",
        progress_percent: 0,
        is_published: false
      });
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked :
              type === 'number' || type === 'range' ? Number(value) : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save project.");
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
              <h3 className="text-sm font-semibold text-text-3 uppercase tracking-wider">Core Info</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Title</label>
                  <input required name="title" value={formData.title || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Slug</label>
                  <input name="slug" value={formData.slug || ""} onChange={handleChange} placeholder="Auto-generated if empty" className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium mb-1">Summary</label>
                  <textarea required name="summary" value={formData.summary || ""} onChange={handleChange} rows={2} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
              </div>
            </div>

            {/* Classification */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className="text-sm font-semibold text-text-3 uppercase tracking-wider">Classification</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <select name="category" value={formData.category || "custom_solution"} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                    <option value="custom_solution">Custom Solution</option>
                    <option value="cms">CMS</option>
                    <option value="mobile">Mobile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Live URL</label>
                  <input name="live_url" type="url" value={formData.live_url || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Repo URL</label>
                  <input name="repo_url" type="url" value={formData.repo_url || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
              </div>
            </div>

            {/* Delivery */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className="text-sm font-semibold text-text-3 uppercase tracking-wider">Delivery</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select name="delivery_status" value={formData.delivery_status || "on_track"} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                    <option value="on_track">On track</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="at_risk">At risk</option>
                    <option value="due_this_month">Due this month</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 flex justify-between">
                    <span>Progress</span>
                    <span className="text-text-3">{formData.progress_percent || 0}%</span>
                  </label>
                  <input name="progress_percent" type="range" min="0" max="100" step="5" value={formData.progress_percent || 0} onChange={handleChange} className="w-full mt-2 accent-accent" />
                </div>
              </div>
            </div>

            {/* Finances */}
            <div className="space-y-4 pt-4 border-t border-hairline">
              <h3 className="text-sm font-semibold text-text-3 uppercase tracking-wider">Finances</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Currency</label>
                  <select name="finance_currency" value={formData.finance_currency || "GHS"} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent">
                    <option>GHS</option>
                    <option>USD</option>
                    <option>GBP</option>
                    <option>EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Project Value</label>
                  <input name="contract_value" type="number" min="0" step="0.01" value={formData.contract_value || 0} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Actual Cost</label>
                  <input name="actual_cost" type="number" min="0" step="0.01" value={formData.actual_cost || 0} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Hours Worked</label>
                  <input name="hours_worked" type="number" min="0" step="0.25" value={formData.hours_worked || 0} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
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
          <button type="submit" form="project-form" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium bg-text text-bg hover:bg-text/90 rounded-md transition-colors disabled:opacity-50">
            {isSubmitting ? "Saving..." : "Save Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
