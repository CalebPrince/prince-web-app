import { redirect } from "next/navigation";

/** Analytics was merged into Reports; this keeps old links and bookmarks working,
 *  matching what the legacy /admin/analytics.html redirect did. */
export default function AnalyticsPage() {
  redirect("/admin/reports");
}
