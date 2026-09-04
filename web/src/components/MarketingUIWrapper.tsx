"use client";

import { usePathname } from "next/navigation";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ChatWidget } from "@/components/ChatWidget";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import { CustomCursor } from "@/components/CustomCursor";
import { PageTransition } from "@/components/PageTransition";
import { ScrollWords } from "@/components/ScrollWords";

export function MarketingUIWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide the marketing navigation, footer, and chat widgets on admin and client routes
  if (pathname?.startsWith("/admin") || pathname?.startsWith("/client")) {
    return <>{children}</>;
  }

  return (
    <>
      <CustomCursor />
      <PageTransition />
      <ScrollWords />
      <SiteNav />
      {children}
      <SiteFooter />
      <WhatsAppFloatButton />
      <ChatWidget />
    </>
  );
}
