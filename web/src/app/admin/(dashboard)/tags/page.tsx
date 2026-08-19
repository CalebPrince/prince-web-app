import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import TagsClient, { AdminTag } from "./TagsClient";

export const metadata: Metadata = {
  title: "Tags — Admin",
};

export default async function TagsPage() {
  const cookieHeader = (await cookies()).toString();
  const initialTags = await ssrAdminList<AdminTag>("/api/v1/admin/tags", cookieHeader);

  return <TagsClient initialTags={initialTags} />;
}
