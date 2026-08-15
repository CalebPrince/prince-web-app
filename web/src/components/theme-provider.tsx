"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

const THEMES = ["light", "dark", "midnight", "paper"] as const;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      themes={[...THEMES]}
      enableSystem
    >
      <AdminDefaultThemeSync />
      {children}
    </NextThemesProvider>
  );
}

/**
 * Mirrors the PHP site's theme.js behaviour: on a visitor's first-ever
 * visit (no explicit choice stored yet), fetch the admin-configured
 * site-wide default theme and apply it. next-themes already owns the
 * "theme" localStorage key and the pre-paint no-flash script, so this
 * only needs to call setTheme() once the fetch resolves.
 */
function AdminDefaultThemeSync() {
  const { setTheme } = useTheme();

  React.useEffect(() => {
    if (window.localStorage.getItem("theme")) return;

    fetch("/api/v1/content")
      .then((res) => (res.ok ? res.json() : null))
      .then((content: { default_theme?: string } | null) => {
        if (!content || window.localStorage.getItem("theme")) return;
        const configured = content.default_theme ?? "";
        if ((THEMES as readonly string[]).includes(configured)) {
          setTheme(configured);
        }
      })
      .catch(() => {});
  }, [setTheme]);

  return null;
}
