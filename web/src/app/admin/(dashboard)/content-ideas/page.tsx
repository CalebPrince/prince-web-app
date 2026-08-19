import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import ContentIdeasClient from "./ContentIdeasClient";

export const metadata: Metadata = {
  title: "Content Ideas — Admin",
};

export default async function ContentIdeasPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // Fetch initial content ideas SSR
  const data = await api.adminContentIdeas(cookieHeader).catch(() => ({ ideas: [] }));

  return (
    <div className="space-y-8">
      <ContentIdeasClient initialIdeas={data.ideas} />
    </div>
  );
}
