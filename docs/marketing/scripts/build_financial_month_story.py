# -*- coding: utf-8 -*-
"""
Instagram/Facebook Stories for the "Miesiac finansowy" (Financial Month) feature.
Two kinds, same house style as the reel:

  1. Per-scene stories — the reel's three still frames as standalone PNGs, phone
     bezel + phase headline. These REUSE build_financial_month_reel's pipeline
     rather than re-implementing it, so any redaction the reel applies is
     inherited automatically instead of being a second place that can forget it.

  2. A recap story — the whole feature as four numbered steps, no phone bezel.

Copy discipline: the setting is per ACCOUNT and owner-only, and it changes only
how periods are grouped — no expense or income data is altered. Do not imply it
edits transactions, and do not imply each family member sets their own.

Outputs in docs/marketing/creatives/financial-month/renders/pl/:
    stories/01-ustawienia.png … 03-pulpit.png   1080x1920
    financial-month-story-all.png               1080x1920
    financial-month-story-all-4x5.png           1080x1344

Usage:
    python build_financial_month_story.py              # scenes + recap 9:16
    python build_financial_month_story.py scenes
    python build_financial_month_story.py recap
    python build_financial_month_story.py recap both
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import build_financial_month_reel as R

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK    = os.path.dirname(SCRIPT_DIR)
FEATURE = "financial-month"
OUT   = os.path.join(MK, "creatives", FEATURE, "renders", "pl")
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON  = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)
ROW    = (38, 38, 44)
ROW_LINE = (70, 70, 80)

# Per-scene file names, in reel scene order.
SCENE_NAMES = [
    "01-ustawienia",
    "02-wybor-dnia",
    "03-pulpit",
]

EYEBROW  = "MIESIĄC FINANSOWY"
HEADLINE = "Wypłata 10-go, budżet od 1-go?"
SUBTITLE = "Licz od wypłaty do wypłaty"
FOOTER_URL = "ai-budget.pl"

# (step number, what you do, the payoff in orange)
STEPS = [
    ("1", "Wybierasz dzień wypłaty",        "raz, w ustawieniach konta"),
    ("2", "Budżet startuje w tym dniu",     "np. od 10. do 9."),
    ("3", "Poprzednie okresy się przeliczą", "dane zostają bez zmian"),
    ("4", "Całe konto widzi to samo",       "jedno ustawienie, wspólne liczby"),
]

W = H = 0


def set_aspect(aspect):
    global W, H
    W = 1080
    H = 1920 if aspect == "9:16" else 1344


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


def wrap(draw, text, font, max_w):
    out, cur = [], ""
    for word in text.split():
        t = (cur + " " + word).strip()
        if tw(draw, t, font) <= max_w:
            cur = t
        else:
            if cur:
                out.append(cur)
            cur = word
    if cur:
        out.append(cur)
    return out


# ---------- 1. per-scene stories ----------

def build_scenes():
    """The reel's five still frames, saved as standalone 9:16 story PNGs."""
    R.set_aspect("9:16")
    bg, mask, shots, tops, _ = R._prep()
    outdir = os.path.join(OUT, "stories")
    os.makedirs(outdir, exist_ok=True)
    for i, name in enumerate(SCENE_NAMES):
        frame = R.compose(bg, mask, shots, tops, i, 0.0).convert("RGB")
        path = os.path.join(outdir, f"{name}.png")
        frame.save(path, "PNG")
        print("  built", os.path.relpath(path, MK))


# ---------- 2. recap story ----------

