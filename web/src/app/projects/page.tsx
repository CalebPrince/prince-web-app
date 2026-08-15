import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsRegistry } from "@/components/projects-registry";

export const metadata: Metadata = {
  title: "Projects",
  description: "A registry of AI agents, automations, dashboards, and custom systems engineered by Prince Caleb.",
};

export default function ProjectsPage() {
  return (
    <Suspense fallback={null}>
      <ProjectsRegistry />
    </Suspense>
  );
}
