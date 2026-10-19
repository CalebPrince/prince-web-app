# Frame packet: 05-voice

## Project inputs

- Project: D:\Websites\prince-web-app\videos\whatsapp-voice-conversion-ad
- Design tokens: D:\Websites\prince-web-app\videos\whatsapp-voice-conversion-ad\frame.md
- RULES_DIR: C:\Users\User\.claude\skills\hyperframes-animation\rules

## Assigned storyboard block

## Frame 5 — voice

- status: outline
- src: compositions/frames/05-voice.html
- duration: 9.326s
- transition_in: cut
- poster: 4s
- type: feature_showcase
- persuasion: Demonstration
- beat: Confidence
- scene: Call button becomes a connected voice interface and waveform.
- voiceover: Need a quick explanation? Let them call. A real conversation can clear up the details and help them decide what happens next.
- blueprint: device-surface-showcase

narrativeRole: Call button becomes a connected voice interface and waveform.
keyMessage: Help customers start a useful conversation.

focal: Call button becomes a connected voice interface and waveform.
roles: background — flat brand field; foreground — large readable type and illustrative contact UI; supporting — functional connection lines.

Shot sequence: 0–2.1s: a CALL US panel is held as hero and comes into focus. 2.1–3.8s: it steps to its connected state as "let them call" lands (2.6s). 3.8–5.9s: a signal-green voice waveform runs live across the panel under the caller's question cue. 5.9–8.3s: the panel steps again and the mono label DETAILS CLARIFIED confirms on "details" (6.0s). 8.3–9.326s: NEXT STEP lands as the closing state and holds. Use svg-icon-enrichment for the live waveform, discrete-text-sequence for the stepping state labels, spring-pop-entrance for each state's arrival. Layout: one held hero panel centred, states cycling inside it, cursorless stepwise flow; low density, flat plane.

## Selected blueprint: device-surface-showcase

# device-surface-showcase — Device / Surface Showcase

**intent**: A product surface — a device mockup or a floating browser/app window — is the hero held in frame while its screens cycle through a real flow, showcased by a camera move that ranges from a static hold to a continuous 3D push.

**roles served**

- Key_Feature (from key-feature-device-screen-tour, key-feature-floating-window-scroll, key-feature-3d-device-hand-demo): show a feature being \_experienced inside its real interface\* — the surface houses the action and its screens advance through a flow, rather than enumerating tiles or chasing a cursor across a workflow. (Note: the three founding drafts are Key_Feature and variants differ by MECHANIC, not role; the mined stepwise-flow variant widens the blueprint to Product_Intro.)
- Key_Feature (from demo-page-scroll-spotlight): the floating-window push-scroll variant carried to a spotlight climax — a real webpage rendered as a tilted 3D card coasts in (power2, like a phone held up — no spring), header keywords flare on a karaoke glow as the VO names them, the page rolls to the demoed section, and one element LIFTS off the surface (translateZ + scale) under a radial spotlight that dims the rest.
- Product_Intro (from stepwise-flow-completion): a compact end-to-end product flow — setup/auth → action → success/confirm — plays out cursorless as successive screen states inside the held surface, capped by a confirming button press; bookended by title-card beats. The surface introduces the product by \_completing its core loop\*, not by touring screens.
- Key_Feature (from `showcase-carousel`): the showcase-carousel — two surfaces in sequence (a widget card cycling brand skins, a phone frame with app screens sliding through it) gated by interstitial claim words; the screen cycle is a breadth carousel ("N brands / N apps"), not a flow.

**duration**: 5–11.3s (page-scroll-spotlight 5–9s · floating-window 7.8s · 3d-hand 7.9s · in-device approval 7.9s · stepwise-flow 8.5–9.4s · device-tour 9.6s · showcase-carousel 11.3s)

**shot structure** One product surface — a `[device mockup]` or a `[floating browser/app window]` — is the persistent hero on a `[styled backdrop: gradient / radial / stylized 3D void]`; its `[screens/sections]` cycle through a real `[product flow]` while a showcase camera (static-hold, push-in→zoom-out, or one continuous push) presents it. Each screen state holds ~1.0–1.5s.

- Scene 1 (0.0–~1.5s): The surface ESTABLISHES — it `[slides in from an edge / drifts in from a tilt / dissolves from a full-frame title card]` and settles, with a `[accent shape or backdrop]` resolving behind it; the first `[screen]` is visible. The showcase camera begins (see variants).
- Scene 2 (~1.5–~Xs): The surface is OPERATED on its own face — a `[tap/select/scroll]` triggers the first screen advance: old content `[pushes out / scrolls up]`, new `[screen/section]` `[pulls up / pushes in from the side]`; concurrently a `[label / header word / side headline]` updates. The camera continues its move.
- Scene 3+ (~Xs–end, repeat for `[2–4 screen beats]`): The surface ADVANCES through successive `[screens/sections]`, each a discrete swap or scroll synced to the surface's flow, while the secondary copy `[swaps out-up / in-up]` or stays marked to hold reading position. HOLDS on the final `[screen]` (or, for one variant, blooms out — see variant).

