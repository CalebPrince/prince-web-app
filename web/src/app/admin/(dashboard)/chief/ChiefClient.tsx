"use client";

import { PageHeader } from "@/components/admin/ui";
import { ChiefReport, ChiefBrief, ChiefDashboard } from "@/components/admin/ChiefReport";

export type { ChiefBrief, ChiefDashboard };

export default function ChiefClient({
  initialBrief,
  initialDashboard,
}: {
  initialBrief: ChiefBrief | null;
  initialDashboard: ChiefDashboard;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title="What the team actually did."
        description="Chief reports verified agent output, what's waiting, and what needs your decision."
      />

      <ChiefReport initialBrief={initialBrief} initialDashboard={initialDashboard} />
    </div>
  );
}
