"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/**
 * The subscribe control on a Lisa pricing tier. A tier only becomes payable
 * once its monthly charge is set in Admin -> Lisa; without one there is no
 * figure to bill against, so the card falls back to whatever the page passes
 * as `fallback` (a booking link) rather than offering a checkout that cannot
 * complete.
 *
 * Nothing is charged here. The form hands the details to the API, which sets
 * up the plan with Paystack and returns their hosted checkout page: card
 * details are only ever entered on Paystack's own page.
 */
export function LisaSubscribe({
  tier,
  tierName,
  price,
  featured,
}: {
  tier: 1 | 2 | 3;
  tierName: string;
  price: string;
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      const { checkout_url } = await api.startLisaSubscription({
        tier,
        name: name.trim(),
        email: email.trim(),
        tos_accepted: true,
      });
      // Paystack's hosted page takes it from here.
      window.location.href = checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the checkout. Please try again.");
      setSending(false);
    }
  };

  if (!open) {
    return (
      <Button
        variant={featured ? "primary" : "secondary"}
        className="mt-8 w-full"
        onClick={() => setOpen(true)}
      >
        Subscribe
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-3">
      <p className="text-sm font-semibold">
        {tierName}, {price} a month
      </p>

      <label className="block">
        <span className="label mb-1.5 block text-muted">Name</span>
        <input
          required
          maxLength={255}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="block">
        <span className="label mb-1.5 block text-muted">Email</span>
        <input
          required
          type="email"
          maxLength={255}
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputCls}
        />
      </label>

      <label className="flex items-start gap-2.5 text-xs leading-relaxed text-text-2">
        <input
          type="checkbox"
          required
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span>
          I understand this starts a monthly subscription that renews until I cancel, and I accept
          the terms.
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded border border-red-900/50 bg-red-900/10 p-2.5 text-xs text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" variant={featured ? "primary" : "secondary"} className="w-full" disabled={sending || !accepted}>
        {sending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Opening checkout
          </>
        ) : (
          <>
            Continue to payment
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </Button>

      <button
        type="button"
        onClick={() => setOpen(false)}
        className="min-h-11 w-full text-xs text-muted hover:text-text"
      >
        Cancel
      </button>
    </form>
  );
}

const inputCls =
  "h-11 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg/60 px-3 text-sm text-text placeholder:text-muted transition-colors focus:border-accent/60 focus:outline-none";
