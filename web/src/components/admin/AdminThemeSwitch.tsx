"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Sunset } from "lucide-react";
import { cn } from "@/lib/utils";
import { readTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme";

// The appearance switch in the admin sidebar. Same three appearances and the same shared setting as the public
// site's header dock, so switching here changes the public site too, and the other way round.
const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
  { id: "dusk", label: "Dusk", icon: Sunset },
];

export function AdminThemeSwitch() {
  const [theme, setCurrent] = useState<Theme>("dark");

  useEffect(() => {
    const t = setTimeout(() => setCurrent(readTheme()), 0);
    const off = subscribeTheme(setCurrent);
    return () => {
      clearTimeout(t);
      off();
    };
  }, []);

  return (
    <div role="group" aria-label="Appearance" className="grid grid-cols-3 gap-1 rounded-[var(--control-radius)] border border-hairline bg-bg p-1">
      {THEMES.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => setTheme(id)}
          aria-pressed={theme === id}
          className={cn(
            "flex h-9 items-center justify-center gap-1.5 rounded-[calc(var(--control-radius)-4px)] text-xs font-semibold transition-colors",
            theme === id ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-bg-3 hover:text-text",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
