"""One-off generator for the site's default Open Graph share image.
Run: python scripts/generate_og_image.py
Writes public/uploads/og-image.png (1200x630).

Palette matches the monochrome editorial redesign — ink black background,
near-white type, no hue. The constellation motif deliberately echoes the
WebGL hero (public/js/hero-3d.js).
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1200, 630

# Monochrome dark palette (mirrors [data-theme="dark"] in css/app.css)
BG = (11, 12, 14)          # --bg
BG_HI = (23, 24, 28)       # --ink (used as a subtle lift)
WHITE = (255, 255, 255)    # --heading-color
INK = (232, 234, 237)      # --ink
INK_SOFT = (180, 184, 191) # --ink-soft
MUTED = (138, 143, 152)    # --muted
LINE = (58, 60, 66)        # subtle hairline

FONT_DIR = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)


img = Image.new("RGB", (W, H), BG)
draw = ImageDraw.Draw(img)

# Very subtle top-to-bottom lift so the flat black isn't dead.
for y in range(H):
    t = y / H
    r = int(BG[0] + (BG_HI[0] - BG[0]) * t * 0.6)
    g = int(BG[1] + (BG_HI[1] - BG[1]) * t * 0.6)
    b = int(BG[2] + (BG_HI[2] - BG[2]) * t * 0.6)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Faint grayscale glow, top-right, blurred — same corner as the hero scene.
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
gd.ellipse([880, -160, 1440, 360], fill=(70, 72, 78))
glow = glow.filter(ImageFilter.GaussianBlur(110))
img = Image.blend(img, glow, 0.5)
draw = ImageDraw.Draw(img)

# Constellation motif (top-right), monochrome — echoes hero-3d.js.
nodes = [(946, 96), (1082, 150), (1006, 250), (1132, 268)]
for a, b in [(0, 1), (1, 2), (1, 3)]:
    draw.line([nodes[a], nodes[b]], fill=(96, 99, 106), width=2)
for i, (x, y) in enumerate(nodes):
    r = 6 if i != 1 else 9
    fill = INK if i == 1 else (150, 154, 162)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)

# Brand wordmark — "Prince Caleb" white, the "." in near-white ink accent
# (matching the site, where the dot is var(--accent), not a hue).
wm_font = font("seguisb.ttf", 34)
draw.text((80, 68), "Prince Caleb", font=wm_font, fill=WHITE)
dot_x = 80 + draw.textlength("Prince Caleb", font=wm_font)
draw.text((dot_x + 2, 68), ".", font=wm_font, fill=INK)

# Headline
headline_font = font("seguisb.ttf", 64)
draw.text((80, 218), "Custom software,", font=headline_font, fill=WHITE)
draw.text((80, 298), "built to perform.", font=headline_font, fill=INK_SOFT)

# Subtitle
draw.text((80, 400), "Web & Mobile App Developer — princecaleb.dev",
          font=font("segoeui.ttf", 26), fill=MUTED)

# Tech badge pills — outlined hairline, no fill (monochrome chrome).
badges = ["PHP", "JavaScript", "React", "React Native", "AI Integrations"]
x, y = 80, 460
pill_font = font("segoeui.ttf", 20)
for label in badges:
    tw = draw.textlength(label, font=pill_font)
    pad = 18
    pill_w = tw + pad * 2
    draw.rounded_rectangle([x, y, x + pill_w, y + 40], radius=20,
                           outline=LINE, width=1)
    draw.text((x + pad, y + 9), label, font=pill_font, fill=INK_SOFT)
    x += pill_w + 14

os.makedirs("public/uploads", exist_ok=True)
img.save("public/uploads/og-image.png")
print("Saved public/uploads/og-image.png", img.size)
