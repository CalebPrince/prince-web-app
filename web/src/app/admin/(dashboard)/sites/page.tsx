import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import SitesClient, { Site } from "./SitesClient";

export const metadata: Metadata = {
  title: "Sites — Admin",
};

export default async function SitesPage() {
  const cookieHeader = (await cookies()).toString();
  const sites = await ssrAdminList<Site>("/api/v1/admin/sites", cookieHeader);
  return <SitesClient initialSites={sites} />;
}
