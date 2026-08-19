"use client";

import { useState, useEffect } from "react";
import { Check, Star } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { SectionLabel } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function TestimonialPage() {
  const [token, setToken] = useState("");
  const [validToken, setValidToken] = useState<boolean | null>(null);
  
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [quote, setQuote] = useState("");
  
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setValidToken(false);
      return;
    }
    setToken(t);
    
    api.getTestimonialToken(t)
      .then(info => {
        if (info.client_name) {
          setName(info.client_name);
        }
        setValidToken(true);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : "It may have already been used, or the link is incorrect.");
        setValidToken(false);
      });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!rating) {
      setError("Please choose a rating.");
      return;
    }

    setSubmitting(true);
    try {
      await api.submitTestimonial(token, {
        client_name: name,
        rating,
        quote,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/4 top-0 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-accent/15 blur-[150px] [animation:glowpulse_18s_ease-in-out_infinite]" />
        </div>
        <div className="mx-auto max-w-[1400px] px-6 pt-36 pb-16 text-center md:px-10 md:pt-48 md:pb-20">
          <Reveal>
            <SectionLabel>Thank you</SectionLabel>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-8 text-[clamp(2.4rem,6.5vw,5.5rem)] font-extrabold leading-[0.96] tracking-[-0.03em]">
              Mind leaving a <span className="text-accent">quick review?</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-text-2 md:text-xl">
              It only takes a minute, and it really helps future clients know what to expect.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-6 pb-24 md:px-10 md:pb-32">
        <Reveal>
          <div className="mx-auto max-w-xl rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-6 md:p-10">
            {validToken === null ? (
              <div className="py-10 text-center animate-pulse text-muted">Loading...</div>
            ) : !validToken ? (
              <div className="py-8 text-center animate-in fade-in zoom-in duration-500">
                <h3 className="mb-2 text-2xl font-bold tracking-tight">This link isn't valid</h3>
                <p className="text-text-2">{error || "It may have already been used, or the link is incorrect."}</p>
              </div>
            ) : sent ? (
              <div className="flex flex-col items-center py-8 text-center animate-in fade-in zoom-in duration-500">
                <span className="grid size-14 place-items-center rounded-full bg-accent text-on-accent">
                  <Check className="size-7" />
                </span>
                <h3 className="mt-6 text-2xl font-bold tracking-tight">Thank you!</h3>
                <p className="mt-3 text-text-2">Your review has been sent to Prince and will appear on the site once approved.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div>
                  <label htmlFor="name" className="label mb-2 block text-muted">Your name</label>
                  <input
                    id="name"
                    required
                    maxLength={255}
                    placeholder="Your full name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-13 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="label mb-2 block text-muted">Rating</label>
                  <div className="flex gap-2" onMouseLeave={() => setHoverRating(0)}>
                    {[1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        type="button"
                        aria-label={`${v} star${v > 1 ? 's' : ''}`}
                        className="p-1 transition-colors hover:scale-110 active:scale-95"
                        onMouseEnter={() => setHoverRating(v)}
                        onClick={() => setRating(v)}
                      >
                        <Star
                          className="size-8 transition-colors"
                          fill={(hoverRating || rating) >= v ? "var(--accent)" : "transparent"}
                          stroke={(hoverRating || rating) >= v ? "var(--accent)" : "currentColor"}
                          strokeWidth={(hoverRating || rating) >= v ? 0 : 1}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="quote" className="label mb-2 block text-muted">Your review</label>
                  <textarea
                    id="quote"
                    required
                    rows={5}
                    maxLength={2000}
                    placeholder="What was it like working together? What stood out?"
                    value={quote}
                    onChange={e => setQuote(e.target.value)}
                    className="h-auto w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-4 py-3.5 text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none"
                  />
                </div>

                {error && <p className="text-sm text-red-400 p-4 border border-red-900/50 rounded bg-red-900/10">{error}</p>}

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting ? "Submitting…" : "Submit review"}
                </Button>
              </form>
            )}
          </div>
        </Reveal>
      </section>
    </>
  );
}
