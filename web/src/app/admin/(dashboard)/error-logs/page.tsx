import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import ErrorLogsClient, { ErrorLogResponse } from "./ErrorLogsClient";

export const metadata: Metadata = {
  title: "Error Logs — Admin",
};

export default async function ErrorLogsPage() {
  const cookieHeader = (await cookies()).toString();
  const initial = await ssrAdminGet<ErrorLogResponse>(
    "/api/v1/admin/error-logs?limit=100",
    cookieHeader,
    { sources: [], entries: [] }
  );

  return <ErrorLogsClient initial={initial} />;
}
