/**
 * The oversized "Prince Caleb" that sits behind the whole site — the same
 * wordmark the footer ends on, held still in the viewport while the page
 * scrolls over it.
 *
 * It is fixed to the viewport at a negative z-index, so it paints above the
 * page's background but below every element in normal flow: sections that
 * carry their own opaque surface (the hero, the CTA, the footer) hide it
 * completely, the translucent ones let it through faintly, and the sections
 * with no background of their own show it in full. Nothing ever sits under
 * it, and it never takes a click or a caret.
 *
 * Colour and strength are the --brandmark token in globals.css: black in the
 * light theme, the accent green in the dark one.
 */
export function BrandWatermark() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 flex select-none items-center justify-center overflow-hidden"
    >
      <span className="block whitespace-nowrap text-[clamp(3.5rem,15vw,17rem)] font-extrabold leading-[0.82] tracking-[-0.045em] text-[var(--brandmark)]">
        Prince Caleb<span className="text-[var(--brandmark-dot)]">.</span>
      </span>
    </div>
  );
}