- Variant — static-tour (key-feature-device-screen-tour, 9.6s): a `[device mockup]` slides in from off-screen and settles (ease-out); an `[accent-color shape]` scales up behind it (spring overshoot). Camera STAYS STATIC the entire clip — all motion is element/UI-level: a tap COMPRESSES a button (95%→100%), the UI scrolls/transitions to the next view (old pushes out, new pulls up), and a `[side headline]` SWAPS beside the device (old slides up + fades, new slides up + in) per screen. Holds on the final screen. No camera move, no cursor.
- Variant — floating-window (key-feature-floating-window-scroll, 7.8s): OPENS on a full-frame `[title card]` (a small `[icon]` draws in at center, `[feature name]` below; holds ~2s), which DISSOLVES to a `[macOS-style browser/app window]` floating on a `[vivid gradient]` (traffic-lights + `[URL pill]` + tabs; left nav, central content, right `[sidebar]`). Camera PUSHES IN on a `[target region/sidebar]` (active item highlighted `[accent]`, a cursor drifts down the list), then ZOOMS BACK OUT to re-frame the whole window while the content SCROLLS through `[sections]`; the `[highlighted item]` stays marked. One push-in→zoom-out arc, gated by the title-card opener.
- Variant — 3d-hand (key-feature-3d-device-hand-demo, 7.9s): FULLY 3D — a `[3D device]` drifts in a `[stylized 3D void / bloom + particles]`, opening tilted and self-rotating to face the lens nearly flat as ONE CONTINUOUS forward camera push begins (no cuts). A glossy `[3D hand]` rises from the bottom-foreground and GESTURE-DRIVES the surface: it swipes to scroll a `[picker/sidebar panel]` of `[option cards]` and taps `[option]` (while a `[header word]` letter-flips in place); the selection APPLIES — a `[new layout]` grows from center to fill the device face, nav flips, a `[marquee]` scrolls horizontally; the hand swipes again to scroll the page upward through `[sections]`, then drifts out. The camera never stops pushing; the bright device face keeps growing toward the lens until it BLOOMS into a `[light]` wash — a zoom-through "portal" exit that fills the frame.
- Variant — stepwise-flow (Product_Intro, 8.5–9.4s; in-device Key_Feature sub-mode 7.9s): CURSORLESS end-to-end flow — the surface completes `[setup/auth → action → success]` as a narrative arc. Opens on a `[title card]` that fades in/out on an ambient gradient (or a typed `[command]` running character-by-character on a terminal field). The `[flow surface]` arrives (phone mock slides up oversized and settles / bordered log panel replaces the command) and step 1 completes via rapid sequential pops — `[OTP digits]` fill boxes left-to-right capped by a green check, or `[log steps]` pop top-down with highlighted tokens, ending on a trailing-dots waiting state. State advances laterally (old content slides out left, new in from right, chrome persists) or via a dark-to-light scene swap into a white `[detail/confirm card]` whose elements stagger in. COMMIT: the `[CTA button]` is pressed (press dip / spinner "Processing") and a `[success state]` renders with check bullets — in the in-device sub-mode the commit runs a biometric ritual: dim overlay, `[squircle]` spring-pops, a ring draws around an icon, the icon morphs to a checkmark and holds; a slight camera push-in fires ONLY at the state transition (camera punctuates the commit, then re-locks). EXIT: the surface leaves and closing `[title cards]` pop in and ease smaller — the surface exits before the coda instead of holding. Camera otherwise static. For this variant the persistent hero is the FLOW, not one surface: a terminal panel may hand off wholesale to a confirm card.
- Variant — showcase-carousel (Key_Feature, 11.3s): TWO surfaces in sequence on a slowly drifting `[pastel mesh gradient]`, static camera, gated by centered interstitial `[claim words]` (fade in with gentle scale-up, fade out). Act 1: a white `[widget card]` scales in, flips/morphs into a tilted vertical widget and CYCLES `[N brand skins]` (~0.8s each) — one shared layout, per-skin content and accent swaps — while a large `[brand logo]` crossfades below per flip; the widget scales away. Act 2: a `[phone frame]` enters oversized and tilted, settles upright at center; full `[app screens]` slide left through it (~1s each), holding on the last. The screen cycle is a breadth carousel, not a flow — no taps, no cursor, no camera.

