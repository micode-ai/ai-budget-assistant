# -*- coding: utf-8 -*-
"""
Single "benefit" story (9:16 + 4:5) for the AI universal bank-statement import
(ABA-390/391): the three hooks (a bank that is not on the list still imports,
how many rows one statement produced, which formats are covered) as bold stat
cards on the house-style warm-dark gradient + orange glow. No phone bezel — the
message is the hero. No emoji (text-only so Windows fonts render clean).

COPY ACCURACY — do not "improve" these claims:
  * "dowolny" mirrors the app's own menu row "Rozpoznaj automatycznie (dowolny
    bank)". Do not escalate it to "kazdy bank swiata".
  * Column inference from CSV/XLSX is free; PDF extraction is Pro — hence the
    third card spells out "PDF w planie Pro" instead of implying all formats
    are free.
  * "77" is the real count from the captured preview screen, not a round
    marketing number. If the screenshot is ever replaced, change this too.
  * The import is never promised to be complete — the app itself warns when it
    cannot reconcile a closing balance. Do not add a "wszystko" claim.

Outputs in docs/marketing/creatives/ai-import/renders/pl/:
    ai-import-story.png        1080x1920
    ai-import-story-4x5.png    1080x1344

Usage:
    python build_ai_import_story.py          # 9:16
    python build_ai_import_story.py 4:5
    python build_ai_import_story.py both
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK    = os.path.dirname(SCRIPT_DIR)
FEATURE_DIR = "ai-import"
BASENAME = "ai-import"
OUT   = os.path.join(MK, "creatives", FEATURE_DIR, "renders", "pl")
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON  = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"   # bold
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"    # semibold
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"    # regular
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)
CARD   = (30, 30, 36)
CARD_LINE = (60, 60, 70)

EYEBROW  = "IMPORT Z AI"
HEADLINE = "Import z dowolnego banku"
SUBTITLE = "AI rozpozna kolumny w Twoim wyciągu"
CTA      = "Ustawienia → Importuj transakcje"
FOOTER_URL = "ai-budget.pl"

# (tag, big value, descriptor)
# Keep the big value SHORT (<= ~9 glyphs at 92px) — a longer string crowds the
# descriptor line underneath it.
CARDS = [
    ("TWÓJ BANK",    "dowolny",  "nawet gdy nie ma go na liście"),
    ("JEDEN WYCIĄG", "77",       "transakcji rozpoznanych naraz"),
    ("FORMATY",      "CSV XLSX", "oraz PDF w planie Pro"),
]


def tw(draw, s, font):
    return draw.textlength(s, font=font)


def centered(draw, y, s, font, fill):
    draw.text(((W - tw(draw, s, font)) / 2, y), s, font=font, fill=fill)


def spaced(draw, y, s, font, fill, gap):
    total = sum(tw(draw, ch, font) + gap for ch in s) - gap
    x = (W - total) / 2
    for ch in s:
        draw.text((x, y), ch, font=font, fill=fill)
        x += tw(draw, ch, font) + gap


def vgradient(c0, c1):
    base = Image.new("RGB", (W, H), c0)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(c0[i] + (c1[i]-c0[i])*t) for i in range(3)))
    return base.convert("RGBA")


def add_glow(canvas, center, radii, color, alpha, blur):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = center; rx, ry = radii
    ImageDraw.Draw(layer).ellipse([cx-rx, cy-ry, cx+rx, cy+ry], fill=color + (alpha,))
    return Image.alpha_composite(canvas, layer.filter(ImageFilter.GaussianBlur(blur)))


def circle_img(img, size):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size-1, size-1], fill=255)
    img.putalpha(mask)
    return img


def stat_card(draw, x0, y, cw, ch, tag, big, sub, tagf, bigf, subf, big_f=0.28):
    draw.rounded_rectangle([x0, y, x0 + cw, y + ch], radius=34, fill=CARD)
    draw.rounded_rectangle([x0, y, x0 + cw, y + ch], radius=34, outline=CARD_LINE, width=2)
    draw.rounded_rectangle([x0, y + 16, x0 + 14, y + ch - 16], radius=7, fill=ORANGE)
    tx = x0 + 54
    draw.text((tx, y + int(ch * 0.16)), tag, font=tagf, fill=ORANGE)
    big_y = y + int(ch * big_f)
    draw.text((tx, big_y), big, font=bigf, fill=WHITE)
    # Push the descriptor below the big value's real ink box, not to a fixed
    # fraction of the card: a value with descenders ("dowolny") otherwise
    # collides with the line underneath it.
    big_bottom = draw.textbbox((tx, big_y), big, font=bigf)[3]
    sub_y = max(y + int(ch * 0.76), big_bottom + 6)
    draw.text((tx, sub_y), sub, font=subf, fill=GREY)


W = H = 0
def set_aspect(aspect):
    global W, H
    W = 1080
    H = 1920 if aspect == "9:16" else 1344


def build(aspect):
    set_aspect(aspect)
    is916 = aspect == "9:16"
    canvas = vgradient((44, 28, 15), (11, 11, 14))
    canvas = add_glow(canvas, (540, 560 if is916 else 430), (620, 560), ORANGE, 135, 200)
    canvas = add_glow(canvas, (150, H - 300), (360, 340), (255, 80, 50), 44, 220)
    draw = ImageDraw.Draw(canvas)

    isz = 88
    ring = 4
    draw.ellipse([W-isz-48-ring, 44-ring, W-48+ring, 44+isz+ring], outline=ORANGE, width=ring)
    canvas.alpha_composite(circle_img(Image.open(ICON), isz), (W - isz - 48, 44))

    ey = 92 if is916 else 60
    ef = ImageFont.truetype(SEMI_FONT, 30 if is916 else 25)
    spaced(draw, ey, EYEBROW, ef, ORANGE, 8)
    draw.rounded_rectangle([(W-96)/2, ey+44, (W+96)/2, ey+50], radius=3, fill=ORANGE)
    hf = ImageFont.truetype(HEAD_FONT, 68 if is916 else 55)
    hy = ey + (92 if is916 else 76)
    centered(draw, hy, HEADLINE, hf, WHITE)
    sf = ImageFont.truetype(SUB_FONT, 32 if is916 else 26)
    sy = hy + (98 if is916 else 78)
    centered(draw, sy, SUBTITLE, sf, GREY)

    mx = 80
    cw = W - mx * 2
    ch = 260 if is916 else 200
    gap = 44 if is916 else 32
    tagf = ImageFont.truetype(SEMI_FONT, 32 if is916 else 26)
    bigf = ImageFont.truetype(HEAD_FONT, 92 if is916 else 70)
    subf = ImageFont.truetype(SUB_FONT, 38 if is916 else 30)
    big_f = 0.28 if is916 else 0.26
    y = sy + (104 if is916 else 88)
    for tag, big, sub in CARDS:
        stat_card(draw, mx, y, cw, ch, tag, big, sub, tagf, bigf, subf, big_f)
        y += ch + gap

    cf = ImageFont.truetype(SEMI_FONT, 38 if is916 else 30)
    centered(draw, y + (14 if is916 else 6), CTA, cf, ORANGE)

    bsz = 78 if is916 else 66
    by = H - (150 if is916 else 120)
    canvas.alpha_composite(circle_img(Image.open(BADGE), bsz), ((W - bsz) // 2, by))
    uf = ImageFont.truetype(SEMI_FONT, 28 if is916 else 24)
    centered(draw, by + bsz + 10, FOOTER_URL, uf, GREY)

    os.makedirs(OUT, exist_ok=True)
    suffix = "" if is916 else "-4x5"
    path = os.path.join(OUT, f"{BASENAME}-story{suffix}.png")
    canvas.convert("RGB").save(path, "PNG")
    print("  built", os.path.relpath(path, MK), f"({W}x{H}, last y={y})")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "9:16"
    for a in (["9:16", "4:5"] if arg == "both" else [arg]):
        build(a)
