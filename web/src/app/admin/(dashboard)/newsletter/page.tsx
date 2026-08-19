import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import NewsletterClient, { Subscriber, NewsletterDraft } from "./NewsletterClient";

export const metadata: Metadata = {
  title: "Newsletter — Admin",
};

export default async function NewsletterPage() {
  const cookieHeader = (await cookies()).toString();

  const [subscribers, drafts] = await Promise.all([
    ssrAdminList<Subscriber>("/api/v1/admin/newsletter", cookieHeader),
    ssrAdminList<NewsletterDraft>("/api/v1/admin/newsletter-drafts", cookieHeader),
  ]);

  return <NewsletterClient initialSubscribers={subscribers} initialDrafts={drafts} />;
}
