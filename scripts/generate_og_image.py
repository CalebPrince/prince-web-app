"""One-off generator for the site's default Open Graph share image.
Run: python scripts/generate_og_image.py
Writes public/uploads/og-image.png (1200x630, brand palette).
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math

W, H = 1200, 630
INK = (15, 23, 42)
ACCENT = (79, 70, 229)
ACCENT_STRONG = (67, 56, 202)
NAVY = (11, 18, 32)
NAVY_SOFT = (17, 26, 46)
WHITE = (255, 255, 255)

FONT_DIR = "C:/Windows/Fonts/"


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)


img = Image.new("RGB", (W, H), NAVY)
draw = ImageDraw.Draw(img)

# Diagonal gradient background, navy -> deep indigo
for y in range(H):
    t = y / H
    r = int(NAVY[0] + (ACCENT_STRONG[0] - NAVY[0]) * t * 0.55)
    g = int(NAVY[1] + (ACCENT_STRONG[1] - NAVY[1]) * t * 0.55)
    b = int(NAVY[2] + (ACCENT_STRONG[2] - NAVY[2]) * t * 0.55)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Soft glow blobs (drawn on a separate layer then blurred, then composited)
glow = Image.new("RGB", (W, H), (0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.ellipse([850, -120, 1400, 380], fill=(79, 70, 229))
glow_draw.ellipse([-150, 380, 350, 830], fill=(99, 102, 241))
glow = glow.filter(ImageFilter.GaussianBlur(90))
img = Image.blend(img, glow, 0.35)
draw = ImageDraw.Draw(img)

# Constellation motif (top-right), echoing bio-abstract.svg
nodes = [(950, 90), (1080, 150), (1010, 240), (1130, 260)]
for a, b in [(0, 1), (1, 2), (1, 3)]:
    draw.line([nodes[a], nodes[b]], fill=(129, 140, 248), width=2)
for i, (x, y) in enumerate(nodes):
    r = 6 if i != 1 else 8
    fill = ACCENT_STRONG if i == 1 else (165, 180, 252)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=fill)

# Brand wordmark
draw.text((80, 70), "Prince Caleb", font=font("seguisb.ttf", 34), fill=WHITE)
dot_x = 80 + draw.textlength("Prince Caleb", font=font("seguisb.ttf", 34))
draw.text((dot_x + 2, 70), ".", font=font("seguisb.ttf", 34), fill=(165, 180, 252))

# Headline
headline_font = font("seguisb.ttf", 64)
draw.text((80, 220), "Custom software,", font=headline_font, fill=WHITE)
draw.text((80, 300), "built to perform.", font=headline_font, fill=(199, 210, 254))

# Subtitle
draw.text((80, 400), "Web & Mobile App Developer — princecaleb.dev",
          font=font("segoeui.ttf", 26), fill=(203, 213, 225))

# Tech badge pills
badges = ["PHP", "JavaScript", "React", "React Native", "AI Integrations"]
x = 80
y = 460
pill_font = font("segoeui.ttf", 20)
for label in badges:
    tw = draw.textlength(label, font=pill_font)
    pad = 18
    pill_w = tw + pad * 2
    pill_h = 40
    draw.rounded_rectangle([x, y, x + pill_w, y + pill_h], radius=20,
                            outline=(129, 140, 248), width=1)
    draw.text((x + pad, y + 9), label, font=pill_font, fill=(224, 231, 255))
    x += pill_w + 14

img.save("public/uploads/og-image.png")
print("Saved public/uploads/og-image.png", img.size)
