import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import ProjectsClient from "./ProjectsClient";

export const metadata: Metadata = {
  title: "Projects — Admin",
};

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // Fetch initial projects SSR
  const initialProjects = await api.adminProjects(cookieHeader).catch(() => []);

  return (
    <div className="space-y-8">
      <ProjectsClient initialProjects={initialProjects} />
    </div>
  );
}
