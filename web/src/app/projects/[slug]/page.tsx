import type { Metadata } from "next";
import { api } from "@/lib/api";
import { ProjectDetail } from "@/components/project-detail";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const project = await api.project(slug);
    return { title: project.title, description: project.summary };
  } catch {
    return { title: "Case Study", description: "A custom software case study by Prince Caleb, web and mobile app development, from architecture to launch." };
  }
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProjectDetail slug={slug} />;
}