**motion vocabulary** surface establish (edge slide-in + settle / tilt drift-in + self-rotate-to-camera / title-card dissolve); accent shape spring behind surface; element-level screen-cycling (scroll-swap, push-in-from-side, scale-swap); button tap-compress; staggered side-headline reveal + copy swap (out-up / in-up); in-place header-word letter-flip; floating browser-window-on-gradient idle float; full-frame title-card opener (icon draw-in + label); camera push-IN on a region; camera zoom-OUT re-frame; content scroll-through; one continuous 3D camera-follow push (no cuts); 3D device drift + self-rotate; stylized-environment bloom/particles; 3D-hand entrance + swipe-scroll + tap (gesture-driven); picker-panel slide-in; template-apply grow-from-center; horizontal marquee scroll; gesture-driven page scroll; zoom-through bloom/portal exit; static-hold (no camera) as the floor of the camera range. Stepwise-flow additions: title-card bookends (fade-in/out opener; closers pop in then ease smaller); typed terminal command with prompt chevron; sequential top-down log pops with sub-line reveals; animated trailing-dots wait state; sequential digit pops left-to-right + green check confirm; lateral screen slide with persistent chrome; dark-to-light scene swap; staggered card element build-in (fade + slide-up); button press dip + fill flip; spinner processing state; success check-bullet reveal; notification banner spring-in with overshoot; lockscreen fade/blur-away as a card expands to fill the device face; commit-synced micro push-in; dim overlay; squircle spring pop; circular ring draw; icon morph to checkmark; surface exit before a title coda. Showcase-carousel additions: interstitial claim-word gate; brand-skin cycling with per-flip logo crossfade; card flip/morph into a tilted widget; oversized-tilted surface entry settling upright; fast slide-left screen carousel inside a static frame; drifting mesh-gradient backdrop.

**rule mapping** (per motion verb → backing rule, or flagged special)

