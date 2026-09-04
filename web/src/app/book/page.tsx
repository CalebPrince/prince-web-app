import { api } from "@/lib/api";
import { resolveQuarterlyIntake } from "@/lib/quarterly";
import { IntakeClosedPanel } from "@/components/IntakeClosedPanel";
import { BookForm } from "./BookForm";

// Per-request so the intake gate always reflects current Site Content — see
// the note on the homepage and /request.
export const dynamic = "force-dynamic";

export default async function BookPage() {
  const content = await api.content().catch(() => null);
  const intake = resolveQuarterlyIntake(content);

  if (!intake.isOpen) {
    return (
      <IntakeClosedPanel kind="booking" quarter={intake.quarter} nextOpening={intake.nextOpening} />
    );
  }

  return <BookForm />;
}
