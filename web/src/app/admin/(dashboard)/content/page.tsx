import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import ContentClient from "./ContentClient";

export const metadata: Metadata = {
  title: "Site Content — Admin",
};

export default async function ContentPage() {
  const cookieHeader = (await cookies()).toString();
  const settings = await ssrAdminGet<Record<string, string>>(
    "/api/v1/admin/settings",
    cookieHeader,
    {}
  );

  return <ContentClient initialSettings={settings} />;
}
