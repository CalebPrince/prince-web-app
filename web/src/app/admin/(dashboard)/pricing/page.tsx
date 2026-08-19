import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing — Admin",
};

export default async function PricingPage() {
  const cookieHeader = (await cookies()).toString();
  const settings = await ssrAdminGet<Record<string, string>>(
    "/api/v1/admin/settings",
    cookieHeader,
    {}
  );

  return <PricingClient initialSettings={settings} />;
}
