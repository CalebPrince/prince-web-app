import type { Metadata } from "next";
import "./globals.css";

import { MarketingUIWrapper } from "@/components/MarketingUIWrapper";

export const metadata: Metadata = {
  // Child segments set just their page name and get the brand prefixed here.
  // The template deliberately does not reach the home page: it only applies to
  // child segments, and the home page shares this one, so it keeps `default`.
  title: {
    default: "Prince Caleb | Website Designer & Developer",
    template: "Prince Caleb | %s",
  },
  description:
    "Custom website design and development by Prince Caleb in Accra, Ghana, working worldwide. Websites, apps and AI systems with clear scope, written agreements and limited quarterly intake.",
};

// Applies a stored/OS theme preference before first paint, so there's no
// flash of the wrong one. Dark is the default whenever there's no explicit
// signal, matching this app's design (unlike the PHP pages' light-first
// default), and is the absence of the attribute rather than a value.
//
// Shares the "theme" localStorage key with the PHP pages' own theme.js, so a
// choice made on either half of the site carries over. That half only knows
// light and dark, so it renders "dusk" as its dark - which is the right
// fallback, and the reason the value is whitelisted here rather than written
// straight onto the element.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("theme");var t=s||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");if(t==="light"||t==="dusk")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

// Arms the splash before the first paint, the same way the theme is applied
// above: the splash has to be covering in the very first frame, or the
// visitor sees the page and then has it hidden again by its own introduction.
// Once a session only, and never under reduced motion. The path guard matters
// — data-splash locks scrolling, and the admin and client apps do not mount
// PageTransition, so nothing there would ever take it back off.
const SPLASH_INIT_SCRIPT = `(function(){try{var p=location.pathname;if(p.indexOf("/admin")===0||p.indexOf("/client")===0)return;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(sessionStorage.getItem("pc-splash"))return;sessionStorage.setItem("pc-splash","1");document.documentElement.setAttribute("data-splash","on");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">
        <MarketingUIWrapper>
          {children}
        </MarketingUIWrapper>
      </body>
    </html>
  );
}
