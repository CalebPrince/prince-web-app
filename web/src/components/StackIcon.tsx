import type { IconType } from "react-icons";
import {
  SiReact,
  SiNextdotjs,
  SiTypescript,
  SiJavascript,
  SiNodedotjs,
  SiPython,
  SiPhp,
  SiFlask,
  SiFastapi,
  SiPostgresql,
  SiMysql,
  SiSqlite,
  SiSupabase,
  SiTailwindcss,
  SiBootstrap,
  SiJquery,
  SiHtml5,
  SiWordpress,
  SiFigma,
  SiFramer,
  SiThreedotjs,
  SiWebgl,
  SiAnthropic,
  SiVercel,
  SiExpo,
  SiWhatsapp,
} from "react-icons/si";

/**
 * Maps the `icon` key the API stores on each stack entry to a real glyph.
 * Unknown or empty keys fall back to a small accent dot, so a tag without a
 * brand icon still reads as part of the list.
 */
const ICONS: Record<string, IconType> = {
  SiReact,
  SiNextdotjs,
  SiTypescript,
  SiJavascript,
  SiNodedotjs,
  SiPython,
  SiPhp,
  SiFlask,
  SiFastapi,
  SiPostgresql,
  SiMysql,
  SiSqlite,
  SiSupabase,
  SiTailwindcss,
  SiBootstrap,
  SiJquery,
  SiHtml5,
  SiWordpress,
  SiFigma,
  SiFramer,
  SiThreedotjs,
  SiWebgl,
  SiAnthropic,
  SiVercel,
  SiExpo,
  SiWhatsapp,
};

export function StackIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name];
  if (!Icon) {
    return <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />;
  }
  return <Icon className={className ?? "size-4 text-accent"} aria-hidden="true" />;
}
