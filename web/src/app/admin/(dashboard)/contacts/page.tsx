import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import ContactsClient, { Contact, PipelineSummary } from "./ContactsClient";

export const metadata: Metadata = {
  title: "Contacts — Admin",
};

export default async function ContactsPage() {
  const cookieHeader = (await cookies()).toString();

  const [contacts, summary] = await Promise.all([
    ssrAdminList<Contact>("/api/v1/admin/contacts", cookieHeader),
    // The contact list works fine without the summary, so this stays non-fatal.
    ssrAdminGet<PipelineSummary | null>(
      "/api/v1/admin/contacts/pipeline-summary",
      cookieHeader,
      null
    ),
  ]);

  return <ContactsClient initialContacts={contacts} summary={summary} />;
}
