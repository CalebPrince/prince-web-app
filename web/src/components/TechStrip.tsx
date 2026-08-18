import type { IconType } from "react-icons";
import {
  SiReact,
  SiNextdotjs,
  SiTypescript,
  SiNodedotjs,
  SiPostgresql,
  SiSupabase,
  SiTailwindcss,
  SiFigma,
  SiFramer,
  SiAnthropic,
  SiVercel,
  SiThreedotjs,
} from "react-icons/si";

const TOOLS: { icon: IconType; name: string }[] = [
  { icon: SiReact, name: "React" },
  { icon: SiNextdotjs, name: "Next.js" },
  { icon: SiTypescript, name: "TypeScript" },
  { icon: SiNodedotjs, name: "Node" },
  { icon: SiPostgresql, name: "Postgres" },
  { icon: SiSupabase, name: "Supabase" },
  { icon: SiTailwindcss, name: "Tailwind" },
  { icon: SiFigma, name: "Figma" },
  { icon: SiFramer, name: "Motion" },
  { icon: SiThreedotjs, name: "Three.js" },
  { icon: SiAnthropic, name: "Anthropic" },
  { icon: SiVercel, name: "Vercel" },
];

/** A quietly scrolling strip of the real logos behind the work. */
export function TechStrip() {
  return (
    <div className="border-y border-hairline bg-bg-2/30">
      <div className="mx-auto max-w-[1400px] px-6 py-10 md:px-10">
        <p className="label mb-8 text-center text-muted">The stack behind the work</p>
        <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_12%,#000_88%,transparent)]">
          <div className="flex w-max animate-[marquee_38s_linear_infinite] gap-12 pr-12 group-hover:[animation-play-state:paused]">
            {[...TOOLS, ...TOOLS].map(({ icon: Icon, name }, i) => (
              <div
                key={`${name}-${i}`}
                className="flex shrink-0 items-center gap-2.5 text-text-2 transition-colors hover:text-accent"
              >
                <Icon className="size-6" aria-hidden="true" />
                <span className="text-sm font-medium tracking-tight">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
