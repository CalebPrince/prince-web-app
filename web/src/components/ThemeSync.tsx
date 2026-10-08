"use client";

import { useEffect } from "react";
import { subscribeTheme } from "@/lib/theme";

// Mounted once in the root layout, so every page (public site, admin, client portal) follows an appearance change
// made in another open tab straight away, even pages with no switcher of their own on screen.
export function ThemeSync() {
  useEffect(() => subscribeTheme(() => {}), []);
  return null;
}