def build_recap(aspect):
    set_aspect(aspect)
    is916 = aspect == "9:16"
    canvas = vgradient((44, 28, 15), (11, 11, 14))
    canvas = add_glow(canvas, (540, 560 if is916 else 430), (620, 560), ORANGE, 135, 200)
    canvas = add_glow(canvas, (150, H - 300), (360, 340), (255, 80, 50), 44, 220)
    draw = ImageDraw.Draw(canvas)

    # top-right app icon with orange ring
    isz, ring = 88, 4
    draw.ellipse([W-isz-48-ring, 44-ring, W-48+ring, 44+isz+ring], outline=ORANGE, width=ring)
    canvas.alpha_composite(circle_img(Image.open(ICON), isz), (W - isz - 48, 44))

    # header
    ey = 92 if is916 else 60
    ef = ImageFont.truetype(SEMI_FONT, 34 if is916 else 28)
    spaced(draw, ey, EYEBROW, ef, ORANGE, 10)
    draw.rounded_rectangle([(W-96)/2, ey+46, (W+96)/2, ey+52], radius=3, fill=ORANGE)

    hf = ImageFont.truetype(HEAD_FONT, 72 if is916 else 56)
    hy = ey + (96 if is916 else 78)
    for line in wrap(draw, HEADLINE, hf, W - 150):
        centered(draw, hy, line, hf, WHITE)
        hy += (84 if is916 else 66)

    sf = ImageFont.truetype(SUB_FONT, 34 if is916 else 28)
    sy = hy + (14 if is916 else 8)
    for line in wrap(draw, SUBTITLE, sf, W - 190):
        centered(draw, sy, line, sf, GREY)
        sy += (46 if is916 else 38)

    # four step rows
    margin = 72
    pad = 30
    radius = 28
    nf = ImageFont.truetype(HEAD_FONT, 44 if is916 else 36)   # the number
    tf = ImageFont.truetype(SEMI_FONT, 37 if is916 else 31)   # what you do
    pf = ImageFont.truetype(SEMI_FONT, 34 if is916 else 29)   # the payoff
    badge = 66 if is916 else 56
    row_gap = 30 if is916 else 20

    # Two passes: measure the whole block, then justify it in the band between the
    # subtitle and the footer (see build_split_story.py for why justify, not centre).
    text_w = W - margin * 2 - pad * 2 - badge - 24
    line_h_a = 46 if is916 else 40
    line_h_p = 44 if is916 else 38
    footer_top = H - (150 if is916 else 120)

    measured = []
    for num, action, payoff in STEPS:
        a_lines = wrap(draw, action, tf, text_w)
        p_lines = wrap(draw, payoff, pf, text_w)
        bh = pad * 2 + len(a_lines) * line_h_a + len(p_lines) * line_h_p + 6
        measured.append((num, a_lines, p_lines, bh))

    band_top = sy + (56 if is916 else 34)
    band_h = (footer_top - 40) - band_top
    rows_h = sum(m[3] for m in measured)
    n_gaps = max(1, len(measured) - 1)
    gap = min(120, max(row_gap, int((band_h * 0.78 - rows_h) / n_gaps)))
    y = band_top

    for num, a_lines, p_lines, bh in measured:
        draw.rounded_rectangle([margin, y, W - margin, y + bh], radius=radius, fill=ROW)
        draw.rounded_rectangle([margin, y, W - margin, y + bh], radius=radius,
                               outline=ROW_LINE, width=2)

        # orange number badge
        bx, by_ = margin + pad, y + pad
        draw.ellipse([bx, by_, bx + badge, by_ + badge], fill=ORANGE)
        draw.text((bx + badge / 2, by_ + badge / 2), num, font=nf,
                  fill=(20, 20, 22), anchor="mm")

        tx = bx + badge + 24
        ty = y + pad
        for ln in a_lines:
            draw.text((tx, ty), ln, font=tf, fill=WHITE)
            ty += line_h_a
        ty += 6
        for ln in p_lines:
            draw.text((tx, ty), ln, font=pf, fill=ORANGE)
            ty += line_h_p

        y += bh + gap

    # footer: MICODE badge + url
    bsz = 78 if is916 else 66
    by = H - (150 if is916 else 120)
    canvas.alpha_composite(circle_img(Image.open(BADGE), bsz), ((W - bsz) // 2, by))
    uf = ImageFont.truetype(SEMI_FONT, 28 if is916 else 24)
    centered(draw, by + bsz + 10, FOOTER_URL, uf, GREY)

    os.makedirs(OUT, exist_ok=True)
    suffix = "" if is916 else "-4x5"
    path = os.path.join(OUT, f"{FEATURE}-story-all{suffix}.png")
    canvas.convert("RGB").save(path, "PNG")
    print("  built", os.path.relpath(path, MK), f"({W}x{H}, last y={y}, footer at {by})")
    if y > by - 20:
        print("  WARNING: the step rows reach the footer — shorten a step or drop one")


if __name__ == "__main__":
    args = sys.argv[1:]
    what = args[0] if args and args[0] in ("scenes", "recap", "all") else "all"
    aspect = args[1] if len(args) > 1 and args[1] in ("9:16", "4:5", "both") else "9:16"

    if what in ("scenes", "all"):
        print("[scenes] 1080x1920")
        build_scenes()
    if what in ("recap", "all"):
        for a in (["9:16", "4:5"] if aspect == "both" else [aspect]):
            print(f"[recap] {a}")
            build_recap(a)
