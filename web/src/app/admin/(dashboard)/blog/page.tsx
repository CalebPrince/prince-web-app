import { Metadata } from "next";
import { cookies } from "next/headers";
import { api } from "@/lib/api";
import BlogClient from "./BlogClient";

export const metadata: Metadata = {
  title: "Blog — Admin",
};

export default async function BlogPage() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  
  // Fetch initial posts SSR
  const initialPosts = await api.adminBlogPosts(cookieHeader).catch(() => []);

  return (
    <div className="space-y-8">
      <BlogClient initialPosts={initialPosts} />
    </div>
  );
}
