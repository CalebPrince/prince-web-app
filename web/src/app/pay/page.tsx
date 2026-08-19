"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";
import { api, type PaymentConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    PaystackPop: {
      setup: (config: any) => { openIframe: () => void };
    };
  }
}

export default function PayPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; desc: string } | null>(null);
  
  const [link, setLink] = useState<any>(null);
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  
  const [inFlight, setInFlight] = useState(false);
  const [btnText, setBtnText] = useState("Pay Now");
  const [msg, setMsg] = useState<{ type: 'info' | 'success' | 'warning' | 'danger', text: string } | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setError({ title: "Missing payment link", desc: "This payment URL is incomplete." });
      setLoading(false);
      return;
    }
    setToken(t);

    Promise.all([
      api.getPaymentLink(t),
      api.paymentConfig()
    ])
      .then(([l, c]) => {
        if (l.status === "paid") {
          setError({ title: "Already paid", desc: "This invoice has already been settled. Thank you." });
        } else if (!c.public_key) {
          setError({ title: "Payments are temporarily unavailable", desc: "Please try again later or contact me directly." });
        } else {
          setLink(l);
          setConfig(c);
        }
        setLoading(false);
      })
      .catch(() => {
        setError({ title: "Payment link not found", desc: "This link may have expired or the token is incorrect." });
        setLoading(false);
      });
  }, []);

  const currencyDisplay = (code: string) => {
    const normalized = (code || "").toUpperCase();
    return normalized === "USD" ? "$" : normalized;
  };

  const verifyWithRetry = async (reference: string) => {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await api.verifyPayment(reference);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  };

  const handlePay = async () => {
    if (inFlight || !token || !config?.public_key) return;
    
    setInFlight(true);
    setMsg(null);
    setBtnText("Preparing secure checkout...");

    try {
      const prep = await api.prepareInvoicePayment({ link_token: token });
      setMsg({ type: "info", text: "Secure checkout opened. Complete payment to continue." });

      const handler = window.PaystackPop.setup({
        key: config.public_key,
        email: prep.email,
        amount: prep.amount,
        currency: prep.currency,
        ref: prep.reference,
        callback: function (response: any) {
          setBtnText("Verifying payment...");
          (async () => {
            try {
              const result = await verifyWithRetry(response.reference);
              if (result.status === "success") {
                window.location.href = `/payment-success?source=payment-link&reference=${encodeURIComponent(response.reference)}`;
              } else {
                setMsg({ type: "warning", text: "Payment completed but confirmation is still pending. If you were charged, I will reconcile it shortly." });
                setBtnText("Try Again");
                setInFlight(false);
              }
            } catch (_) {
              setMsg({ type: "warning", text: "Verification is delayed. If you were charged, I will reconcile it shortly." });
              setBtnText("Try Again");
              setInFlight(false);
            }
          })();
        },
        onClose: function () {
          setMsg({ type: "info", text: "Checkout closed before completion. You can try again anytime." });
          setBtnText("Pay Now");
          setInFlight(false);
        },
      });
      handler.openIframe();
    } catch (err) {
      setMsg({ type: "danger", text: err instanceof Error ? err.message : "Something went wrong while preparing checkout." });
      setBtnText("Pay Now");
      setInFlight(false);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto max-w-[480px] px-6 pt-32 pb-24 md:pt-48">
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-accent" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-[480px] px-6 pt-32 pb-24 md:pt-48">
        <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 text-center animate-in fade-in zoom-in duration-500">
          <h4 className="mb-2 text-xl font-bold">{error.title}</h4>
          <p className="text-text-2">{error.desc}</p>
        </div>
      </section>
    );
  }

  const amountValue = (link.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2 });
  const currencyLabel = currencyDisplay(link.currency);
  const formattedAmount = currencyLabel === "$" ? `${currencyLabel}${amountValue}` : `${currencyLabel} ${amountValue}`;

  const alertClasses = {
    info: "text-blue-400 border-blue-900/50 bg-blue-900/10",
    success: "text-green-400 border-green-900/50 bg-green-900/10",
    warning: "text-yellow-400 border-yellow-900/50 bg-yellow-900/10",
    danger: "text-red-400 border-red-900/50 bg-red-900/10",
  };

  return (
    <>
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      <section className="mx-auto max-w-[480px] px-6 pt-32 pb-24 md:pt-48">
        <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h4 className="mb-1 text-xl font-bold">{link.description || "Payment"}</h4>
          <p className="mb-6 text-sm text-text-2">For {link.client_name || "Client"}</p>
          <div className="mb-6 text-[2.5rem] font-bold tracking-tight text-accent">{formattedAmount}</div>
          <p className="mb-8 text-sm text-text-2">You will be redirected to Paystack's secure checkout.</p>
          
          <Button onClick={handlePay} disabled={inFlight} className="w-full text-lg h-14">
            {btnText}
          </Button>

          {msg && (
            <div className={`mt-6 rounded border p-4 text-sm ${alertClasses[msg.type]}`}>
              {msg.text}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
