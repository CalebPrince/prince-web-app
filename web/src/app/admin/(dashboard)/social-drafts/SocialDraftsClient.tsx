"use client";

import { useState } from "react";
import { api, AdminSocialDraft } from "@/lib/api";
import { Sparkles, Trash2, Edit } from "lucide-react";
import SocialDraftModal from "./SocialDraftModal";

export default function SocialDraftsClient({ initialDrafts }: { initialDrafts: AdminSocialDraft[] }) {
  const [drafts, setDrafts] = useState<AdminSocialDraft[]>(initialDrafts);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDraft, setActiveDraft] = useState<AdminSocialDraft | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const deleteDraft = async (id: number) => {
    if (!confirm("Are you sure you want to delete this draft?")) return;
    try {
      await api.adminDeleteSocialDraft(id);
      setDrafts(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateDraft = async (id: number, data: Partial<AdminSocialDraft>) => {
    await api.adminUpdateSocialDraft(id, data);
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...data } : d));
  };

  const handleUpdateStatus = async (id: number, status: 'approved' | 'rejected') => {
    await api.adminUpdateSocialDraft(id, { status });
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status } : d));
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await api.adminGenerateSocialDraft();
      // Reload to fetch the newly created draft
      window.location.reload();
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Failed to generate draft. Check if there are unused ideas for today.");
    } finally {
      setIsGenerating(false);
    }
  };

  const openReviewModal = (d: AdminSocialDraft) => {
    setActiveDraft(d);
    setIsModalOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-yellow-500/10 text-yellow-500">Draft</span>;
      case 'approved':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-green-500/10 text-green-500">Approved</span>;
      case 'rejected':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-red-500/10 text-red-500">Rejected</span>;
      default:
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-bg-3 text-text-2">{status}</span>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Social pipeline</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Drafted for you, ready to review.</h2>
          <p className="text-text-2">
            AI-drafted posts from your latest published content. Review and edit before approving. Approving publishes to LinkedIn directly (if connected).
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleGenerate}
            disabled={isGenerating}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 bg-text text-bg hover:bg-text/90 shadow-sm h-9 px-4 py-2 gap-2"
          >
            <Sparkles className="w-4 h-4" />
            {isGenerating ? "Generating..." : "Generate now"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
        <div className="p-4 border-b border-hairline bg-bg-2">
          <h2 className="font-semibold mb-0">Drafts</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
              <tr>
                <th className="px-6 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Preview</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {drafts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-text-3">
                    No drafts yet — click "Generate now" or wait for the next scheduled run.
                  </td>
                </tr>
              ) : (
                drafts.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-bg-2/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-text capitalize">
                        {d.source_type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-text-3 mt-0.5">ID: {d.source_id}</div>
                    </td>
                    <td className="px-4 py-4 max-w-md">
                      <div className="text-text-2 line-clamp-2 italic">"{d.content}"</div>
                      {d.publish_error && (
                        <div className="text-xs text-red-500 mt-1">Error: {d.publish_error}</div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(d.status)}
                    </td>
                    <td className="px-4 py-4 text-text-2">
                      {new Date(d.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openReviewModal(d)}
                          className="p-1.5 text-text-3 hover:text-accent rounded hover:bg-bg-3 transition-colors"
                          title="Review & Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteDraft(d.id)}
                          className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SocialDraftModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        draft={activeDraft}
        onSave={handleUpdateDraft}
        onUpdateStatus={handleUpdateStatus}
      />
    </div>
  );
}
