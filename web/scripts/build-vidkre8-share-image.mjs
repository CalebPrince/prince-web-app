import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const publicDir = join(process.cwd(), "public");
const mediaDir = join(publicDir, "vidkre8", "videos");
const output = join(publicDir, "vidkre8", "vidkre8-share.jpg");

async function roundedPoster(name, width, height, radius) {
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp(join(mediaDir, name))
    .resize(width, height, { fit: "cover", position: "attention" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

const [logo, summit, fashion, solar] = await Promise.all([
  readFile(join(publicDir, "vidkre8", "logo.svg")),
  roundedPoster("websummit-2026.jpg", 274, 420, 24),
  roundedPoster("fashion.jpg", 274, 420, 24),
  roundedPoster("solar.jpg", 274, 420, 24),
]);

const artwork = Buffer.from(`
  <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#070a0d"/><stop offset="0.58" stop-color="#10171a"/><stop offset="1" stop-color="#07130d"/></linearGradient>
      <radialGradient id="glow" cx="0.72" cy="0.48" r="0.65"><stop offset="0" stop-color="#2fe383" stop-opacity="0.22"/><stop offset="1" stop-color="#2fe383" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/><rect width="1200" height="630" fill="url(#glow)"/>
    <path d="M72 191H486" stroke="#2fe383" stroke-width="3"/>
    <text x="72" y="244" fill="#f6f8f7" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" letter-spacing="-2">Make them stop.</text>
    <text x="72" y="310" fill="#f6f8f7" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="700" letter-spacing="-2">Give them a story.</text>
    <text x="72" y="374" fill="#a9b2bc" font-family="Arial, Helvetica, sans-serif" font-size="24">Video ads · product films · motion graphics</text>
    <text x="72" y="526" fill="#42f095" font-family="Consolas, monospace" font-size="17" font-weight="700" letter-spacing="3">PRINCECALEB.DEV/VIDKRE8</text>
    <rect x="70" y="558" width="416" height="1" fill="#fff" opacity="0.14"/><rect x="70" y="80" width="414" height="1" fill="#fff" opacity="0.14"/>
    <rect x="542" y="78" width="586" height="474" rx="32" fill="#fff" opacity="0.05"/><rect x="542" y="78" width="586" height="474" rx="32" fill="none" stroke="#fff" stroke-opacity="0.12"/>
    <text x="1092" y="587" text-anchor="end" fill="#a9b2bc" font-family="Consolas, monospace" font-size="14" letter-spacing="2">IDEAS INTO FRAMES</text>
  </svg>`);

await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#070a0d" } })
  .composite([
    { input: artwork, left: 0, top: 0 },
    { input: await sharp(logo).resize({ width: 300 }).png().toBuffer(), left: 70, top: 92 },
    { input: summit, left: 570, top: 104 },
    { input: fashion, left: 854, top: 104 },
    { input: solar, left: 712, top: 104 },
  ])
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(output);

console.log(output);
