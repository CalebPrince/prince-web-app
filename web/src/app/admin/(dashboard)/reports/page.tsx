import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import ReportsClient from "./ReportsClient";

export const metadata: Metadata = {
  title: "Reports — Admin",
};

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const initialReport = await api.adminReportSummary(cookieHeader).catch(() => null);

  return <ReportsClient initialReport={initialReport} />;
}
