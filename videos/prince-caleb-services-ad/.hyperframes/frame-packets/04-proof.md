# Frame packet: 04-proof

## Project inputs

- Project: D:\Websites\prince-web-app\videos\prince-caleb-services-ad
- Design tokens: D:\Websites\prince-web-app\videos\prince-caleb-services-ad\frame.md
- RULES_DIR: C:\Users\User\.agents\skills\hyperframes-animation\rules

## Assigned storyboard block

## Frame 4 — Proof you can inspect

- scene: Real workflow, operational record, and site proof panels race through a device window while status labels lock green.
- voiceover: "The workflows are live. The handoffs are visible. The proof is here to inspect."
- duration: 7s
- transition_in: squeeze
- status: outline
- src: compositions/frames/04-proof.html
- type: social_proof
- persuasion: Verifiable evidence
- beat: trust + certainty
- blueprint: video-text-pivot
- asset_candidates: assets/builder-os-workflow.png — real Builder OS workflow playground; assets/services-proof.png — real “This site runs the systems it sells” proof section; assets/home-proof-stats.png — real homepage proof figures

narrativeRole: Answer skepticism with inspectable working surfaces and operational evidence.
keyMessage: Every claim is grounded in a live system.

- focal: assets/services-proof.png
- roles: builder-os-workflow = cutout; services-proof = cutout; home-proof-stats = supporting
- sfx: fast page swipe, three verification ticks

Adapt: keep the product-to-impact pivot; the impact is inspectability rather than an invented metric.
Scene 1 (0.0–1.8s): Builder OS workflow capture arrives as a full-height card with a quick 3D page-scroll to the active request panel; label “WORKFLOW / LIVE” locks at the top.
Scene 2 (1.8–3.4s): card slides left into a 60/40 split and the services proof capture enters right as “HANDOFFS / VISIBLE” reveals.
Scene 3 (3.4–5.2s): both surfaces compress upward; the real proof-stat capture rises beneath them and three thin verification bars fill in sequence.
Scene 4 (5.2–6.3s): UI cluster darkens slightly while “PROOF YOU CAN INSPECT.” slams across the upper-center in electric green.
Scene 5 (6.3–7.0s): text and real surfaces hold absolutely still for the video’s inspection beat.

## Selected blueprint: video-text-pivot

# video-text-pivot — Video → Text Pivot

**intent**: A product video holds center and claims attention, then slides aside to hand its weight to a hero stat in the space it vacates, then both clear and kinetic text types into the center — accent words carrying the meaning the video used to carry — sealed by a gradient pill. The arc is "show → yield → pivot → stamp," and each handoff pairs an exit with a same-anchor entrance so two beats read, not four.

**roles served**

- Product_Intro (from `metric-video-text-pivot`): when the open is "see the feature" then "see the impact" and the `[product video]` must stay visible through the stat reveal — it slides, it doesn't cut.
- Key_Feature: a feature clip that yields to a frame-filling metric and a typographic impact line.

**duration**: 6–8s

**shot structure** (a `[bg]` canvas; one `[product video]` as a real muted `.mp4` clip, a hero stat, then kinetic text — each pair shares a screen anchor so the handoff reads as a weight-transfer)

- **Scene 1 (0.0–~1.6s) — the video shows.** The `[product video]` lands centered on a smooth scale-up and breathes (a small y-bob), claiming full attention. Camera static.
- **Scene 2 (~1.6–3.2s) — yield + stat (signature move).** The video SLIDES aside (x + scale down) **into the very space** the `[hero stat]` now fills as the stat pops in with 3D-depth type — one weight-transfer reading as a single event, not two. The stat breathes within this window.
- **Scene 3 (~3.2–5.0s) — pivot to text.** Both video and stat clear out and kinetic `[impact text]` TYPES into the vacated center, character by character; its `[accent words]` carry the meaning the video used to carry.
- **Scene 4 (~5.0–end) — stamp.** A gradient `[pill]` snaps shut around the closing line (`scaleX` 0→1), its glow halo resolving a beat behind so the silhouette reads before the bloom — sealing the statement as one graphic. Holds.

**motion vocabulary**: video scale-in + small breath; weight-transfer slide (video x + scale-down handing off to the stat at the same anchor); 3D-depth stat type; character-stream typing; gradient pill scaleX-snap; glow-halo bloom trailing the silhouette.

**rule mapping**

- video entrance (smooth) and the weight-transfer slide → `gsap-effects` (scale/opacity then x + scale on a long-tail `power3`); the video itself is a muted `<video class="clip">` direct child of the root
- hero stat's frame-filling 3D type → `3d-text-depth-layers` (static-depth variation — layers built at setup, no cascade fighting the entry)
- the same-anchor video-exit ↔ stat-entry handoff (if treated as a morph) → `scale-swap-transition` (shared center)
- character-by-character impact typing through segmented spans → `dynamic-content-sequencing` (clean character stream) or `discrete-text-sequence`
- pill `scaleX` snap + trailing glow halo → `gsap-effects` (scaleX) + `ambient-glow-bloom` (the halo, resolving a beat behind)
- video / stat breath within their windows → `sine-wave-loop` (low-amplitude register — subtle jitter, gated to each element's window, never a forever loop)

**camera modifier**: camera-static — all motion is element-space (the video translates), so the "pivot" is the elements moving, not a camera.
