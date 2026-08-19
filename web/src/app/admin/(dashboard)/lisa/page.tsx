import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import LisaClient from "./LisaClient";

export const metadata: Metadata = {
  title: "Lisa — Admin",
};

export default async function LisaPage() {
  const cookieHeader = (await cookies()).toString();
  const settings = await ssrAdminGet<Record<string, string>>(
    "/api/v1/admin/settings",
    cookieHeader,
    {}
  );

  return <LisaClient initialSettings={settings} />;
}
