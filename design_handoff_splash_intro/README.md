# Handoff: princecaleb.dev splash intro (motion graphics)

## Overview
An 8.4-second intro animation for princecaleb.dev. It plays once on first load, then hands off to
the real home hero: a dark boot terminal types two lines, the "Prince Caleb." brand lockup assembles
at centre stage, a dark band lifts away to reveal the site hero underneath, and the lockup travels
into its resting place in the sticky nav while the hero copy, CTAs, stats and the live voice-agent
window settle in.

Sequence (authored seconds):
| Section | Start | Dur | What happens |
| --- | --- | --- | --- |
| Boot | 0.0 | 2.2 | Dark ground (#0b0c0e), blurred accent orbs + hairline grid; two mono lines type with a \u258b caret; the P tile drops in and the wordmark wipes out from behind it. |
| Assemble | 2.2 | 2.2 | A 360px hairline rule draws under the lockup; the eyebrow "// Systems built around the way you already work" fades up in accent green. |
| Wipe | 4.4 | 1.4 | Boot text and eyebrow fade; the full-bleed dark band translates up off the top edge (easeInOutQuart, 1.0s) with a 1px #62ff98 leading edge; the site hero fades in beneath at scale 1.05 → 1.0; nav items stagger in. |
| Reveal | 5.8 | 2.6 | The lockup finishes parking in the nav (invert flips to ink once the band has cleared it); hero CTAs pop, stats rise, the voice-agent transcript types out and the "Appointment held" outcome row appears. Final frame is a settled, static-looking hero. |

Playback is `{"mode":"times","count":1}` — it does not loop.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype of the
intended look, timing and behaviour, not production code to lift. The task is to **recreate this
intro in the target codebase's own environment** (the real site is PHP-rendered HTML + `public/css/app.css`,
so a small vanilla-JS/CSS module is the natural fit) using its established patterns. The prototype
runs on a bespoke timeline engine (`animations-v3.jsx`) that exists only for authoring/previewing —
do not port the engine.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, easing and copy are final and taken from the
Prince Caleb design system and the shipped home hero. Recreate pixel-for-pixel using the site's
existing CSS (`.container`, `.btn-brand`, `.system-window`, `.stat-card`, the `:root` tokens) rather
than re-declaring values.

## Screens / Views

### 1. Boot screen (0.0 – 4.4s)
- **Purpose**: covers the page while it loads; establishes the practice as a system, not a brochure.
- **Layout**: full-bleed `#0b0c0e`. Content is positioned in a 1280x720 design space scaled 1.5x to
  1920x1080 (i.e. all measurements below are in 1280x720 space).
- **Components**
  - *Orbs*: two circles, 730px and 560px, at (-130,-160) and (1400,640), `filter: blur(120px)`,
    background `#62ff98`, opacity 0.13; drift ±33px on an 11s alternate sine loop.
  - *Hairline grid*: 96px squares, 1px `rgba(255,255,255,0.09)`, radial mask
    `radial-gradient(120% 80% at 50% 46%, #000 22%, transparent 74%)`, opacity 0.55 → 0 across the wipe.
  - *Boot lines*: left 275, top 205; `500 18px/1.9` mono (`ui-monospace, SFMono-Regular, Menlo, Consolas`),
    colour `rgba(241,243,245,0.7)`. Typed at 34 chars/sec with a `\u258b` caret while typing.
    Line 1 starts at 0.00s: `> boot princecaleb.dev`. Line 2 starts at 0.60s: `> voice agents · chatbots · automations`.
    Both fade out over 0.5s from 1.85s.
  - *Brand lockup*: DS `BrandLockup` (P tile + "Prince Caleb" + accent full stop), `invert`,
    `size: 42px`, at left 275 / top 300. Tile pops in at 0.75s (easeOutBack, 0.7s, 10px rise);
    the wordmark is revealed by an `overflow: hidden` max-width wipe from behind the tile,
    1.15s → 2.00s (easeOutCubic).
  - *Rule*: left 277, top 388, height 1, `rgba(255,255,255,0.22)`, width 0 → 360 over 2.30–3.00s.
  - *Eyebrow*: DS `Eyebrow`, `// Systems built around the way you already work`, colour `#62ff98`,
    `font-size: .9rem`, 18px below the rule, fades up 2.65–3.25s.

