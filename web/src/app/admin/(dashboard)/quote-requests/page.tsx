import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminList, Inquiry } from "@/lib/api";
import QuoteRequestsClient from "./QuoteRequestsClient";

export const metadata: Metadata = {
  title: "Quote Requests — Admin",
};

export default async function QuoteRequestsPage() {
  const cookieHeader = (await cookies()).toString();
  const initialRequests = await ssrAdminList<Inquiry>("/api/v1/admin/inquiries?type=project_request", cookieHeader);

  // The client reads ?open= to deep-link from the notification feed.
  return (
    <Suspense fallback={null}>
      <QuoteRequestsClient initialRequests={initialRequests} />
    </Suspense>
  );
}