- screen-cycling — UI scrolls/sections scroll inside the surface (device-tour, floating-window scroll, 3d-hand page scroll) → `3d-page-scroll` (webpage/app as a tilted card whose content `translateY`-scrolls to sections; primary mechanic for the surface's screen flow)
- floating-window establish + the surface presented as a tilted/floating UI card → `3d-page-scroll` (the tilt/perspective framing) + `css-3d-transforms` (perspective/`translateZ` depth)
- screen / side-copy state swaps (discrete screen states; side headline content swapping per beat) → `discrete-text-sequence`
- side-headline reveal (staggered fade + slide-up) → `discrete-text-sequence`
- in-place header-word letter-flip (3d-hand) → `hacker-flip-3d`
- screen swap as a coordinated shrink-out / pop-in between two screen states → `scale-swap-transition`
- template-apply "new layout grows from center to fill the face" (3d-hand) → `center-outward-expansion` (clustered-at-center → expand to fill)
- the surface morphing between states / title-card→window dissolve as the eye-anchor transition → `card-morph-anchor`
- button tap-compress (95%→100% press feedback) → `press-release-spring` (or `physics-press-reaction` for a heavier press)
- floating-window cursor click on the highlighted list item → `cursor-click-ripple`
- accent-highlight pop on the active sidebar/list item → `asr-keyword-glow` (accent glow on the focused item)
- drifting cursor down the sidebar list (floating-window) → `camera-cursor-tracking` (flat-cursor drift; pairs with the push-in)
- floating browser-window idle float / 3D device drift-breathe → `sine-wave-loop`
- 3D device drift + self-rotate-to-camera + perspective depth (3d-hand) → `css-3d-transforms` (CSS-3D) **or** `3d.md` technique (true Three.js/R3F device); see camera modifier
- horizontal `[marquee]` scroll (3d-hand) → `viewport-change` (PAN mode on the marquee strip) — _thin fit; a literal CSS-marquee/translateX loop is closer to a `gsap-effects`/CSS recipe than a named motion rule_
- 3D-hand entrance + swipe + tap as the interaction DRIVER (gesture input that scrolls/selects) → **flagged special — needs a heavier capability beyond the rule library (R3F/Three.js + WebGL), NOT a motion-shape rule.** The 3D hand model + WebGL bloom have a _technique_ backing (`3d.md` — R3F, `useGLTF` HandModel, `--gl=swiftshader` for the shader/bloom), but no motion-shape rule models a 3D hand as the swipe-to-scroll / tap-to-select gesture protocol. `context-sensitive-cursor` / `camera-cursor-tracking` only model a flat typing/pointer cursor, not a 3D gesturing hand.
- zoom-through bloom / portal exit (3d-hand) → **flagged special — needs a heavier capability beyond the rule library (WebGL), NOT a named transition rule.** Capability is `techniques.md` → WebGL shader (via `3d.md` headless WebGL: `--gl=swiftshader --concurrency=1`), but no named transition rule covers a bloom/portal fly-through.
- typed terminal command / non-linear log text (stepwise-flow) → `discrete-text-sequence` (typing + threshold state replacement) with `dynamic-content-sequencing` computing each step's window from content length
- sequential top-down log pops / OTP digit pops left-to-right / staggered confirm-card build-in → `spring-pop-entrance` (staggered group form; low overshoot for log lines)
- trailing-dots wait state → `sine-wave-loop` (finite repeats; step the opacity of 3 dots on a shared phase)
- lateral screen slide with persistent chrome → the existing screen-cycling mapping (`3d-page-scroll` translateX form inside the clipped surface); chrome sits outside the sliding layer
- notification banner spring-in / squircle pop (in-device) → `spring-pop-entrance`
- lockscreen fade/blur-away + card expands to fill the device face → `card-morph-anchor` (uniform-scale container morph — never tween width/height) + `depth-of-field-blur` (the blur-away)
- commit-synced micro push-in (camera punctuates the Approve/tap, then re-locks) → `multi-phase-camera` (single short push phase placed at the state transition)
- button press dip + fill flip / Approve press-down spring-back → `press-release-spring` (already mapped; the fill flip is its color-transition variation)
- spinner processing state → `svg-icon-enrichment` (rotating internal element with explicit SVG center)
- success check bullets / biometric ring draw → `svg-path-draw` (check strokes; ring rotated −90° to start at 12 o'clock) + `spring-pop-entrance` for the bullet pops
- icon morph to checkmark (biometric ritual) → **flagged special — SVG path morph, see hyperframes-keyframes (morph)**; no motion-shape rule models it — mechanics live in `techniques.md` / the keyframes skill, same tier as the blueprint's existing WebGL flags
- interstitial claim-word gate (fade + gentle scale-up, then out) → `gsap-effects` (plain fade/scale chord; deliberately quieter than `kinetic-beat-slam`)
- brand-skin cycling with per-flip logo crossfade → `discrete-text-sequence` (whole-state content replacement at thresholds) + `scale-swap-transition` where a flip reads as shrink-out/pop-in; the card→tilted-widget flip/morph → `card-morph-anchor` + `css-3d-transforms`
- drifting mesh-gradient backdrop → `sine-wave-loop` (very-low-amplitude position/hue drift on gradient blobs)

**camera modifier**: The showcase camera spans a RANGE keyed by variant, all on a single content-wrapping virtual camera (`viewport-change`):

- static-tour → NO camera move (`viewport-change` held at scale 1, or omitted); all motion is element-level. This is the floor of the range and what distinguishes the device-tour from the rest.
- floating-window → a two-phase push-in → zoom-out arc → `multi-phase-camera` (e.g. dramatic-reveal 1.1→1.0→0.95 feel): push IN on the `[sidebar/region]` via `coordinate-target-zoom` (off-center target = scale + counter-translate), then `multi-phase-camera` zooms back OUT to re-frame the whole window while content scrolls.
- 3d-hand → ONE continuous forward push (no cuts) → `multi-phase-camera` in steady-push mode (1.0→1.03→1.06… plus its sine micro-drift) layered over `css-3d-transforms`/`3d.md` so the device self-rotates-to-lens during the push; the push runs unbroken into the bloom/portal exit (exit itself is the WebGL-shader flagged special above). Across all three: `viewport-change` is the base virtual-camera primitive; `multi-phase-camera` sequences the push/zoom phases (and supplies the always-on micro-drift that keeps even the "static" tour from feeling dead); `coordinate-target-zoom` aims the push at off-center screen detail.

**Overflow (pan/scroll surfaces — required for a clean `check`):** a panned or scrolled surface deliberately moves content PAST the edges of its framing card. Clip it at the card (`overflow: hidden` on the card/window) AND mark the moving inner layer (the `.world` / surface wrapper holding the screenshot + any markers/labels) with `data-layout-allow-overflow` — otherwise `check` reports `text_box_overflow` / `container_overflow` errors for the parts that scroll off (e.g. a marker label panned off the left edge). The card clips them visually; the attribute tells the layout audit it's intentional, not a layout bug.

## Selected motion rule: discrete-text-sequence

---
name: discrete-text-sequence
description: Replace entire text states at frame thresholds for non-linear typing effects — typos, bulk additions, pauses, backspaces, simulated thinking.
metadata:
  tags: text, typing, discrete, threshold, non-linear, sequence
---

# Discrete Text Sequence

Instead of character-by-character typewriter, replace entire string states at time thresholds — enabling non-linear effects (typos, backspaces, bulk paste, "thinking" gaps) that smooth per-char typing can't achieve. If your effect is "type each character, no edits", this rule is overkill — use the smooth-slice variation below.

## How It Works

The typing is authored as a sparse array of `{ t, text }` states; on every `onUpdate` a **reverse search** finds the latest entry whose `t` has passed and renders its text. Display jumps between states with no animation between them — the realism comes from the schedule shape: fast keystroke clusters (0.06–0.20s apart), pauses at word breaks (0.3–0.6s), a typo, backspaces peeling back to the fork, then a bulk paste replacing many chars in one entry. A block cursor blinks via a deterministic sin square wave on the same timeline.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="terminal">
  <div class="prompt">$</div>
  <div class="text-wrap">
    <span class="text" id="text"></span><span class="cursor" id="cursor">_</span>
  </div>
</div>
```

```css
.terminal {
  font-family: {monoFont}; /* monospace required — proportional jitters even in a fixed box */
  display: flex;
  align-items: baseline;
  font-size: TERMINAL_FONT_SIZE;
}
.text-wrap {
  display: inline-flex;
  align-items: baseline;
  min-width: TEXT_WRAP_MIN_WIDTH; /* ≥ widest state — stops right-edge jitter */
  white-space: nowrap;
}
.cursor {
  display: inline-block; /* inline ignores width */
  width: CURSOR_WIDTH;
}
```

```js
// Each entry shows from its t until the NEXT entry's t.
// Shape: keystrokes → typo → backspace to the fork → bulk paste → completion mark.
const SEQUENCE = [
  { t: 0.0, text: "" },
  { t: T_K1, text: "{p1}" }, // first keystrokes (~3-5 chars, 0.1-0.2s apart)
  { t: T_K2, text: "{p1 + ' ' + p2_typo}" }, // continuation containing a typo
  { t: T_BS, text: "{p1 + ' ' + p2_partial}" }, // backspace(s) — peel back to the fork
  { t: T_BULK, text: "{fullCorrectedText}" }, // bulk paste — many chars in one jump
  { t: T_DONE, text: "{fullCorrectedText + ' ✓'}" }, // completion marker
];

// Reverse-search for the latest entry whose t has passed
function textAt(time) {
  for (let i = SEQUENCE.length - 1; i >= 0; i--) {
    if (time >= SEQUENCE[i].t) return SEQUENCE[i].text;
  }
  return "";
}

const textEl = document.getElementById("text");
const cursorEl = document.getElementById("cursor");

const driver = { t: 0 };
tl.to(
  driver,
  {
    t: TOTAL_DURATION,
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      textEl.textContent = textAt(driver.t);
    },
  },
  0,
);

// Cursor blink — deterministic sin square wave, never a CSS animation
const blink = { p: 0 };
tl.to(
  blink,
  {
    p: Math.PI * 2 * BLINK_CYCLES,
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      cursorEl.style.opacity = Math.sin(blink.p) > 0 ? "1" : "0";
    },
  },
  0,
);
```

## Variations

- **Smooth character slice** (continuous typewriter — no pauses, no edits): faster to author but uniformly "machine-typed", missing the human realism:

```js
const fullText = "{fullPhrase}";
const len = { v: 0 };
tl.to(
  len,
  {
    v: fullText.length,
    duration: TYPE_DUR,
    ease: "power1.inOut",
    onUpdate: () => {
      textEl.textContent = fullText.substring(0, Math.floor(len.v));
    },
  },
  0,
);
```

- **Thinking pause** — hold one state for `THINK_HOLD_DUR` (0.8–2.0s; under 0.5s reads as a stutter, not thought) simply by leaving a gap before the next entry's `t`.
- **State pulse on completion** — when the final state lands, `tl.to(".text", { scale: 1.03–1.08, duration: 0.15–0.3, yoyo: true, repeat: 1 }, T_DONE)`.
- **Per-state color shift** — in `onUpdate`, branch on `driver.t` vs the milestones: success color after `T_DONE`, dim mid-edit, normal while typing.

## Values

| token               | range                                        | notes                                                                  |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------- |
| TERMINAL_FONT_SIZE  | 48–96px                                      | full-bleed comps; smaller for terminal-style detail                    |
| TEXT_WRAP_MIN_WIDTH | ≥ widest state                               | measure with a hidden probe after `document.fonts.ready` if unsure     |
| milestone `t`s      | keystrokes 0.06–0.20s apart; pauses 0.3–0.6s | monotonically increasing; `T_DONE ≤ TOTAL_DURATION − ~1s` climax dwell |
| TYPE_DUR (smooth)   | `chars × 0.06–0.12s`                         | fast → relaxed                                                         |
| BLINK_CYCLES        | one cycle per 0.5–0.8s                       | `TOTAL_DURATION / 0.8 ≤ BLINK_CYCLES ≤ TOTAL_DURATION / 0.5`           |
| CURSOR_WIDTH        | ~0.3× font size                              | gap to text single-digit px so the cursor feels attached               |

## Critical Constraints

- **Reverse-search the array each frame** — O(n) with small n (≤30 typical); don't index by frame, the sequence is sparse.
- **`min-width` on the text wrap is mandatory** — without it the right edge jitters as state length changes.
- **Discrete jumps must be INSTANT** — any transition on the text turns the jump into a smear and kills the "typing" feel.
- **Cursor blink is sin/sequence-driven on the timeline**, `display: inline-block`, monospace font, `white-space: nowrap` (wrapping mid-state breaks the illusion; trailing spaces must survive).
- **Discrete vs smooth** — use discrete only for non-linear states (typos, pauses, bulk paste); plain typing takes the smooth-slice variation.

## See also

`context-sensitive-cursor` (same SEQUENCE pattern + segment-colored cursor) · `3d-text-depth-layers` (discrete text with layered depth) · `counting-dynamic-scale` (discrete label beside a smooth counter) · `press-release-spring` (post-completion press beat).

## Selected motion rule: spring-pop-entrance

---
name: spring-pop-entrance
description: The canonical entrance pop — an element (or staggered group) arrives by scaling 0 → 1 on a smooth long-tail settle (power3 default); bouncy overshoot is a rare, explicitly-playful exception. fromTo so it's correct at t=0 under seek.
metadata:
  tags: spring, entrance, pop, scale, power3, settle, stagger, reveal, arrival
---

# Spring-Pop Entrance

> **Smooth beats bouncy.** This entrance defaults to a smooth long-tail settle — `power3.out` (or `expo.out` for a faster front) — that decelerates cleanly into the resting size with **no overshoot**. Bouncy `back.out` is the **#1 instant turn-off** in agent-made videos and is almost never executed well; it is a rare, explicitly-playful exception (consumer / fun brand), never the default. When unsure, settle smoothly.

THE entrance primitive: an element (or staggered group) arrives by springing from nothing — `scale: 0 → 1`, optional small `y` rise — and settles without bouncing. This is **arrival**, not reaction: distinct from [press-release-spring.md](press-release-spring.md) (a click/press → release feedback chain on an element that already rests on screen). Many blueprints used to borrow that rule to fake an entrance; reach for this instead.

## How It Works

One `fromTo` carries the whole arrival: from `{ scale: 0, opacity: 0 }` (explicit, so t=0 is correct under seek) to `{ scale: 1, opacity: 1, ease: "power3.out" }`. For a **group**, the same `fromTo` runs per element at `i * STAGGER`, capped so the group reads as one arriving beat. The `scale` grow is load-bearing; the `y` rise is garnish — drop everything else and it must still read as a clean entrance. Let the ease produce the settle: never hand-key a `scale: 1.1` mid-state (it double-bounces against the curve).

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="pop-hero" id="hero">{heroLabel}</div>

<div class="pop-grid">
  <div class="pop-item">{itemA}</div>
  <div class="pop-item">{itemB}</div>
  <div class="pop-item">{itemC}</div>
</div>
```

