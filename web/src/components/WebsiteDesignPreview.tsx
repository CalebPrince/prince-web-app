import Image from "next/image";

/**
 * The hero's right-hand panel: one image of website design work, shown as
 * supplied.
 *
 * The picture is prepared outside the app (a device mockup, a photograph of
 * the work on a desk, whatever reads best) and lives at
 * `web/public/images/hero-mockup.png`. Replacing that file is the whole
 * edit; nothing here crops it, frames it in fake browser chrome, or
 * decorates it.
 *
 * `unoptimized` is deliberate: the supplied file is served byte-for-byte
 * rather than re-encoded, so a transparent cutout keeps exactly the alpha it
 * was drawn with. A pass through the optimiser is what previously baked a
 * green halo into the background of this image. The cost is that the source
 * file's own weight is what visitors download, so prepare it at a sane size.
 */
export function WebsiteDesignPreview() {
  return (
    <div className="hero-device-composition rise" style={{ animationDelay: "0.4s" }}>
      <Image
        src="/images/hero-mockup.png"
        unoptimized
        alt="A website design shown on a laptop and a phone"
        width={1536}
        height={1024}
        className="hero-device-image"
        priority
      />
    </div>
  );
}
