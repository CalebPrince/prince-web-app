import type { Metadata } from "next";
import { api } from "@/lib/api";
import { ArchivePostDetail } from "@/components/archive-post-detail";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await api.blogPost(slug);
    return { title: post.title, description: post.excerpt };
  } catch {
    return { title: "Article", description: "An article from Prince Caleb on custom software, automation, and web/mobile development." };
  }
}

export default async function ArchivePostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArchivePostDetail slug={slug} />;
}