```css
.pop-hero,
.pop-item {
  transform-origin: 50% 50%; /* in-place pop; move to the source point for the anchored variation */
  will-change: transform;
}
.pop-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: GRID_GAP;
  place-items: center;
}
```

```js
// Single hero pop — smooth long-tail settle, no overshoot.
tl.fromTo(
  "#hero",
  { scale: 0, opacity: 0 },
  { scale: 1, opacity: 1, duration: POP_DUR, ease: "power3.out" },
  ENTRY_AT,
);

// Staggered group pop — one arriving beat.
gsap.utils.toArray(".pop-item").forEach((el, i) => {
  tl.fromTo(
    el,
    { scale: 0, opacity: 0, y: Y_RISE },
    { scale: 1, opacity: 1, y: 0, duration: POP_DUR, ease: "power3.out" },
    GROUP_ENTRY_AT + i * STAGGER,
  );
});
```

## Variations

- **Calm settle** (premium / enterprise): `power3.out`, no rotation, `Y_RISE` 0–12px — a weighted, confident landing for a hero wordmark or product shot.
- **Firm settle** (everyday default): `power3.out` or `expo.out` for a punchier front, `Y_RISE` ~24px — cards, icons, callouts.
- **Exact-physics settle**: when the settle IS the shot, swap the ease for `springEase({ response: 0.4 })` (critically damped) from `../adapters/gsap-easing-and-stagger.md` → Spring Eases; take `duration` from the helper.
- **Origin-anchored pop**: a callout growing out of a specific point (marker, pointer tip) sets `transform-origin` to that point (e.g. `0% 100%`) so `scale: 0 → 1` reads as "emerging from the source", not "inflating in place".
- **Pop into a held slot**: land the pop and hold still — no idle loop baked into the entrance. If the held frame genuinely needs life, hand off to [sine-wave-loop.md](sine-wave-loop.md) for subtle jitter on a separate later tween; prefer revealing the next element on its VO cue.
- **Bouncy pop (RARE — explicitly-playful only)**: swap the ease for `back.out(OVERSHOOT)` and optionally settle a small `rotation: ROT_FROM → 0` so elements look hand-placed. Only for a deliberately playful register — never product / enterprise / serious tone:

