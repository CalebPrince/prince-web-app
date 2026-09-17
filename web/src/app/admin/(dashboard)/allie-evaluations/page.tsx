import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import AllieClient, { AllieEvaluation } from "./AllieClient";

export const metadata: Metadata = {
  title: "Allie — Admin",
};

export default async function AllieEvaluationsPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ evaluations: AllieEvaluation[] }>(
    "/api/v1/admin/allie-evaluations",
    cookieHeader,
    { evaluations: [] }
  );

  return <AllieClient initialEvaluations={data.evaluations ?? []} />;
}
