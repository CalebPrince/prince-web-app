import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import ContentStudioClient from "./ContentStudioClient";

export const metadata: Metadata = {
  title: "Content Studio — Admin",
};

export default async function ContentStudioPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const initialItems = await api.adminContentStudio(cookieHeader).catch(() => []);

  return <ContentStudioClient initialItems={initialItems} />;
}
