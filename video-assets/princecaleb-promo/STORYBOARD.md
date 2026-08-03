---
format: 1920x1080
duration: 37s
message: "Prince Caleb builds AI systems that end the overwhelm — voice agents and automations that run the business while you don't have to."
arc: PAS (pain/overwhelm → relief/product intro → feature proof x2 → social proof → CTA) with feature-benefit progression
audience: small business owners in Ghana & remote clients overwhelmed by missed calls, manual busywork, and juggling too many tools
mode: autonomous
music: none
---

## Video direction

- **Palette system** (from `frame.md`, Blue-Professional remix): warm cream ground (`bg` #fbfbfa) on every frame; single pine-green accent (`primary` #08783c) carries every eyebrow, numeral, CTA, glow, and progress element; near-black ink (`text` #17181c) for headlines — never accent-colored; muted gray (`text-muted` #6e737c) for body/support copy. Cards are soft-tinted (4% accent fill, 20% accent border, 10–14px radius) — **no shadows anywhere**. Pill chrome (100px radius) for CTA/tag elements.
- **Motion grammar + reveal model**: `power3` long-tail settles everywhere — no bounce, no overshoot, no `back.out`/`elastic.out`. Every frame reveals paced to its voiceover cue — nothing appears before the VO says it, and each frame's later ~50% carries the reveal weight, never a front-loaded dump.
- **Rhythm / held-frame allocation**: Frame 2's brand-wordmark landing and Frame 6's final URL card are the deliberate held/breather beats (settle-and-hold, at most subtle jitter). Frames 3 and 4 (the two feature proofs) carry the most continuous on-screen development since they're workflow demonstrations. Frame 5 holds on its final stat card.
- **Negative list**: no drop shadows (tinted-card system only); no bouncy/elastic easing; no slideshow front-loading (everything dumped in the first 25%); no screensaver independent-floating elements; no real browser chrome, scrollbars, or literal cursor besides the one stylized brand cursor in Frame 3; no fabricated numerals beyond the real captured stats (10+ years, 30+ systems, 98% satisfaction); no purple-blue generic "AI" gradient clichés.

## Frame 1 — Overwhelm

- scene: Recognizable everyday tools (phone ringing, inbox, chat bubbles, task list) pile in and surround the frame, typography-led
- voiceover: "Missed calls. Buried inboxes. A dozen tabs — and somehow, it's all still on you."
- duration: 5.504s
- transition_in: cut
- status: animated
- src: compositions/frames/01-overwhelm.html
- type: hook
- persuasion: Pain agitation
- beat: overwhelm
- blueprint: kinetic-type-beats (Adapt — Problem variant, overriding Step 3's overwhelm-surround candidate: that shape's min duration and avatar-morph don't fit this frame's short, corporate-register 3-clause VO)
- asset_candidates:

Adapt: keep the "each pain line lands alone, prior clears before next" signature; 3 windows for 3 spoken clauses, no product/avatar yet.

Scene 1 (0.0–1.3s): solid cream ground (`bg`). "Missed calls." lands dead-center via per-word staggered reveal, near-black `text` — Centered template, ~35% of frame, deep negative space around it.
Scene 2 (1.3–2.6s): "Missed calls." clears (motion-blur fly-off); "Buried inboxes." lands center via the same reveal, same weight and position — Centered, no layout shift.
Scene 3 (2.6–4.0s): "Buried inboxes." clears; the final clause "A dozen tabs — and somehow, it's all still on you." reveals left→right with a leading-edge blur, phrase-segmented so "a dozen tabs" lands first and "it's all still on you" resolves last, in `text-muted` gray stepping to near-black on the last phrase for emphasis — Centered, holds static to frame end (no further motion).

narrativeRole: Opens on the viewer's own daily friction — no product yet, pure recognition.
keyMessage: You're buried under work that should be automatic.

## Frame 2 — Product intro

- scene: Chaos clears into a clean canvas; "Prince Caleb" wordmark assembles center-frame
- voiceover: "Meet the AI systems built to run it — so you don't have to."
- duration: 3.904s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/02-product-intro.html
- type: product_intro
- persuasion: Negative contrast
- beat: relief
- blueprint: kinetic-type-beats (Reproduce — Product_Intro fixed-line variant)
- asset_candidates:

Scene 1 (0.0–2.5s): solid cream ground. "Meet the AI systems built to run it —" builds phrase-by-phrase (per-word staggered reveal, smooth long-tail settle), near-black `text`, centered, ~45% of frame.
Scene 2 (2.5–3.2s): "so you don't have to." completes the sentence beneath it, in `primary` accent green — the one color beat of the frame, landing exactly on the VO's closing clause.
Scene 3 (3.2–4.0s): the sentence clears (scale-down + fade); the wordmark "Prince Caleb." pops in dead-center in `text` with a small accent-green accent-line above it (60×4, per `frame.md`'s accent-line component) — settles and holds, no further motion.

narrativeRole: The turn — names the fix right after the pain lands.
keyMessage: One system, built for exactly this.

## Frame 3 — AI Voice Agents

- scene: A stylized live-call UI card (matching the site's own Lisa voice-agent widget copy) shows a call coming in, getting answered, and a booking confirmed
- voiceover: "Lisa answers every call, books the appointment, and hands off the moment it matters."
- duration: 5.419s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-voice-agents.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: control
- blueprint: cursor-ui-demo (Reproduce — Key_Feature static-stage tour variant: cursor-app-state-tour)
- asset_candidates:

Scene 1 (0.0–2.0s): a call-incoming UI card (tinted card, `card-bg`/`border` per `frame.md`) arrives centered over cream ground — "Lisa · AI voice agent" label, an incoming-call indicator pulsing. A small labeled brand-green cursor enters from off-frame and glides toward the card, locked camera — Centered, ~40% of frame.
Scene 2 (2.0–4.0s): as the VO says "books the appointment," the cursor's click triggers a hard element swap: the call card morphs into a booking-confirmation card (side-panel slide-in from the right) — a calendar slot fills with a checkmark, "Appointment held" label lands.
Scene 3 (4.0–6.0s): as the VO says "hands off the moment it matters," a third state pops in beside it — a small staff/human-handoff badge (icon + "Escalated to Prince" label) spring-pops in; camera settles static, holds to frame end.

narrativeRole: First proof beat — the product doing its core job, end to end.
keyMessage: Every call gets answered, automatically.

## Frame 4 — Business Automations

- scene: A findings card cascades in on the cream ground — work items landing and checking off
- voiceover: "Agents that qualify leads, draft the follow-up, and report back — every single day."
- duration: 5.909s
- transition_in: push-slide LEFT
- status: animated
- src: compositions/frames/04-automations.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: relief + control
- blueprint: agent-progress-theater (Adapt — Key_Feature checklist/findings variant; the originally-planned `assets/ai-demo.mp4` was dropped after review — it turned out to be generic stock dashboard footage with illegible placeholder UI, not real princecaleb.dev product screens, and using it as "proof" would have been misleading. Also its hoisted host-level stacking (`data-track-index: 4000`) was painting over the card entirely. The checklist card now carries the beat on its own.)
- asset_candidates:

Adapt: keep the "receipt cascades in, rows mutate to checked mid-run" signature on a plain cream ground (no video) — consistent with the rest of the video's clean typographic/card language.
Scene 1 (0.3–1.5s): the findings card spring-pops in centered on the cream ground.
Scene 2 (1.5–3.5s): rows cascade in one by one (slide-up + fade, staggered), paced to the VO's own clauses: "Qualify new lead" (on "qualify leads"), "Draft follow-up" (on "draft the follow-up"), "Report back" (on "report back") — each with a number badge, tinted card per `frame.md`.
Scene 3 (3.5–6.0s): as the VO reaches "every single day," the state mutation runs — badges flip from numbered outline to solid `primary`-green circle + white checkmark (scale bounce), checked labels strike through; end the run mid-list (2 of 3 checked) so the work reads as visibly ongoing — holds.

narrativeRole: Second proof beat — the system working unattended.
keyMessage: The busywork runs itself, and reports back.

## Frame 5 — Proof

- scene: Stat counters (years, systems shipped, satisfaction) alongside quick flashes of real shipped systems, including a website build
- voiceover: "10-plus years building software. 30-plus systems shipped. 98% client satisfaction. Voice agents, automations — even the website itself."
- duration: 11.093s
- transition_in: zoom-through
- status: animated
- src: compositions/frames/05-proof.html
- type: social_proof
- persuasion: Statistical proof
- beat: trust
- blueprint: dataviz-countup (Adapt — Product_Intro scroll-to-hero variant, dropping the hook-orb opener since Frame 1 already served the hook; the "product cards" are the three real shipped systems)
- asset_candidates: assets/lumen-system-interface.png — real shipped product, dark-theme landing page; assets/simply-my-care-system-interface.png — real shipped client portal; assets/andson-travel-consult-system-interface.png — real shipped travel-consult site
- roles: lumen-system-interface.png = cutout (product card 1) · simply-my-care-system-interface.png = cutout (product card 2) · andson-travel-consult-system-interface.png = cutout (product card 3, the "website" proof)

Adapt: keep the tilted-grid → camera-scroll → hero-metric-centers signature; skip the Scene-0 hook-orb (already spent in Frame 1); the tilted cards are the three real screenshots instead of generic data-viz cards.
Scene 1 (0.0–2.0s): a perspective-tilted grid of the three real system cards (`lumen`, `simply-my-care`, `andson-travel-consult`) establishes, held static, as "10-plus years building software." lands as a small `caption-mono` label top-left — asymmetric 60/40, 3 depth layers.
Scene 2 (2.0–3.5s): as the VO says "30-plus systems shipped," the grid begins a slow directional scroll; a `stat-num` counter for "30+" counts up beside the cards in `primary` accent.
Scene 3 (3.5–5.0s): the grid scrolls further so the andson-travel-consult card (the "website" proof) glides toward center as off-center cards slide away; a hero stat card "98% client satisfaction" centers with an accent glow bloom behind it, its number counting 0→98% on the VO's "98% client satisfaction" — Centered, hero ~40% of frame.
(Scene 3 continues to frame end, 5.0s): as the VO closes "Voice agents, automations — even the website itself," a small caption-mono line reading "Websites & mobile apps too" fades in beneath the hero card, tying directly to the visible andson-travel-consult card — settles, holds.

narrativeRole: Earns trust with real numbers and real shipped work before the ask.
keyMessage: This isn't a concept — it's already running for real clients.

## Frame 6 — CTA

- scene: Calm end card — "Have a project in mind?" headline, CTA button, princecaleb.dev wordmark
- voiceover: "Have a project in mind? Let's build the system that runs it. princecaleb.dev."
- duration: 5.227s
- transition_in: crossfade
- status: animated
- src: compositions/frames/06-cta.html
- type: cta
- persuasion: Low-friction invitation
- beat: confidence
- blueprint: titlecard-reveal (Reproduce — CTA card-chain variant: hard-cut-card-stack-to-logo)
- asset_candidates:

Scene 1 (0.0–1.8s): card 1 — "Have a project in mind?" fades in centered on cream ground, scaling ~95%→100% on a smooth ease-out; holds briefly — Centered, calm, ~50% negative space.
Scene 2 (1.8–3.2s): instant hard cut (full opacity, no crossfade) to card 2 — "Let's build the system that runs it." lands centered in `text`, with a solid `primary`-green pill CTA button ("Book a discovery call") beneath it per `frame.md`'s cta-button component.
Scene 3 (3.2–5.0s): instant hard cut to card 3, the terminal card — "Prince Caleb." wordmark centered with an accent-line above it, "princecaleb.dev" in `primary` beneath — held static to the final frame, at most a barely-perceptible slow scale-up across the hold.

narrativeRole: Closes on the direct, low-pressure invitation from the site's own final CTA copy.
keyMessage: Start the conversation — princecaleb.dev.