```js
tl.fromTo(
  el,
  { scale: 0, opacity: 0, rotation: ROT_FROM },
  { scale: 1, opacity: 1, rotation: 0, duration: POP_DUR, ease: `back.out(${OVERSHOOT})` },
  GROUP_ENTRY_AT + i * STAGGER,
);
```

Even here keep `OVERSHOOT ≤ ~2` — past that it reads as cartoon wobble. Better still: the baked spring at `dampingFraction: 0.6–0.7` (same adapters doc) gives ~5–10% overshoot that reads physical where `back.out` reads cartoon.

## Values

| token      | range                                     | notes                                                            |
| ---------- | ----------------------------------------- | ---------------------------------------------------------------- |
| EASE       | `power3.out` default; `expo.out` punchier | `back.out(OVERSHOOT)` only in the playful variant                |
| POP_DUR    | 0.4–0.7s                                  | shorter = tight snap; hero must be visible by **t ≤ 0.5s**       |
| STAGGER    | 0.04–0.08s                                | `min(0.06, 0.5 / ITEM_COUNT)` — self-caps the window             |
| ITEM_COUNT | 3–9                                       | >9 makes the stagger vanish — switch to a wipe/sweep reveal      |
| Y_RISE     | 0–32px                                    | small; never large enough to read as a slide-up                  |
| ROT_FROM   | −10°–+10°                                 | playful variant only; alternate sign by index (`i % 2 ? 6 : -6`) |
| ENTRY_AT   | 0–0.4s                                    | a beat of quiet, but keep the subject landing by t ≤ 0.5s        |

