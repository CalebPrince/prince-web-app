import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import ProposalsClient, { Proposal, QuoteRequest, ProposalDraft } from "./ProposalsClient";

export const metadata: Metadata = {
  title: "Proposals — Admin",
};

export default async function ProposalsPage() {
  const cookieHeader = (await cookies()).toString();

  const [proposals, quoteRequests, drafts] = await Promise.all([
    ssrAdminList<Proposal>("/api/v1/admin/proposals", cookieHeader),
    ssrAdminList<QuoteRequest>("/api/v1/admin/proposals/quote-requests", cookieHeader),
    // The auto-draft panel is a convenience, not the primary flow.
    ssrAdminList<ProposalDraft>("/api/v1/admin/proposal-drafts", cookieHeader),
  ]);

  // The client reads ?inquiry_id=, ?client_name= and ?client_email= so other
  // pages can deep-link straight into a prefilled new proposal.
  return (
    <Suspense fallback={null}>
      <ProposalsClient
        initialProposals={proposals}
        quoteRequests={quoteRequests}
        initialDrafts={drafts}
      />
    </Suspense>
  );
}
