"use client";

import { useState } from "react";
import { IntakeCta } from "@/components/IntakeCta";

// Ported from public/js/clinic-roi.js's core math. The site-wide currency
// switcher (window.SiteCurrency) isn't part of this app, so this stays
// fixed to GHS - matching the legacy page's default state.
function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(
    value,
  );
}

export function ClinicRoiCalculator() {
  const [calls, setCalls] = useState(30);
  const [missed, setMissed] = useState(20);
  const [book, setBook] = useState(35);
  const [value, setValue] = useState(250);
  const [days, setDays] = useState(26);

  const missedCalls = calls * days * (missed / 100);
  const bookings = missedCalls * (book / 100);
  const total = bookings * value;

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-text">
            Calls on a typical day
            <input
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              value={calls}
              onChange={(e) => setCalls(Math.max(0, Number(e.target.value) || 0))}
              className="mt-2 h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 text-text focus:border-accent/60 focus:outline-none"
            />
          </label>
          <label className="block text-sm font-semibold text-text">
            <span className="flex items-baseline justify-between">
              Currently missed <output className="font-mono text-accent">{missed}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={missed}
              onChange={(e) => setMissed(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </label>
          <label className="block text-sm font-semibold text-text">
            <span className="flex items-baseline justify-between">
              Missed callers who&rsquo;d book <output className="font-mono text-accent">{book}%</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={book}
              onChange={(e) => setBook(Number(e.target.value))}
              className="mt-3 w-full accent-accent"
            />
          </label>
          <label className="block text-sm font-semibold text-text">
            Average appointment value (GHS)
            <input
              type="number"
              min={0}
              max={1000000}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
              className="mt-2 h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 text-text focus:border-accent/60 focus:outline-none"
            />
          </label>
          <label className="block text-sm font-semibold text-text">
            Working days per month
            <input
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-2 h-12 w-full rounded-[var(--radius)] border border-hairline-strong bg-bg px-4 text-text focus:border-accent/60 focus:outline-none"
            />
          </label>
        </div>
      </div>

      <aside
        aria-live="polite"
        className="flex flex-col gap-5 rounded-[var(--radius)] border border-accent/30 bg-accent/[0.06] p-8 lg:col-span-5"
      >
        <span className="label text-accent">Estimated monthly opportunity</span>
        <strong className="text-[clamp(2rem,4vw,3rem)] font-extrabold leading-none tracking-[-0.03em] text-text">
          {money(total)}
        </strong>
        <div className="grid grid-cols-2 gap-4 border-y border-hairline py-5">
          <p className="text-sm text-text-2">
            <b className="block text-xl text-text">{Math.round(missedCalls).toLocaleString()}</b> missed calls
          </p>
          <p className="text-sm text-text-2">
            <b className="block text-xl text-text">{Math.round(bookings).toLocaleString()}</b> potential bookings
          </p>
        </div>
        <small className="text-sm leading-relaxed text-muted">
          Illustrative estimate based entirely on the values you entered. It does not predict actual
          performance.
        </small>
        <IntakeCta
          kind="booking"
          openHref="/book?utm_source=clinic_roi&utm_medium=niche_landing&utm_campaign=clinic_voice_agent"
          arrow={false}
          className="justify-self-start"
        >
          Review one call flow
        </IntakeCta>
      </aside>
    </div>
  );
}
