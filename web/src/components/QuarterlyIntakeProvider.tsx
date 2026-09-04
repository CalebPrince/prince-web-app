"use client";

// One client-side fetch of the quarterly intake status, shared with every
// IntakeCta on the page through context so a section with three CTAs does not
// make three /api/v1/content calls. Server-rendered pages (/request, /book)
// resolve the status directly instead and do not depend on this.

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { resolveQuarterlyIntake, type QuarterlyIntake } from "@/lib/quarterly";

const QuarterlyIntakeContext = createContext<QuarterlyIntake | null>(null);

export function QuarterlyIntakeProvider({ children }: { children: React.ReactNode }) {
  const [intake, setIntake] = useState<QuarterlyIntake | null>(null);

  useEffect(() => {
    let active = true;
    api
      .content()
      .then((content) => active && setIntake(resolveQuarterlyIntake(content)))
      .catch(() => active && setIntake(resolveQuarterlyIntake(null)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <QuarterlyIntakeContext.Provider value={intake}>{children}</QuarterlyIntakeContext.Provider>
  );
}

/** `null` until the status resolves (one tick after mount). Call sites treat
 *  `null` as open — the CTA shows its normal label and only re-labels once a
 *  genuine "closed" is known. */
export function useQuarterlyIntake(): QuarterlyIntake | null {
  return useContext(QuarterlyIntakeContext);
}
