import { ArchivePostDetail } from "@/components/archive-post-detail";

export default async function ArchivePostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ArchivePostDetail slug={slug} />;
}
