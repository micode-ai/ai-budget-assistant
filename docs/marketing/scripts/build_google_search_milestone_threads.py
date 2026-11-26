# -*- coding: utf-8 -*-
"""
English Threads image (1080x1350) for the Google Search milestone, built from
the user's REAL Search Console screenshots (the "60 clicks" congrats badge and
the Performance chart), framed in white cards on the house warm-dark gradient.

The screenshots are shown as-is (only cropped to their content, never
retouched) — they are the proof, so do not edit numbers on them.

Output: docs/marketing/creatives/google-search-milestone/renders/en/
    google-search-milestone-threads.png   1080x1350

Usage:
    python build_google_search_milestone_threads.py
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

import build_google_search_milestone_reel as R

SHOTS = "C:/Users/perev/OneDrive/Pictures/Screenshots"
BADGE_SHOT = os.path.join(SHOTS, "Снимок экрана 2026-09-23 180540.png")
CHART_SHOT = os.path.join(SHOTS, "Снимок экрана 2026-09-23 180512.png")
OUT = os.path.join(R.MK, "creatives", R.SLUG, "renders", "en")

EYEBROW = "OUR SMALL WINS"
HEADLINE = "Google noticed us"
SUBTITLE = "ai-budget.pl, first 3 months in search"
THANKS = "Modest numbers, but they're ours. Thank you!"


def trim_white(im, thr=250, pad=16):
    g = im.convert("L").point(lambda p: 255 if p < thr else 0)
    box = g.getbbox()
    x0, y0, x1, y1 = box
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def shot_card(canvas, img, cx, y, target_w=None, target_h=None, pad=22, radius=28):
    if target_w:
        s = target_w / img.width
    else:
        s = target_h / img.height
    img = img.resize((int(img.width * s), int(img.height * s)), Image.LANCZOS).convert("RGBA")
    cw, ch = img.width + 2 * pad, img.height + 2 * pad
    x = int(cx - cw / 2)
    # soft shadow
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([x, y + 10, x + cw, y + ch + 10], radius=radius, fill=(0, 0, 0, 150))
    canvas = Image.alpha_composite(canvas, sh.filter(ImageFilter.GaussianBlur(18)))
    card = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle([x, y, x + cw, y + ch], radius=radius, fill=(255, 255, 255, 255))
    canvas = Image.alpha_composite(canvas, card)
    canvas.alpha_composite(img, (x + pad, y + pad))
    return canvas, y + ch


def build():
    R.W, R.H = 1080, 1350
    W, H = R.W, R.H
    c = R.vgradient((44, 28, 15), (11, 11, 14))
    c = R.add_glow(c, (540, 520), (620, 520), R.ORANGE, 120, 200)
    c = R.add_glow(c, (150, H - 260), (360, 320), (255, 80, 50), 40, 220)
    d = ImageDraw.Draw(c)

    isz, ring = 76, 4
    d.ellipse([W-isz-44-ring, 40-ring, W-44+ring, 40+isz+ring], outline=R.ORANGE, width=ring)
    c.alpha_composite(R.circle_img(Image.open(R.ICON), isz), (W - isz - 44, 40))

    ef = ImageFont.truetype(R.SEMI_FONT, 26)
    R.spaced(d, 62, EYEBROW, ef, R.ORANGE, 8)
    d.rounded_rectangle([(W-96)/2, 100, (W+96)/2, 106], radius=3, fill=R.ORANGE)
    R.centered(d, 122, HEADLINE, ImageFont.truetype(R.HEAD_FONT, 66), R.WHITE)
    R.centered(d, 208, SUBTITLE, ImageFont.truetype(R.SUB_FONT, 30), R.GREY)

    badge = trim_white(Image.open(BADGE_SHOT).convert("RGB"))
    chart = Image.open(CHART_SHOT).convert("RGB")
    chart = chart.crop((8, 6, chart.width - 8, 472))   # drop the grey page frame

    c, y = shot_card(c, badge, W / 2, 272, target_h=440)
    c, y = shot_card(c, chart, W / 2, y + 36, target_w=940, pad=16)

    d = ImageDraw.Draw(c)
    R.centered(d, y + 40, THANKS, ImageFont.truetype(R.SEMI_FONT, 36), R.ORANGE)
    uf = ImageFont.truetype(R.SEMI_FONT, 26)
    R.centered(d, H - 70, "MICODE  ·  ai-budget.pl", uf, R.GREY)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{R.SLUG}-threads.png")
    c.convert("RGB").save(path, "PNG")
    print("  built", os.path.relpath(path, R.MK), f"(last y={y})")


if __name__ == "__main__":
    build()
