"use client";

import { useState } from "react";
import { api, AdminTestimonial, type GoogleReview } from "@/lib/api";
import { Plus, Trash2, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import TestimonialModal from "./TestimonialModal";

export default function TestimonialsClient({
  initialTestimonials,
  initialGoogleReviews,
  googleConfigured,
  ratingPublished,
}: {
  initialTestimonials: AdminTestimonial[];
  initialGoogleReviews: GoogleReview[];
  googleConfigured: boolean;
  ratingPublished: boolean;
}) {
  const [testimonials, setTestimonials] = useState<AdminTestimonial[]>(initialTestimonials);
  const [googleReviews, setGoogleReviews] = useState<GoogleReview[]>(initialGoogleReviews);
  const [savingGoogleId, setSavingGoogleId] = useState<string | null>(null);
  const [publishedRating, setPublishedRating] = useState(ratingPublished);
  const [savingRating, setSavingRating] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
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

  const toggleGooglePlacement = async (review: GoogleReview, placement: "landing" | "testimonials") => {
    const current = review.placements ?? [];
    const placements = current.includes(placement)
      ? current.filter((item) => item !== placement)
      : [...current, placement];
    setGoogleError(null);
    setSavingGoogleId(review.id);
    try {
      await api.adminUpdateGoogleReview(review.id, placements);
      setGoogleReviews((rows) => rows.map((row) => row.id === review.id ? { ...row, placements } : row));
    } catch (err) {
      // A failed save must not leave the pill looking as though the review is
      // published on the public site when it is not.
      setGoogleError(err instanceof Error ? err.message : "Could not update where this review appears.");
    } finally {
      setSavingGoogleId(null);
    }
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
      {googleError && (
        <p role="alert" className="rounded-xl border border-red-500/40 p-4 text-red-400">
          {googleError}
        </p>
      )}

      {/* Google's own overall rating for the business, shown on the home
          page by default. Unticking this takes it down; written reviews work
          the other way round and stay hidden until placed. */}
      <div className="rounded-xl border border-hairline bg-bg-2 p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={publishedRating}
            disabled={savingRating}
            onChange={async (e) => {
              const next = e.target.checked;
              setSavingRating(true);
              setGoogleError(null);
              try {
                await api.adminSaveSettings({ google_rating_published: next ? "1" : "0" });
                setPublishedRating(next);
              } catch (err) {
                setGoogleError(
                  err instanceof Error ? err.message : "Could not save rating visibility.",
                );
              } finally {
                setSavingRating(false);
              }
            }}
            className="mt-1 size-5 accent-accent"
          />
          <span>
            <strong>Publish my live Google rating and review count</strong>
            <span className="mt-1 block text-sm text-text-2">
              Shows the stars, the review count and a &ldquo;Leave a review&rdquo; link on the home
              page. This is Google&rsquo;s overall rating for the business, not an average of the
              reviews you select below. Untick it to take the strip down.
            </span>
          </span>
        </label>
      </div>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-hairline pb-6">
        <div>
          <div className="text-sm font-medium text-text-3 uppercase tracking-wider mb-1">Content</div>
          <h2 className="text-3xl font-bold tracking-tight mb-1">Let happy clients do the talking.</h2>
          <p className="text-text-2">Publish Google reviews only after reviewing them. Direct testimonial requests remain in your records.</p>
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
        <div className="flex flex-col gap-1 border-b border-hairline bg-bg-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Google reviews</h2>
            <p className="mt-1 text-sm text-text-2">Reviews arrive from Google through the configured Places integration. New reviews stay hidden until you choose a placement.</p>
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-text-3">Up to 5 supplied by Google</span>
        </div>
        {!googleConfigured ? (
          <p className="p-6 text-sm text-text-2">Add your Google Places API key and Place ID under Settings → Integrations.</p>
        ) : googleReviews.length === 0 ? (
          <p className="p-6 text-sm text-text-2">Google has not returned any written reviews yet.</p>
        ) : (
          <div className="grid gap-px bg-hairline md:grid-cols-2">
            {googleReviews.map((review) => (
              <article key={review.id} className="bg-bg p-5">
                <div className="flex items-start gap-3">
                  {review.authorPhotoUri ? (
                    <img src={review.authorPhotoUri} alt="" className="size-10 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="grid size-10 place-items-center rounded-full bg-bg-3 text-sm font-bold text-text-2">{review.authorName.slice(0, 1)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">{review.authorName}</p>
                    <p className="mt-0.5 text-sm text-yellow-500">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                  </div>
                  {review.googleMapsUri && (
                    <a href={review.googleMapsUri} target="_blank" rel="noopener noreferrer" aria-label="Open review on Google" className="text-text-3 hover:text-accent">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </div>
                {review.text && <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-text-2">{review.text}</p>}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-hairline pt-4">
                  {(["landing", "testimonials"] as const).map((placement) => {
                    const active = review.placements?.includes(placement) ?? false;
                    return (
                      <button
                        key={placement}
                        type="button"
                        disabled={savingGoogleId !== null}
                        aria-pressed={active}
                        onClick={() => toggleGooglePlacement(review, placement)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active ? "border-accent bg-accent/10 text-accent" : "border-hairline-strong text-text-2 hover:text-text"}`}
                      >
                        {active ? "Shown on" : "Show on"} {placement === "landing" ? "landing page" : "testimonials"}
                      </button>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
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
