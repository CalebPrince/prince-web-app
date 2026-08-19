import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ChatWidget } from "@/components/ChatWidget";
import { WhatsAppFloatButton } from "@/components/WhatsAppFloatButton";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Prince Caleb, Digital Design, Development & AI",
  description:
    "I design and build high-performance websites, digital products and AI-powered experiences that help ambitious businesses move forward.",
};

// Applies a stored/OS light preference before first paint, so there's no
// flash of the wrong theme. Shares the "theme" localStorage key with the
// PHP pages' own theme.js - a choice made on either half of the site
// carries over. Dark is the default whenever there's no explicit signal,
// matching this app's design (unlike the PHP pages' light-first default).
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var isLight=s?s==="light":matchMedia("(prefers-color-scheme: light)").matches;if(isLight)document.documentElement.setAttribute("data-theme","light");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${manrope.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <SiteNav />
        {children}
        <SiteFooter />
        <WhatsAppFloatButton />
        <ChatWidget />
      </body>
    </html>
  );
}
