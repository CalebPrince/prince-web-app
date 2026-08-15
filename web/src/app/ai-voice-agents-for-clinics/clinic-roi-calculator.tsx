"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

// Ported from public/js/clinic-roi.js's core math. The site-wide currency
// switcher (window.SiteCurrency) isn't ported to web/ yet, so this stays
// fixed to GHS — matching the original's default state, not a regression
// since no other Next.js page has that switcher wired up either.
function money(value: number) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS", maximumFractionDigits: 0 }).format(value);
}

export function ClinicRoiCalculator() {
  const [calls, setCalls] = React.useState(30);
  const [missed, setMissed] = React.useState(20);
  const [book, setBook] = React.useState(35);
  const [value, setValue] = React.useState(250);
  const [days, setDays] = React.useState(26);

  const missedCalls = calls * days * (missed / 100);
  const bookings = missedCalls * (book / 100);
  const total = bookings * value;

  return (
    <div className="mx-auto grid max-w-6xl gap-[clamp(2rem,8vw,8rem)] px-4 sm:px-6 lg:grid-cols-[1fr_minmax(20rem,0.72fr)] lg:items-center">
      <div>
        <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// Missed-call opportunity</p>
        <h2 className="mb-3 text-3xl font-bold md:text-4xl">What could one answered call be worth?</h2>
        <p className="text-ink-soft">Use your own operating assumptions. This estimates opportunity, not guaranteed revenue.</p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          <label className="grid gap-[0.55rem] text-[0.8rem] font-bold text-heading">
            Calls on a typical day
            <input
              type="number"
              min={0}
              max={1000}
              inputMode="numeric"
              value={calls}
              onChange={(e) => setCalls(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-[0.45rem] border border-line bg-bg px-[0.9rem] py-3 text-heading"
            />
          </label>
          <label className="grid gap-[0.55rem] text-[0.8rem] font-bold text-heading">
            <span className="flex items-baseline justify-between">
              Currently missed <output className="font-mono text-editorial-accent">{missed}%</output>
            </span>
            <input type="range" min={0} max={100} value={missed} onChange={(e) => setMissed(Number(e.target.value))} className="w-full accent-editorial-accent" />
          </label>
          <label className="grid gap-[0.55rem] text-[0.8rem] font-bold text-heading">
            <span className="flex items-baseline justify-between">
              Missed callers who would book <output className="font-mono text-editorial-accent">{book}%</output>
            </span>
            <input type="range" min={0} max={100} value={book} onChange={(e) => setBook(Number(e.target.value))} className="w-full accent-editorial-accent" />
          </label>
          <label className="grid gap-[0.55rem] text-[0.8rem] font-bold text-heading">
            Average appointment value (GHS)
            <input
              type="number"
              min={0}
              max={1000000}
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
              className="w-full rounded-[0.45rem] border border-line bg-bg px-[0.9rem] py-3 text-heading"
            />
          </label>
          <label className="grid gap-[0.55rem] text-[0.8rem] font-bold text-heading">
            Working days per month
            <input
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full rounded-[0.45rem] border border-line bg-bg px-[0.9rem] py-3 text-heading"
            />
          </label>
        </div>
      </div>

      <aside aria-live="polite" className="grid gap-[1.35rem] bg-heading p-[clamp(2rem,5vw,3.5rem)] text-bg shadow-lg">
        <span className="font-mono text-[0.7rem] font-bold tracking-[0.09em] uppercase opacity-65">Estimated monthly opportunity</span>
        <strong className="text-[clamp(2rem,5vw,3.75rem)] leading-[0.98] tracking-[-0.05em] text-bg">{money(total)}</strong>
        <div className="grid grid-cols-2 gap-4 border-y border-bg/18 py-[1.2rem]">
          <p className="text-[0.78rem] text-bg/68">
            <b className="block text-[1.35rem] text-bg">{Math.round(missedCalls).toLocaleString()}</b> missed calls
          </p>
          <p className="text-[0.78rem] text-bg/68">
            <b className="block text-[1.35rem] text-bg">{Math.round(bookings).toLocaleString()}</b> potential bookings
          </p>
        </div>
        <small className="text-bg/58 leading-[1.55]">
          Illustrative estimate based entirely on the values you entered. It does not predict actual performance.
        </small>
        <Button
          variant="brand"
          size="pill"
          className="justify-self-start border-bg bg-bg text-heading hover:bg-transparent hover:text-bg"
          nativeButton={false}
          render={<a href="/book.html?utm_source=clinic_roi&utm_medium=niche_landing&utm_campaign=clinic_voice_agent" />}
        >
          Review one call flow
        </Button>
      </aside>
    </div>
  );
}
