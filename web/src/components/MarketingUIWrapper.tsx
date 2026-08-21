"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ChatWidget } from "@/components/ChatWidget";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import { CustomCursor } from "@/components/CustomCursor";

export function MarketingUIWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide the marketing navigation, footer, and chat widgets on admin and client routes
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/client")) {
    return <>{children}</>;
  }

  return (
    <>
      <CustomCursor />
      <SiteNav />
      {/* The page is the lid the footer is revealed from under: it needs an
          opaque background of its own so the footer, parked behind it on the
          viewport floor, stays hidden until the page has scrolled clear of
          it. `relative` without a z-index keeps it painting above the
          footer's negative layer while deliberately NOT opening a stacking
          context, so in-page overlays still stack against the nav and the
          chat widgets as they do today. See SiteFooter. */}
      <div className="relative bg-bg shadow-[0_28px_60px_-12px_rgba(0,0,0,0.55)]">
        {children}
      </div>
      <SiteFooter />
      <WhatsAppFloatButton />
      <ChatWidget />
    </>
  );
}
