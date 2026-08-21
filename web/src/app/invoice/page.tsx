"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { api, type SiteContent } from "@/lib/api";

export default function InvoicePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; desc: string } | null>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [siteContent, setSiteContent] = useState<SiteContent>({});

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setError({ title: "Missing invoice link", desc: "This invoice URL is incomplete." });
      setLoading(false);
      return;
    }

    Promise.all([
      api.getInvoice(token),
      api.content().catch(() => ({} as SiteContent))
    ])
      .then(([inv, content]) => {
        setInvoice(inv);
        setSiteContent(content);
        setLoading(false);
      })
      .catch(() => {
        setError({ title: "Invoice not found", desc: "This link may be incorrect or the invoice is no longer available." });
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <section className="mx-auto max-w-[760px] px-6 pt-32 pb-24 md:pt-48">
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-accent" />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-[760px] px-6 pt-32 pb-24 md:pt-48">
        <div className="rounded-[var(--radius)] border border-hairline bg-bg-2/50 p-8 text-center glass">
          <h4 className="mb-2 text-xl font-bold">{error.title}</h4>
          <p className="text-text-2">{error.desc}</p>
        </div>
      </section>
    );
  }

  const isPaid = invoice.status === "paid";
  const isVoid = invoice.status === "void";
  const isDraft = invoice.status === "draft";
  const businessEmail = (siteContent.social_email || "").trim();

  const money = (subunits: number, currency: string) => 
    `${currency} ${(subunits / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <section className="mx-auto max-w-[760px] px-6 pt-32 pb-24 md:pt-40">
      <style>{`
        @media print {
          body { background: #fff !important; color: #000 !important; }
          .site-nav, .invoice-actions, .skip-link { display: none !important; }
          .section { padding: 0 !important; }
          .invoice-card { border: none; padding: 0; box-shadow: none !important; background: #fff !important; }
          .invoice-card, .invoice-card * { color: #000 !important; }
          .invoice-paid-stamp { color: #16a34a !important; }
          a { text-decoration: none !important; }
        }
      `}</style>
      
      <div className="invoice-actions mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="btn-brand-outline rounded-full border border-hairline-strong bg-transparent px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent" onClick={() => window.print()}>
          Download PDF / Print
        </button>
        {invoice.payment_url && !isPaid && !isVoid && (
          <a href={invoice.payment_url} className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-light">
            Pay Now {money(invoice.total, invoice.currency)}
          </a>
        )}
      </div>

      <div className="invoice-card rounded-[24px] border border-hairline bg-card p-6 md:p-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold tracking-tight">
              <span className="text-accent">P</span>rince Caleb<span className="text-accent">.</span>
            </div>
            <div className="mt-2 text-sm text-text-2">
              AI Voice Agents · Chatbots · Automation · Web & Mobile<br />
              princecaleb.dev{businessEmail ? ` · ${businessEmail}` : ""}
            </div>
          </div>
          <div className="text-right">
            <h4 className="text-lg font-bold">Invoice {invoice.invoice_number}</h4>
            {isPaid && (
              <div className="invoice-paid-stamp mt-3 inline-block -rotate-6 rounded-lg border-4 border-green-600 px-4 py-1.5 text-lg font-extrabold uppercase tracking-widest text-green-600">Paid</div>
            )}
            {isVoid && (
              <div className="invoice-paid-stamp mt-3 inline-block -rotate-6 rounded-lg border-4 border-red-800 px-4 py-1.5 text-lg font-extrabold uppercase tracking-widest text-red-800">Void</div>
            )}
            {isDraft && (
              <div className="invoice-paid-stamp mt-3 inline-block -rotate-6 rounded-lg border-4 border-slate-500 px-4 py-1.5 text-lg font-extrabold uppercase tracking-widest text-slate-500">Draft preview</div>
            )}
          </div>
        </div>

        <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:justify-between">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Billed to</div>
            <div className="font-medium text-text">{invoice.client_name}</div>
            <div className="text-sm text-text-2">{invoice.client_email}</div>
          </div>
          <div className="sm:text-right">
            <div className="text-sm"><span className="text-text-2">Issue date:</span> {invoice.issue_date}</div>
            {invoice.due_date && <div className="text-sm"><span className="text-text-2">Due date:</span> {invoice.due_date}</div>}
            {isPaid && invoice.paid_at && <div className="text-sm"><span className="text-text-2">Paid on:</span> {String(invoice.paid_at).slice(0, 10)}</div>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs uppercase tracking-widest text-muted">
                <th className="py-3 pr-4 font-semibold">Description</th>
                <th className="py-3 px-4 text-right font-semibold">Qty</th>
                <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">Unit price</th>
                <th className="py-3 pl-4 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(invoice.items || []).map((item: any, i: number) => {
                const lineTotal = Math.round(item.quantity * item.unit_amount);
                return (
                  <tr key={i}>
                    <td className="py-4 pr-4 text-text">{item.description}</td>
                    <td className="py-4 px-4 text-right text-text-2">{Number(item.quantity) === 1 ? "1" : Number(item.quantity).toLocaleString()}</td>
                    <td className="py-4 px-4 text-right text-text-2 whitespace-nowrap">{money(item.unit_amount, invoice.currency)}</td>
                    <td className="py-4 pl-4 text-right text-text font-medium whitespace-nowrap">{money(lineTotal, invoice.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="pt-6 pr-4 text-right font-bold text-text">Total</td>
                <td className="pt-6 pl-4 text-right text-lg font-bold text-text whitespace-nowrap">{money(invoice.total, invoice.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {invoice.notes && (
          <div className="mt-6 text-sm text-text-2">
            <span className="font-semibold text-text">Notes:</span> {invoice.notes}
          </div>
        )}

        <div className="mt-8 text-sm text-text-2">
          {isPaid ? "This invoice has been paid in full and serves as your receipt." : 
           isDraft ? "This is a draft preview. Payment becomes available after the invoice is sent." : 
           isVoid ? "This invoice has been voided and can no longer be paid." : 
           "Payment can be made securely online via the Pay Now button above."}
          {" "}Thank you for your business.
        </div>
      </div>
    </section>
  );
}
