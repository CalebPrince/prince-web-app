"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, ExternalLink } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function ProposalPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; desc: string } | null>(null);
  
  const [proposal, setProposal] = useState<any>(null);
  
  const [acceptName, setAcceptName] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setError({ title: "Missing proposal link", desc: "This proposal URL is incomplete." });
      setLoading(false);
      return;
    }
    setToken(t);

    api.getProposal(t)
      .then(p => {
        setProposal(p);
        setAcceptName(p.client_name || "");
        setLoading(false);
      })
      .catch(err => {
        setError({ title: "Proposal not found", desc: err instanceof Error ? err.message : "This proposal link may be invalid." });
        setLoading(false);
      });
  }, []);

  const formatAmount = (subunits: number, currency: string) => {
    return `${currency} ${(Number(subunits || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  };

  const paragraphHtml = (value: string) => {
    return (value || "").split(/\n\s*\n/).map((p, i) => (
      <p key={i} className="mb-4 text-text-2">
        {p.split('\n').map((line, j) => (
          <span key={j}>{line}<br /></span>
        ))}
      </p>
    ));
  };

  const onAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.acceptProposal(token, { accepted_by_name: acceptName });
      window.location.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not accept proposal.");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-[920px] px-6 pt-32 pb-24 md:pt-48">
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-accent" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-[920px] px-6 pt-32 pb-24 md:pt-48">
        <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 text-center animate-in fade-in zoom-in duration-500 glass">
          <h4 className="mb-2 text-xl font-bold">{error.title}</h4>
          <p className="text-text-2">{error.desc}</p>
        </div>
      </section>
    );
  }

  const accepted = proposal.status === "accepted";
  const milestones = proposal.milestones || [];

  return (
    <section className="mx-auto max-w-[920px] px-6 pt-32 pb-24 md:pt-40">
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .site-nav, .skip-link, #accept-proposal-form, .btn-brand, .btn-brand-outline { display: none !important; }
          .section { padding: 0 !important; }
          .contact-card { border: none; padding: 0 0 1.5rem; box-shadow: none !important; background: #fff !important; }
          .contact-card, .contact-card *:not(.status-pill) { color: #000 !important; }
          .contact-card [style*="background"] { background: #fff !important; border: 1px solid #ddd; }
          a { text-decoration: none !important; }
        }
      `}</style>
      
      <div className="contact-card mb-6 rounded-[24px] border border-hairline bg-card p-6 md:p-10">
        <div className="mb-8 flex flex-col justify-between gap-6 md:flex-row">
          <div>
            <p className="eyebrow mb-3 uppercase tracking-widest text-accent">Project proposal</p>
            <h1 className="mb-2 text-4xl font-extrabold tracking-tight md:text-5xl">{proposal.title}</h1>
            <p className="text-text-2">Prepared for {proposal.client_name}</p>
          </div>
          <div className="md:text-right">
            <span className={`status-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${accepted ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
              {proposal.status}
            </span>
            <div className="mt-3 text-3xl font-bold tracking-tight text-accent">{formatAmount(proposal.total_amount, proposal.currency)}</div>
          </div>
        </div>

        {proposal.mockup_image_url && (
          <div className="mb-8">
            <img src={proposal.mockup_image_url} alt={`Concept mockup for ${proposal.title}`} className="w-full rounded-xl border border-hairline" />
            <p className="mt-3 text-sm text-text-2">A concept image to give a sense of direction, not a screenshot of the finished build.</p>
          </div>
        )}

        <h2 className="mb-4 text-xl font-bold">Scope</h2>
        <div className="prose-custom max-w-none">
          {paragraphHtml(proposal.scope)}
        </div>

        {proposal.timeline && (
          <>
            <h2 className="mt-8 mb-4 text-xl font-bold">Timeline</h2>
            <p className="text-text-2">{proposal.timeline}</p>
          </>
        )}

        {proposal.terms && (
          <>
            <h2 className="mt-8 mb-4 text-xl font-bold">Terms</h2>
            <div className="prose-custom max-w-none">
              {paragraphHtml(proposal.terms)}
            </div>
          </>
        )}
      </div>

      <div className="contact-card mb-6 rounded-[24px] border border-hairline bg-card p-6 md:p-10">
        <h2 className="mb-6 text-xl font-bold">Payment milestones</h2>
        <div className="flex flex-col gap-4">
          {milestones.map((m: any, i: number) => (
            <div key={i} className="flex flex-col justify-between gap-4 rounded-xl bg-bg-soft p-5 md:flex-row md:items-center">
              <div>
                <div className="font-semibold text-text">{m.title}</div>
                {m.due_note && <div className="mt-1 text-sm text-text-2">{m.due_note}</div>}
                <div className="mt-2 text-sm font-medium text-accent">{formatAmount(m.amount, m.currency)}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`status-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${m.payment_status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  {m.payment_status || 'pending'}
                </span>
                {accepted && m.payment_status !== 'paid' && m.payment_url && (
                  <a href={m.payment_url} className="tilt-3d tilt-glow rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-light">
                    Pay now
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="contact-card rounded-[24px] border border-hairline bg-card p-6 text-center md:p-10">
        <h2 className="mb-3 text-xl font-bold">{accepted ? "Proposal accepted" : "Ready to move forward?"}</h2>
        <p className="mb-6 text-text-2">
          {accepted 
            ? `Accepted by ${proposal.accepted_by_name || proposal.client_name} on ${new Date(proposal.accepted_at).toLocaleString()}. You can pay any pending milestone above.`
            : "Review the scope, timeline, and terms above, then confirm below. The payment buttons will unlock once accepted."
          }
        </p>

        {!accepted && (
          <p className="mb-8 text-sm text-text-2">
            <Link href="/builder-os" className="inline-flex items-center gap-1 transition-colors hover:text-text">
              Curious what a finished system like this looks like running live? Inspect Builder OS <ExternalLink className="size-3" />
            </Link>
          </p>
        )}

        {submitError && (
          <div className="mx-auto mb-6 max-w-[420px] rounded border border-red-900/50 bg-red-900/10 p-3 text-sm text-red-400">
            {submitError}
          </div>
        )}

        {accepted ? (
          <Button asChild variant="outline">
            <Link href="/contact">Contact me</Link>
          </Button>
        ) : (
          <form id="accept-proposal-form" onSubmit={onAccept} className="mx-auto max-w-[420px] text-left">
            <div className="mb-5">
              <label htmlFor="accept-name" className="label mb-2 block text-muted">Type your full name to confirm</label>
              <input 
                id="accept-name" 
                required 
                value={acceptName}
                onChange={e => setAcceptName(e.target.value)}
                className="h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none" 
              />
            </div>
            <div className="mb-6 flex items-start gap-3">
              <input 
                type="checkbox" 
                id="accept-terms-check" 
                required 
                checked={acceptTerms}
                onChange={e => setAcceptTerms(e.target.checked)}
                className="mt-1 size-4 rounded border-hairline-strong bg-bg/60 text-accent focus:ring-accent/60 glass" 
              />
              <label htmlFor="accept-terms-check" className="text-sm text-text-2">
                I have reviewed and agree to the scope, timeline, and terms above.
              </label>
            </div>
            <Button type="submit" disabled={submitting || !acceptTerms} className="w-full h-12">
              {submitting ? "Accepting..." : "Accept proposal"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
