"""Generates a per-post Open Graph share card for every blog post.
Run: python scripts/generate_blog_og_images.py
Writes public/uploads/og/blog/{slug}.png (1200x630) for each post.

Source is database/blog_posts_data.php (via a tiny PHP shim), the same
canonical dataset that generate_blog_covers.php and seed_blog_posts.php use —
so the cards always match what gets seeded to production, rather than drifting
from a local dev DB that may carry unsaved admin edits.

Why PNG cards instead of the posts' SVG covers: social crawlers (Facebook,
LinkedIn, X) don't reliably render SVG as og:image, and they don't run the
client-side JS that swaps the cover in — so a shared post needs a real
raster card that the server points at (see public/og-render.php).

Palette matches the monochrome editorial redesign. Re-run this after editing
blog_posts_data.php (same cadence as generate_blog_covers.php), then commit
the PNGs — they deploy as static files, so the server needs no Python/PIL.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import subprocess
import json
import os

W, H = 1200, 630
MARGIN = 80

BG = (11, 12, 14)
BG_HI = (23, 24, 28)
WHITE = (255, 255, 255)
INK = (232, 234, 237)
INK_SOFT = (180, 184, 191)
MUTED = (138, 143, 152)
LINE = (58, 60, 66)

FONT_DIR = "C:/Windows/Fonts/"
OUT_DIR = "public/uploads/og/blog"

# Pull slug/title/category from the canonical PHP dataset via a one-line shim.
PHP_DUMP = (
    'require "database/blog_posts_data.php";'
    ' $o=[]; foreach (BLOG_POSTS as $p) {'
    ' $o[] = ["slug"=>$p["slug"], "title"=>$p["title"],'
    ' "category"=>CATEGORY_META[$p["category_key"]] ?? ""]; }'
    ' echo json_encode($o);'
)


def load_posts():
    out = subprocess.run(["php", "-r", PHP_DUMP], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def font(name, size):
    return ImageFont.truetype(FONT_DIR + name, size)


def wrap(draw, text, fnt, max_w):
    """Greedy word-wrap to a pixel width. Returns a list of lines."""
    words = text.split()
    lines, line = [], ""
    for w in words:
        trial = (line + " " + w).strip()
        if draw.textlength(trial, font=fnt) <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def base_canvas():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(
            int(BG[0] + (BG_HI[0] - BG[0]) * t * 0.6),
            int(BG[1] + (BG_HI[1] - BG[1]) * t * 0.6),
            int(BG[2] + (BG_HI[2] - BG[2]) * t * 0.6),
        ))
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([900, -180, 1460, 340], fill=(66, 68, 74))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, glow, 0.45)
    return img


def render_card(slug, title, category):
    img = base_canvas()
    draw = ImageDraw.Draw(img)

    # Small constellation accent, top-right, echoing the hero / default card.
    nodes = [(1000, 92), (1096, 138), (1050, 214)]
    for a, b in [(0, 1), (1, 2)]:
        draw.line([nodes[a], nodes[b]], fill=(90, 93, 100), width=2)
    for i, (x, y) in enumerate(nodes):
        r = 5 if i != 1 else 8
        draw.ellipse([x - r, y - r, x + r, y + r],
                     fill=INK if i == 1 else (140, 144, 152))

    # Brand wordmark
    wm = font("seguisb.ttf", 30)
    draw.text((MARGIN, 66), "Prince Caleb", font=wm, fill=WHITE)
    dx = MARGIN + draw.textlength("Prince Caleb", font=wm)
    draw.text((dx + 2, 66), ".", font=wm, fill=INK)

    # Category eyebrow
    if category:
        draw.text((MARGIN, 150), "// " + category.upper(),
                  font=font("seguisb.ttf", 22), fill=MUTED)

    # Title — fit by shrinking the font until <= 4 lines fit the text column.
    max_w = W - MARGIN * 2
    size = 62
    while size >= 40:
        tfnt = font("seguisb.ttf", size)
        lines = wrap(draw, title, tfnt, max_w)
        if len(lines) <= 4:
            break
        size -= 4
    lines = lines[:4]
    line_h = size + 14
    y = 210
    for ln in lines:
        draw.text((MARGIN, y), ln, font=tfnt, fill=INK)
        y += line_h

    # Footer meta, pinned to the bottom
    draw.line([(MARGIN, H - 96), (W - MARGIN, H - 96)], fill=LINE, width=1)
    draw.text((MARGIN, H - 74), "princecaleb.dev  ·  Technical Archive",
              font=font("segoeui.ttf", 24), fill=MUTED)

    os.makedirs(OUT_DIR, exist_ok=True)
    # Monochrome cards need very few distinct tones; a 128-color palette is
    # visually identical here but roughly halves the file size — these ship in
    # the repo and sync over FTP, so smaller is better.
    img = img.quantize(colors=128, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(os.path.join(OUT_DIR, slug + ".png"), optimize=True)


def main():
    posts = load_posts()
    for p in posts:
        render_card(p["slug"], p["title"], p.get("category") or "")
    print(f"Wrote {len(posts)} blog OG cards to {OUT_DIR}/")


if __name__ == "__main__":
    main()