### 2. The wipe (4.4 – 5.4s)
- The dark band is a 1080px-tall full-width `#0b0c0e` layer at z above the hero;
  `transform: translateY(-wipe * 1080)` where `wipe = easeInOutQuart((T - 4.4) / 1.0)`.
- While 0.02 < wipe < 0.99 it carries `border-bottom: 1px solid #62ff98` (the leading edge).
- The lockup sits **above** the band and does not move with it; it interpolates
  size 42px → 17.6px, left 275 → 40, top 300 → 21 over 4.25 → 5.50s (easeInOutCubic),
  and flips `invert` off (white → ink) only at ~5.35s, once the band has cleared its position.

### 3. Site hero (4.5 – 8.4s) — the hand-off frame
Grounded in `ui_kits/marketing_site/HomeScreen.jsx` + `SiteChrome.jsx`.
- **Nav**: sticky, `min-height: 72px`, padding `0 40px`, `background: rgba(251,251,250,0.85)`,
  `backdrop-filter: blur(16px)`, `border-bottom: 1px solid rgba(10,11,13,0.09)`.
  Left: the travelling `BrandLockup` (1.1rem). Right: `Home, About, Services, Builder OS, Projects,
  Pricing, Contact` — `500 .95rem`, `.5rem 1rem` padding, `--ink-soft`, with **Home** active in
  `--accent` (+ the 1px underline the real nav draws), then a `Button size="sm"` "Book a call".
  Items stagger in from 4.85s, 0.06s apart, 6px rise; the button at 5.30s.
- **Hero grid**: left 40 / right 40 / top 150, `grid-template-columns: minmax(0,1.05fr) minmax(0,.95fr)`,
  `gap: 3rem`, `align-items: center`.
- **Copy column**
  - `Eyebrow`: `// Stop losing enquiries to missed calls and slow follow-up` (4.80s).
  - `h1`: `700 2.5rem/1.12`, `letter-spacing: -0.03em`, `--heading-color`, `max-width: 540px`,
    `text-wrap: pretty`: "Turn more enquiries into **booked customers** (in `--accent`), without adding
    more admin." (4.95s, 16px rise).
  - Lead `p`: `400 1.12rem/1.62`, `--muted`, max-width 520: "I build AI voice agents, chat assistants
    and automations that answer quickly, capture the right details and move serious enquiries towards
    a booking." (5.35s).
  - CTAs: `Button` "Book a 20-minute call" + `Button variant="outline"` "See client work",
    `gap: .75rem`, `white-space: nowrap`; pop at 5.90s (easeOutBack).
  - Stats: four `StatItem`s, `gap: 1.5rem` — `12+ / Years building software`, `30+ / Projects delivered`,
    `98% / Client satisfaction`, `<48h / Average response`; rise at 6.25s. Tabular numerals.
- **Voice mockup**: DS `SystemWindow title="Voice agent · live call" live tilt={-1.25}`,
  `meta` a mono timer counting `00:06` → `00:17` (3 ticks/sec of authored time).
  Enters at 5.10s (26px rise, scale 0.975 → 1.0). Contents in order:
  1. Row: 2.4rem circle avatar `#0b0c0e` / `#62ff98` / `1px solid rgba(98,255,152,.48)` reading `PC`;
     `Prince's Assistant` (.86rem) over `Answering the reception line` (.75rem `--muted`);
     right-aligned status `Ready` → `Speaking` in `#16835a`, mono .68rem uppercase.
  2. Waveform: `VoiceWave` geometry — 12 bars, 3px wide, heights 20/55/85/35% cycling, `gap: 4px`,
     4rem tall, `margin: 0 1rem`, hairline top and bottom, `--heading-color`. **Implementation note:**
     in the prototype this is driven from the timeline clock instead of `VoiceWave`'s CSS keyframes so
     that video export renders frame-exact. In production, use `VoiceWave` as-is (idle before the call).
  3. `TranscriptLine speaker="Agent"`, fading in at 6.25s, typing at 46 chars/sec from 6.35s:
     "I can book that for Thursday at 10:30. Should I send the confirmation to this number?"
  4. `SystemOutcome title="Appointment held"`: "Calendar slot reserved for 5 minutes", fades in at 7.80s,
     `.75rem` bottom padding.

