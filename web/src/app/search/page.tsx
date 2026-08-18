import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchRegistry } from "@/components/SearchRegistry";

export const metadata: Metadata = {
  title: "Search — Prince Caleb",
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchRegistry />
    </Suspense>
  );
}
