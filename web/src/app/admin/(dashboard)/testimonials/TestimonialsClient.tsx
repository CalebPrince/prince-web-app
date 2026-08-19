"use client";

import { useState } from "react";
import { api, AdminTestimonial } from "@/lib/api";
import { Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import TestimonialModal from "./TestimonialModal";

export default function TestimonialsClient({ initialTestimonials }: { initialTestimonials: AdminTestimonial[] }) {
  const [testimonials, setTestimonials] = useState<AdminTestimonial[]>(initialTestimonials);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const deleteTestimonial = async (id: number) => {
    if (!confirm("Are you sure you want to delete this testimonial?")) return;
    try {
      await api.adminDeleteTestimonial(id);
      setTestimonials(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const updateStatus = async (id: number, status: 'approved' | 'rejected') => {
    try {
      await api.adminUpdateTestimonial(id, { status });
      setTestimonials(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestTestimonial = async (data: { client_name: string; client_email: string; project_reference?: string }) => {
    await api.adminRequestTestimonial(data);
    // Refresh to show the newly requested row
    window.location.reload();
  };

  const renderStars = (rating?: number) => {
    if (!rating) return "—";
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'requested':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-blue-500/10 text-blue-500">Requested</span>;
      case 'submitted':
        return <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider bg-yellow-500/10 text-yellow-500">Submitted</span>;
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
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Content</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Let happy clients do the talking.</h2>
          <p className="text-text-2">Request reviews from past clients, then approve them for the public testimonials page.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 bg-text text-bg hover:bg-text/90 shadow-sm h-9 px-4 py-2 gap-2"
          >
            <Plus className="w-4 h-4" />
            Request a testimonial
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-hairline bg-bg overflow-hidden">
        <div className="p-4 border-b border-hairline bg-bg-2">
          <h2 className="font-semibold mb-0">All testimonials</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-bg-2/50 text-text-2 text-xs uppercase border-b border-hairline">
              <tr>
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-yellow-500">Rating</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {testimonials.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-text-3">
                    No testimonial requests yet.
                  </td>
                </tr>
              ) : (
                testimonials.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-bg-2/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium text-text">
                      {t.client_name}
                      <div className="text-xs font-normal text-text-3 mt-0.5">{t.client_email}</div>
                    </td>
                    <td className="px-4 py-4 text-text-2">
                      {t.project_reference || "—"}
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(t.status)}
                    </td>
                    <td className="px-4 py-4 text-yellow-500 text-base">
                      {renderStars(t.rating)}
                    </td>
                    <td className="px-4 py-4 text-text-2 max-w-xs">
                      {t.quote ? (
                        <div className="line-clamp-2 italic">"{t.quote}"</div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-4 text-text-2">
                      {t.requested_at ? new Date(t.requested_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {t.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => updateStatus(t.id, 'approved')}
                              className="p-1.5 text-text-3 hover:text-green-500 rounded hover:bg-bg-3 transition-colors"
                              title="Approve"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => updateStatus(t.id, 'rejected')}
                              className="p-1.5 text-text-3 hover:text-red-500 rounded hover:bg-bg-3 transition-colors"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => deleteTestimonial(t.id)}
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

      <TestimonialModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onRequest={handleRequestTestimonial}
      />
    </div>
  );
}
