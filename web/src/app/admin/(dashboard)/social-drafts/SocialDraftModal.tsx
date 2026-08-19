import { useState, useEffect } from "react";
import { AdminSocialDraft } from "@/lib/api";

import { X, ExternalLink } from "lucide-react";

export default function SocialDraftModal({
  isOpen,
  onClose,
  draft,
  onSave,
  onUpdateStatus
}: {
  isOpen: boolean;
  onClose: () => void;
  draft: AdminSocialDraft | null;
  onSave: (id: number, data: Partial<AdminSocialDraft>) => Promise<void>;
  onUpdateStatus: (id: number, status: 'approved' | 'rejected') => Promise<void>;
}) {
  const [formData, setFormData] = useState<Partial<AdminSocialDraft>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    if (isOpen && draft) {
      setFormData(draft);
    }
  }, [isOpen, draft]);

  if (!isOpen || !draft) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(draft.id, {
        content: formData.content,
        short_content: formData.short_content,
        hashtags: formData.hashtags,
        image_url: formData.image_url,
        linkedin_post_urn: formData.linkedin_post_urn,
      });
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onSave(draft.id, {
        content: formData.content,
        short_content: formData.short_content,
        hashtags: formData.hashtags,
        image_url: formData.image_url,
        linkedin_post_urn: formData.linkedin_post_urn,
      }); // Save fields first just in case
      await onUpdateStatus(draft.id, 'approved');
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to approve draft.");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onUpdateStatus(draft.id, 'rejected');
      onClose();
    } catch (err) {
      console.error(err);
      alert("Failed to reject draft.");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-bg w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-hairline">
        <div className="flex items-start justify-between p-4 border-b border-hairline">
          <div>
            <h2 className="text-lg font-semibold">
              Review draft — <span className="text-accent">#{draft.source_id} ({draft.source_type})</span>
            </h2>
            <span className="text-sm text-text-3">AI Provider: {draft.ai_provider || "Unknown"}</span>
          </div>
          <button onClick={onClose} className="p-1 text-text-3 hover:text-text rounded-md hover:bg-bg-3 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Post (LinkedIn / Facebook / Instagram)</label>
            <textarea name="content" value={formData.content || ""} onChange={handleChange} rows={5} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent font-sans" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Short version (X / Twitter)</label>
            <textarea name="short_content" value={formData.short_content || ""} onChange={handleChange} rows={3} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent font-sans" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">Hashtags</label>
            <input name="hashtags" value={formData.hashtags || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="#WebDevelopment #Ghana" />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">
              Image URL <span className="text-text-3 font-normal">(clear to send with no image)</span>
            </label>
            <div className="flex items-center gap-3">
              {formData.image_url && (
                <img src={formData.image_url} alt="Preview" className="w-16 h-16 object-cover rounded-md border border-hairline" />
              )}
              <input name="image_url" value={formData.image_url || ""} onChange={handleChange} className="flex-1 bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="https://..." />
            </div>
          </div>

          {draft.linkedin_post_urn && (
            <div>
              <label className="block text-sm font-semibold mb-1">LinkedIn post URN</label>
              <input name="linkedin_post_urn" value={formData.linkedin_post_urn || ""} onChange={handleChange} className="w-full bg-bg-2 border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent" placeholder="urn:li:share:..." />
              <div className="text-xs text-text-3 mt-1">Used by Radar to look up post performance stats. Editable so an older post can be backfilled by hand.</div>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-hairline flex items-center justify-between bg-bg-2 rounded-b-xl">
          <button 
            type="button" 
            onClick={handleReject} 
            disabled={isRejecting || draft.status === 'rejected'} 
            className="px-4 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors disabled:opacity-50 border border-red-500/20"
          >
            {isRejecting ? "Rejecting..." : "Reject"}
          </button>
          <div className="flex gap-2">
            <button 
              type="button" 
              onClick={handleSave} 
              disabled={isSaving} 
              className="px-4 py-2 text-sm font-medium text-text hover:bg-bg-3 rounded-md transition-colors border border-hairline"
            >
              {isSaving ? "Saving..." : "Save changes"}
            </button>
            <button 
              type="button" 
              onClick={handleApprove} 
              disabled={isApproving || draft.status === 'approved'} 
              className="px-4 py-2 text-sm font-medium bg-accent text-white hover:bg-accent/90 rounded-md transition-colors disabled:opacity-50 shadow-sm"
            >
              {isApproving ? "Approving..." : "Approve & Post"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
