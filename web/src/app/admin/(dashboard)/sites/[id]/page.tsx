import { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ssrAdminGet } from "@/lib/api";
import { Site } from "../SitesClient";
import SiteDetailClient from "./SiteDetailClient";

export const metadata: Metadata = {
  title: "Site — Admin",
};

export default async function SiteDetailPage({ params }: PageProps<"/admin/sites/[id]">) {
  const { id } = await params;
  const cookieHeader = (await cookies()).toString();
  const site = await ssrAdminGet<Site | null>(`/api/v1/admin/sites/${id}`, cookieHeader, null);

  if (!site) notFound();

  return <SiteDetailClient site={site} />;
}