## Critical Constraints

- Default ease `power3.out` (no overshoot); `back.out` only in the explicitly-playful variant, and there `OVERSHOOT ≤ ~2`.
- `ITEM_COUNT × STAGGER ≤ ~0.5s` — the group must land inside one beat.
- Entrances state the collapsed from-state in `fromTo` — never rely on a CSS-hidden start (it renders visible before the tween claims it under seek).
- `transform-origin: 50% 50%` for an in-place pop; the source point only for the anchored variation.
- This is a finite arrival — idle motion on a held element is a separate, later `sine-wave-loop` tween.

## See also

`center-outward-expansion` (pop while radiating to slots) · `press-release-spring` (the click-feedback counterpart) · `sine-wave-loop` (post-arrival jitter, sparingly).

## Selected motion rule: svg-icon-enrichment

---
name: svg-icon-enrichment
description: Animate internal SVG elements (rotating hands, opening blades, pulsing dots, dash flows) to make icons feel alive without replacing them.
metadata:
  tags: svg, icon, animation, internal, micro-animation, pulse, rotation
---

# SVG Icon Enrichment

Treats an SVG icon as a composition of animated PARTS, not an opaque image. Each meaningful internal element (a clock hand, scissor blade, recording dot, data line) gets its own micro-animation, targeted by id. Distinct from [svg-path-draw](svg-path-draw.md) (which animates the OUTLINE drawing) — enrichment animates INTERNAL PARTS, ideally after the outline has drawn.

Four signature patterns:

| Pattern     | Use For                            | Math                                  | Tip                                |
| ----------- | ---------------------------------- | ------------------------------------- | ---------------------------------- |
| Rotation    | Clock, gear, loader, dial          | `rotate(deg cx cy)` attribute, linear | see the transform-center gotcha    |
| Oscillation | Scissors, wings, toggle            | `rotate(±sin·amp)` on opposing groups | opposite signs on the two parts    |
| Pulse       | Recording dot, heart, notification | `scale(1 + sin·amp)` + opacity        | ring lags dot by π/2 for ripple    |
| Dash flow   | Cutting line, data stream          | `strokeDashoffset` linear via time    | negative for L→R, positive for R→L |

## ❗ The transform-center gotcha

**For rotation around an explicit point inside an SVG, use the SVG `transform` ATTRIBUTE, not CSS transform**: `el.setAttribute("transform", `rotate(${deg} ${cx} ${cy})`)`. The CSS combination `transform: rotate(...)` + `transform-origin: 60px 60px` + `transform-box: fill-box` interprets the origin in the element's OWN **bbox-local** coordinates, NOT viewBox coordinates. For a thin `<line>` (whose bbox is the line's narrow envelope), `60 60` bbox-local is a point OUTSIDE the line — the hand flies along an off-center arc instead of rotating in place. Same trap for small inner shapes (a dot circle whose bbox is the small circle, not the full viewBox).

**Scaling around a center point**: same attribute route — `el.setAttribute("transform", `translate(${cx} ${cy}) scale(${s}) translate(-${cx} -${cy})`)`.

## Recipe

```html
<!-- inside a standard scene clip — named children are the animation targets -->
<svg class="icon-svg" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="50" fill="none" stroke="{accentColor}" stroke-width="6" />
  <line
    id="hand-min"
    x1="60"
    y1="60"
    x2="60"
    y2="22"
    stroke="{textColor}"
    stroke-width="6"
    stroke-linecap="round"
  />
  <line
    id="hand-sec"
    x1="60"
    y1="60"
    x2="60"
    y2="30"
    stroke="{recordColor}"
    stroke-width="3"
    stroke-linecap="round"
  />
  <circle cx="60" cy="60" r="6" fill="{textColor}" />
</svg>
<!-- pulse icon: #rec-ring + #rec-dot circles; dash-flow: a <line> with stroke-dasharray="14 12" -->
```

