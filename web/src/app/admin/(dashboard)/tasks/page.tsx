import { Metadata } from "next";
import { cookies } from "next/headers";
import { ssrAdminList } from "@/lib/api";
import TasksClient, { Task } from "./TasksClient";

export const metadata: Metadata = {
  title: "Tasks — Admin",
};

export default async function TasksPage() {
  const cookieHeader = (await cookies()).toString();
  const initialTasks = await ssrAdminList<Task>("/api/v1/admin/tasks", cookieHeader);

  return <TasksClient initialTasks={initialTasks} />;
}
