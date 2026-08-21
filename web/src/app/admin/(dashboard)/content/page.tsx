import { Metadata } from "next";
import { cookies } from "next/headers";
import { adminApi } from "@/lib/api";
import ContentClient from "./ContentClient";

export const metadata: Metadata = {
  title: "Site Content — Admin",
};

export default async function ContentPage() {
  const cookieHeader = (await cookies()).toString();

  // Deliberately NOT ssrAdminGet: its {} fallback made a failed fetch
  // indistinguishable from genuinely empty content, rendering a normal-looking
  // form with every field blank. Combined with a save that posted all of them,
  // that was one click away from wiping every Site Content value. A read
  // failure has to reach the UI, so the page can say so and refuse to save.
  let settings: Record<string, string> = {};
  let loadFailed = false;
  try {
    settings = await adminApi.get<Record<string, string>>(
      "/api/v1/admin/settings",
      cookieHeader
    );
  } catch {
    loadFailed = true;
  }

  return <ContentClient initialSettings={settings} loadFailed={loadFailed} />;
}
