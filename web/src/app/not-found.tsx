import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page Not Found",
  description: "This page doesn't exist, but the rest of the site does.",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main>
      <header className="flex min-h-[calc(100vh-76px)] items-center border-b border-line bg-bg">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6">
          <p className="mb-3 text-[0.76rem] font-semibold uppercase tracking-[0.08em] text-editorial-accent">// 404</p>
          <h1 className="mx-auto mb-3 max-w-[14ch] text-5xl font-bold leading-[1.1] md:text-6xl">This page went missing.</h1>
          <p className="mx-auto mb-4 max-w-[55ch] text-lg leading-[1.65] text-ink-soft">
            The page you&apos;re looking for doesn&apos;t exist, may have moved, or the link might be broken. Everything
            else on the site is still right where it should be.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="brand" size="pill" nativeButton={false} render={<Link href="/" />} className="group">
              Back to home
              <span
                className="inline-block transition-transform duration-150 ease-out group-hover:translate-x-1"
                aria-hidden="true"
              >
                →
              </span>
            </Button>
            <Button variant="brand-outline" size="pill" nativeButton={false} render={<Link href="/projects" />}>
              View my work
            </Button>
          </div>
        </div>
      </header>
    </main>
  );
}
