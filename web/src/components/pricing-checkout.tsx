"use client";

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Ported from public/pricing.html's inline checkout script: same validation
// rules (full name needs 2+ parts, standard email shape, TOS required), same
// localStorage draft key so a visitor's name/email survive a reload, same
// Paystack inline.js flow (prepare -> open Paystack popup -> verify on
// callback -> redirect to /payment-success). The starter-tier button only
// ever appears once /api/v1/payments/config confirms a public key and
// tier-1 amount are actually configured — never assumed available.
const DRAFT_KEY = "starter_checkout_draft_v1";
const FULL_NAME_REGEX =
  /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][A-Za-zÀ-ÖØ-öø-ÿ]+)*(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['-][A-Za-zÀ-ÖØ-öø-ÿ]+)*)+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nameError(name: string) {
  if (!name) return "Please enter your full name.";
  if (!FULL_NAME_REGEX.test(name)) return "Please enter both your first and last name.";
  return "";
}
function emailError(email: string) {
  if (!email) return "Please enter your email address.";
  if (!EMAIL_REGEX.test(email)) return "Please enter a valid email address.";
  return "";
}

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

export function PricingCheckout() {
  const router = useRouter();
  const [config, setConfig] = React.useState<{ publicKey: string; amount: number; currency: string } | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [tos, setTos] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; email?: string; tos?: string }>({});
  const [banner, setBanner] = React.useState<{ type: "info" | "warning" | "danger"; text: string } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    api
      .paymentConfig()
      .then((cfg) => {
        if (cfg.public_key && cfg.tier_1_amount) {
          setConfig({ publicKey: cfg.public_key, amount: cfg.tier_1_amount, currency: (cfg.currency || "GHS").toUpperCase() });
        }
      })
      .catch(() => {});

    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      if (draft.name) setName(draft.name);
      if (draft.email) setEmail(draft.email);
      if (draft.tosAccepted) setTos(true);
    } catch {
      // no draft yet
    }
  }, []);

  function saveDraft(nextName: string, nextEmail: string, nextTos: boolean) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name: nextName, email: nextEmail, tosAccepted: nextTos }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !config) return;

    const nMsg = nameError(name.trim());
    const eMsg = emailError(email.trim());
    const tMsg = tos ? "" : "Please accept the Terms of Service to continue.";
    setErrors({ name: nMsg, email: eMsg, tos: tMsg });
    if (nMsg || eMsg || tMsg) return;

    setSubmitting(true);
    setBanner({ type: "info", text: "Preparing your secure checkout..." });
    try {
      const prep = await api.preparePayment({ tier: "starter", name: name.trim(), email: email.trim(), tos_accepted: true });
      saveDraft(name.trim(), email.trim(), true);

      if (!window.PaystackPop?.setup) {
        throw new Error("Secure checkout could not load. Please refresh and try again.");
      }

      const handler = window.PaystackPop.setup({
        key: config.publicKey,
        email: prep.email,
        amount: prep.amount,
        currency: prep.currency,
        ref: prep.reference,
        callback: (response) => {
          (async () => {
            try {
              const result = await api.verifyPayment(response.reference);
              if (result.status === "success") {
                router.push(`/payment-success?source=starter&reference=${encodeURIComponent(response.reference)}`);
              } else {
                setBanner({ type: "warning", text: "Payment completed but confirmation is still pending. If you were charged, I will reconcile it shortly." });
              }
            } catch {
              setBanner({ type: "warning", text: "Payment submitted, but verification is delayed. If you were charged, I will reconcile it shortly." });
            }
          })();
        },
        onClose: () => {
          setBanner({ type: "info", text: "Checkout closed. You can reopen it anytime from the pilot card." });
        },
      });

      handler.openIframe();
      setOpen(false);
      setBanner({ type: "info", text: "Secure checkout opened. Complete payment to confirm your pilot deposit." });
    } catch (err) {
      setBanner({ type: "danger", text: err instanceof Error ? err.message : "Something went wrong while preparing checkout." });
    } finally {
      setSubmitting(false);
    }
  }

  if (!config) return null;

  const amountLabel = config.currency === "USD" ? `$${config.amount.toLocaleString()}` : `${config.currency} ${config.amount.toLocaleString()}`;

  return (
    <>
      <Script src="https://js.paystack.co/v1/inline.js" strategy="afterInteractive" />
      <Button
        type="button"
        variant="brand"
        size="pill"
        className="mb-2 w-full"
        onClick={() => {
          setBanner(null);
          setErrors({});
          setOpen(true);
        }}
      >
        Pay deposit to start, {amountLabel}
      </Button>
      {banner && (
        <p
          className={
            banner.type === "danger"
              ? "mt-2 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text"
              : banner.type === "warning"
                ? "mt-2 rounded-lg bg-status-warn-bg px-3 py-2 text-sm text-status-warn-text"
                : "mt-2 rounded-lg bg-status-ok-bg px-3 py-2 text-sm text-status-ok-text"
          }
        >
          {banner.text}
        </p>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay deposit to start, AI Voice Agent Pilot</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} noValidate className="grid gap-4">
            <div className="grid gap-1.5">
              <label htmlFor="checkout-name" className="text-sm font-medium text-heading">
                Full name
              </label>
              <input
                id="checkout-name"
                type="text"
                required
                maxLength={255}
                placeholder="e.g. Ama Owusu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  saveDraft(name.trim(), email.trim(), tos);
                  setErrors((s) => ({ ...s, name: nameError(name.trim()) }));
                }}
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-editorial-accent aria-invalid:border-status-danger-border"
                aria-invalid={!!errors.name}
              />
              {errors.name && <span className="text-xs text-status-danger-text">{errors.name}</span>}
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="checkout-email" className="text-sm font-medium text-heading">
                Email
              </label>
              <input
                id="checkout-email"
                type="email"
                required
                maxLength={255}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => {
                  saveDraft(name.trim(), email.trim(), tos);
                  setErrors((s) => ({ ...s, email: emailError(email.trim()) }));
                }}
                className="rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-editorial-accent aria-invalid:border-status-danger-border"
                aria-invalid={!!errors.email}
              />
              {errors.email && <span className="text-xs text-status-danger-text">{errors.email}</span>}
            </div>
            <div className="grid gap-1.5">
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  required
                  checked={tos}
                  onChange={(e) => {
                    setTos(e.target.checked);
                    saveDraft(name.trim(), email.trim(), e.target.checked);
                    setErrors((s) => ({ ...s, tos: e.target.checked ? "" : s.tos }));
                  }}
                  className="mt-0.5 size-4 accent-[var(--editorial-accent)]"
                />
                <span>
                  I agree to the{" "}
                  <a href="/terms" target="_blank" rel="noopener" className="text-editorial-accent underline">
                    Terms of Service
                  </a>{" "}
                  and understand this is a non-refundable project deposit unless otherwise agreed in writing.
                </span>
              </label>
              {errors.tos && <span className="text-xs text-status-danger-text">{errors.tos}</span>}
            </div>
            <Button type="submit" variant="brand" size="pill" className="w-full" disabled={submitting}>
              {submitting ? "Preparing secure checkout..." : "Continue to payment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
