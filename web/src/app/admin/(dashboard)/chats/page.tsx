import { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { ssrAdminGet, ssrAdminList } from "@/lib/api";
import ChatsClient, { ChatLead, ChatStats } from "./ChatsClient";

export const metadata: Metadata = {
  title: "Chat Leads — Admin",
};

export default async function ChatsPage() {
  const cookieHeader = (await cookies()).toString();

  const [initialChats, initialStats] = await Promise.all([
    ssrAdminList<ChatLead>("/api/v1/admin/chats", cookieHeader),
    // Stats are supplementary — a failure must not blank the conversation list.
    ssrAdminGet<ChatStats | null>("/api/v1/admin/chats/stats", cookieHeader, null),
  ]);

  // ChatsClient reads ?open= to deep-link from the notification feed, so it
  // needs a Suspense boundary around useSearchParams.
  return (
    <Suspense fallback={null}>
      <ChatsClient initialChats={initialChats} initialStats={initialStats} />
    </Suspense>
  );
}
