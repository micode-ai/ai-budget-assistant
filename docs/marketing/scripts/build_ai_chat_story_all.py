# -*- coding: utf-8 -*-
"""
Single "recap" story (9:16 + 4:5) for the Czat AI feature: all five sample
questions and their answers rendered as a clean chat conversation on the
house-style warm-dark gradient + orange glow. No phone bezel — the chat
bubbles themselves are the hero.

Outputs in docs/marketing/creatives/ai-chat/renders/pl/:
    ai-chat-story-all.png        1080x1920
    ai-chat-story-all-4x5.png    1080x1344

Usage:
    python build_ai_chat_story_all.py          # 9:16
    python build_ai_chat_story_all.py 4:5
    python build_ai_chat_story_all.py both
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK    = os.path.dirname(SCRIPT_DIR)
FEATURE = "ai-chat"
OUT   = os.path.join(MK, "creatives", FEATURE, "renders", "pl")
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON  = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"   # bold
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"    # semibold
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"    # regular
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)
BUBBLE_A = (38, 38, 44)     # assistant bubble
BUBBLE_A_LINE = (70, 70, 80)

EYEBROW  = "CZAT AI"
HEADLINE = "Zapytaj o wszystko"
SUBTITLE = "Pytasz po ludzku — odpowiedź w sekundę"
FOOTER_URL = "ai-budget.pl"

# (question, answer-prefix, answer-highlight)
EXCHANGES = [
    ("Ile wydałem na piwo w tym miesiącu?", "Na piwo: ", "192,24 zł"),
    ("Ile wydałem w Biedronce?",            "W Biedronce: ", "1159,50 zł"),
    ("Porównaj ten miesiąc z poprzednim",   "Zmiana m/m: ", "+0,5%"),
    ("Na co wydaję najwięcej?",             "Najwięcej: ", "Mieszkanie 55%"),
    ("Ile zostało mi z budżetu?",           "Zostało: ", "1051,47 zł · 18 dni"),
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


def bubble(draw, lines, font, side, y, fill, pad, radius, margin, max_bw, line_h,
           highlight=None, hl_font=None):
    """Draw a rounded bubble; return the y after it. `highlight` (str) is drawn in
    ORANGE right after the (single) line text when given."""
    widths = [tw(draw, ln, font) for ln in lines]
    if highlight:
        widths[-1] += tw(draw, highlight, hl_font)
    bw = min(max_bw, max(widths)) + pad * 2
    bh = len(lines) * line_h + pad * 2
    x = (W - margin - bw) if side == "right" else margin
    draw.rounded_rectangle([x, y, x + bw, y + bh], radius=radius, fill=fill)
    if side == "left":
        draw.rounded_rectangle([x, y, x + bw, y + bh], radius=radius,
                               outline=BUBBLE_A_LINE, width=2)
    ty = y + pad
    for i, ln in enumerate(lines):
        draw.text((x + pad, ty), ln, font=font, fill=WHITE)
        if highlight and i == len(lines) - 1:
            draw.text((x + pad + tw(draw, ln, font), ty), highlight, font=hl_font, fill=ORANGE)
        ty += line_h
    return y + bh


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

    # top-right app icon with orange ring
    isz = 88
    ring = 4
    draw.ellipse([W-isz-48-ring, 44-ring, W-48+ring, 44+isz+ring], outline=ORANGE, width=ring)
    canvas.alpha_composite(circle_img(Image.open(ICON), isz), (W - isz - 48, 44))

    # header
    ey = 92 if is916 else 60
    ef = ImageFont.truetype(SEMI_FONT, 34 if is916 else 28)
    spaced(draw, ey, EYEBROW, ef, ORANGE, 10)
    draw.rounded_rectangle([(W-96)/2, ey+46, (W+96)/2, ey+52], radius=3, fill=ORANGE)
    hf = ImageFont.truetype(HEAD_FONT, 78 if is916 else 60)
    hy = ey + (96 if is916 else 78)
    centered(draw, hy, HEADLINE, hf, WHITE)
    sf = ImageFont.truetype(SUB_FONT, 34 if is916 else 28)
    sy = hy + (100 if is916 else 78)
    centered(draw, sy, SUBTITLE, sf, GREY)

    # chat bubbles
    qf = ImageFont.truetype(SEMI_FONT, 37 if is916 else 31)
    af = ImageFont.truetype(SEMI_FONT, 38 if is916 else 32)
    ahf = ImageFont.truetype(HEAD_FONT, 40 if is916 else 34)
    margin = 72
    pad = 26
    radius = 30
    q_line_h = (48 if is916 else 42)
    a_line_h = (50 if is916 else 44)
    max_q = W - margin * 2 - 160
    max_a = W - margin * 2 - 90

    y = sy + (86 if is916 else 66)
    gap_qa = 14
    gap_ex = (40 if is916 else 26)
    for q, ap, ah in EXCHANGES:
        qlines = wrap(draw, q, qf, max_q)
        y = bubble(draw, qlines, qf, "right", y, ORANGE, pad, radius, margin, max_q, q_line_h)
        y += gap_qa
        y = bubble(draw, [ap], af, "left", y, BUBBLE_A, pad, radius, margin, max_a, a_line_h,
                   highlight=ah, hl_font=ahf)
        y += gap_ex

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
    print("  built", os.path.relpath(path, MK), f"({W}x{H}, last y={y})")


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "9:16"
    for a in (["9:16", "4:5"] if arg == "both" else [arg]):
        build(a)
