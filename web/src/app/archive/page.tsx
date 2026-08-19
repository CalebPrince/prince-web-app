import { getArchiveEntries, topicsOf } from "@/lib/archive";
import ArchiveClient from "./ArchiveClient";

// The archive lists the blog posts managed in the admin, so it is rendered on
// demand rather than baked in at build time — a post published in the admin
// shows up on the next request.
export const dynamic = "force-dynamic";

export default async function Archive() {
  const entries = await getArchiveEntries();

  return <ArchiveClient entries={entries} topics={topicsOf(entries)} />;
}
