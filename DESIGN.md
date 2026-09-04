# Prince Caleb Website Design System

## Direction

Prince Caleb is a premium digital product studio for ambitious Ghanaian and international businesses. The website's primary job is to turn confidence in the work into qualified project conversations. Its visual character is precise, calm, technical, and human: editorial restraint with a vivid green signal color.

The interface follows Apple-caliber principles—clarity, legibility, comfortable controls, meaningful depth, and responsive motion—without imitating Apple product pages or proprietary UI.

## Color

- Ink / dark canvas: `#0B0C0E`
- Dark surface: `#121418`
- Paper canvas: `#FBFBFA`
- Primary text on dark: `#F1F3F5`
- Signal green: `#62FF98` (dark) / `#08783C` (light)
- Hairlines: theme-aware, low-contrast 1px strokes

Accent is reserved for primary actions, current state, focus, and small signal details. Long-form text stays neutral.

## Typography

Use the native Apple-compatible system stack for every interface and marketing surface:

```css
-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Segoe UI", sans-serif
```

This renders San Francisco on Apple devices and the native UI face elsewhere without redistributing Apple's proprietary fonts. Code and machine data use `ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace`.

- Display: 700–800 weight, `0.96–1.05` line height, tightened tracking only above 32px.
- Titles: 600–700 weight, `1.1–1.2` line height.
- Body: 400 weight, `1.55–1.7` line height, maximum reading width `68ch`.
- UI labels and buttons: 600 weight, sentence case, no decorative uppercase.
- Metadata may use mono, but never for ordinary navigation or prose.

## Layout and surfaces

- Content max width: `80rem`; reading width: `68ch`.
- Section spacing: fluid from `4rem` on phones to `8rem` on wide screens.
- Base radius: `12px`; compact controls: `10px`; pill shapes only when semantically useful.
- Prefer hairline borders and material separation to heavy shadows.
- Page, card, and navigation surfaces are opaque. Transparency is reserved for functional overlays such as modal scrims.

## Controls

- Standard control height: `44px`; large: `52px`; compact: minimum `36px` and never used for primary mobile actions.
- Icon-only controls retain a `44 × 44px` hit area and an accessible name.
- Button labels are sentence case, semibold, and action-specific.
- Primary buttons use signal green; secondary buttons use a quiet surface and hairline border; ghost buttons are reserved for low-emphasis actions.
- Hover uses small color/elevation changes. Press uses a subtle `0.98` scale. Focus is a visible 2px accent ring with offset.

## Motion and accessibility

- Standard transition: `180ms cubic-bezier(0.25, 0.1, 0.25, 1)`.
- Entrances may use the existing expressive ease but must not delay interaction.
- `prefers-reduced-motion: reduce` disables smooth scrolling, transforms, and nonessential animation.
- Text remains selectable and scalable; essential copy never lives only in images.
- Text and controls meet WCAG AA contrast.

## Icons and assets

Use Lucide for general web interface icons at a consistent optical size and stroke. SF Symbols are not bundled for the website. Brand marks must come from approved source assets and must not be redrawn or used to imply endorsement.
