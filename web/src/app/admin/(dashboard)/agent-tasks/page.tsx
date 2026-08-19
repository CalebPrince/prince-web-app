import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminGet } from "@/lib/api";
import AgentTasksClient, { AgentTask } from "./AgentTasksClient";

export const metadata: Metadata = {
  title: "Agent Queue — Admin",
};

export default async function AgentTasksPage() {
  const cookieHeader = (await cookies()).toString();
  const data = await ssrAdminGet<{ tasks: AgentTask[] }>(
    "/api/v1/admin/agent-tasks",
    cookieHeader,
    { tasks: [] }
  );

  return <AgentTasksClient initialTasks={data.tasks ?? []} />;
}
