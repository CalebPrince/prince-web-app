import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import SocialDraftsClient from "./SocialDraftsClient";

export const metadata: Metadata = {
  title: "Social Drafts — Admin",
};

export default async function SocialDraftsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // Fetch initial social drafts SSR
  const initialDrafts = await api.adminSocialDrafts(cookieHeader).catch(() => []);

  return (
    <div className="space-y-8">
      <SocialDraftsClient initialDrafts={initialDrafts} />
    </div>
  );
}