```js
// Pattern 1 — Rotation. Proxy tween → SVG transform attribute (explicit center, see gotcha).
const hand = document.getElementById("hand-min");
const minState = { deg: 0 };
tl.to(
  minState,
  {
    deg: 360 * MIN_REVOLUTIONS,
    duration: TOTAL_DURATION,
    ease: "none", // linear motion is the point
    onUpdate: () => hand.setAttribute("transform", `rotate(${minState.deg} 60 60)`),
  },
  0,
);
// second hand: same shape with SEC_REVOLUTIONS (visibly faster).

// Pattern 3 — Pulse. One phase proxy drives dot + ring, ring offset by π/2.
const dot = document.getElementById("rec-dot");
const ring = document.getElementById("rec-ring");
const pulse = { p: 0 };
tl.to(
  pulse,
  {
    p: Math.PI * 2 * PULSE_CYCLES,
    duration: TOTAL_DURATION,
    ease: "none", // sine handles the curve
    onUpdate: () => {
      const sD = 1 + Math.sin(pulse.p) * PULSE_DOT_AMP;
      const sR = 1 + Math.sin(pulse.p + Math.PI / 2) * PULSE_RING_AMP;
      dot.setAttribute("transform", `translate(60 60) scale(${sD}) translate(-60 -60)`);
      ring.setAttribute("transform", `translate(60 60) scale(${sR}) translate(-60 -60)`);
      ring.style.opacity = String(
        PULSE_RING_OPACITY_BASE + Math.sin(pulse.p) * PULSE_RING_OPACITY_AMP,
      );
    },
  },
  0,
);

// Pattern 4 — Dash flow. Linear offset tween on a dashed stroke.
const flowState = { offset: 0 };
tl.to(
  flowState,
  {
    offset: DASH_FLOW_TOTAL_OFFSET, // negative = L→R
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      document.getElementById("data-flow").style.strokeDashoffset = String(flowState.offset);
    },
  },
  0,
);
```

## Variations

- **Stroke draw → enrichment chain** — draw the outline first via [svg-path-draw](svg-path-draw.md) (phase 1, `0 → OUTLINE_DUR`), then start enrichment at `OUTLINE_DUR`: the icon "wakes up" after assembly.
- **Per-icon entry stagger** — for a row of icons, each icon's enrichment starts as it fades in, not synchronized.

## Values

| token                           | range                | notes                                                                                           |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| MIN_REVOLUTIONS                 | 0.5–2.0              | avoid integer revolutions if the end frame is visible (lands back at start)                     |
| SEC_REVOLUTIONS                 | 4–10                 | > MIN × 3 or the speed difference doesn't read                                                  |
| PULSE_CYCLES                    | 2–4 over a 3–5s comp | ≥5 reads as anxious flicker; ≤1 reads as forgotten                                              |
| PULSE_DOT_AMP                   | 0.05–0.20            | 0.05 = breathing; 0.20 = throbbing                                                              |
| PULSE_RING_AMP                  | 0.04–0.12            | must be < PULSE_DOT_AMP or the ring overshadows the dot                                         |
| PULSE_RING_OPACITY_BASE / \_AMP | 0.4–0.6 / 0.3–0.5    | BASE − AMP ≥ 0 and BASE + AMP ≤ 1                                                               |
| DASH_FLOW_TOTAL_OFFSET          | ±100–400             | must be an integer multiple of the dash period (dash + gap) or the end frame shows a phase jump |

## Critical Constraints

- **The transform-center gotcha above** — SVG `transform` attribute for any rotation/scale around an explicit interior point; never CSS `transform-origin` + `transform-box: fill-box` on thin lines or small inner shapes.
- **No `requestAnimationFrame`** — like CSS animation, it desyncs from HF's frame-by-frame seek; continuous motion lives inside the timeline as linear proxy tweens.
- **Amplitudes subtle** — icons are decorative, not headlines; calibrate rotation speed against composition length, not absolute time.
- **Phase-offset the parts** — minute vs second hand at different speeds, ring lagging dot by π/2. Pure sync looks mechanical.
- **`stroke-linecap: round`** on flowing/dashed lines for clean dash edges.
- **Climax dwell ≥1s** — if the enrichment is the headline beat, the composition continues ≥1s after the most dramatic moment.

## See also

`svg-path-draw` (outline draws first, enrichment second) · `orbit-3d-entry` (orbiting items are enriched icons) · `sine-wave-loop` (the whole icon floats while internal parts animate).
