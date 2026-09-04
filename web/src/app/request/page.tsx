import { api } from "@/lib/api";
import { resolveQuarterlyIntake } from "@/lib/quarterly";
import { IntakeClosedPanel } from "@/components/IntakeClosedPanel";
import { RequestForm } from "./RequestForm";

// Rendered per request (never with `export const revalidate`) so the intake
// gate reflects the current Site Content and cannot be served from a stale
// static shell during an FTP deploy — the same reasoning as the homepage.
export const dynamic = "force-dynamic";

export default async function RequestPage() {
  const content = await api.content().catch(() => null);
  const intake = resolveQuarterlyIntake(content);

  if (!intake.isOpen) {
    return (
      <IntakeClosedPanel kind="project" quarter={intake.quarter} nextOpening={intake.nextOpening} />
    );
  }

  return <RequestForm />;
}