## Interactions & Behavior
- **Trigger**: plays once per session on first load of the home page. Recommended production behaviour
  (not in the prototype): set a `sessionStorage` flag so return navigations skip straight to the hero;
  respect `prefers-reduced-motion` by rendering the settled hero immediately (no band, no typing).
- **Skippable**: any click/keypress/scroll should jump to the end state — the last frame IS the real hero,
  so the intro can simply be an overlay that removes itself.
- **No CTA on the intro itself** — the hand-off frame carries the site's own CTAs.
- **Easing**: the site's single curve `cubic-bezier(.16,1,.3,1)` for all reveals; the band uses an
  ease-in-out quart; the lockup travel uses ease-in-out cubic; pops use ease-out-back.
- **Durations**: reveals .6s, transforms .4s, typing 34–46 chars/sec.
- **Camera**: the hero layer holds `scale(1.05) → scale(1.0)` across 4.20–6.20s and a −14px settle
  drift from 5.80s to the end, so nothing is ever fully static.

## State Management
Single authored clock `T` (seconds) is the only state; everything renders as a pure function of it.
Derived: `wipe`, `zoom`, `settle`, per-element progress values. Production additions: `introPlayed`
(sessionStorage), `reducedMotion` (media query), `skipped` (user input).

## Design Tokens
- Ink: `#0a0b0d` heading, `#17181c` ink, `#41454d` soft, `#6e737c` muted
- Ground: `#fbfbfa`, soft `#f3f3f1`, card `#ffffff`, nav `rgba(251,251,250,.85)`
- Dark: `#0b0c0e`; accent `#08783c`; accent on dark `#62ff98`; success ink `#16835a`
- Hairlines: `rgba(10,11,13,.09)`, strong `rgba(10,11,13,.28)`, on dark `rgba(255,255,255,.09)`
- Radii: pill 999px for actions, 16px system window, 10px icon tile
- Elevation: `0 16px 40px rgba(10,11,13,.1)` (floating mockup) only
- Type: system UI stack for text, `ui-monospace, SFMono-Regular, Menlo, Consolas` for eyebrows/timers/boot
- Motion: `cubic-bezier(.16,1,.3,1)`; grid 96px; design space 1280x720 scaled 1.5x to 1920x1080

## Assets
None. No images, no icons, no drawn logo — the mark is the DS `BrandLockup` (letter P in the page font
inside a rounded ink tile). The only glyphs used are `\u258b` (terminal caret) and `✓` (inside `SystemOutcome`).
Use the existing brand system in the codebase; do not redraw the mark.

## Files
- `Splash Intro.dc.html` — entry point: loads the design-system bundle and declares the scene list
  (`window.OM_SCENES`), playback mode and tweak defaults, then mounts the piece.
- `splash-scene.jsx` — all choreography and layout (the file to read for exact values).
- `animations-v3.jsx` — the prototype's timeline engine (authoring tool only; do not port).
- `tweaks-panel.jsx` — preview-only control panel.
- Design-system source referenced: `components/core/BrandLockup.jsx`, `components/system/SystemWindow.jsx`,
  `ui_kits/marketing_site/HomeScreen.jsx`, `ui_kits/marketing_site/SiteChrome.jsx`.
