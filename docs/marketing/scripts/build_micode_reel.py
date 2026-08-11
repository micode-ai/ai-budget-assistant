# -*- coding: utf-8 -*-
"""
Render the MICODE studio "new website" REEL (mp4 + gif) for Instagram / Facebook,
in the same style as the AI Budget web-site reel: a fixed 9:16 (or 4:5) poster
(navy gradient + orange glow, MICODE badge, headline, pills, brand footer) with
the mi-code.pl screenshots CYCLING inside a browser window via quick vertical-slide
transitions, looped. The address bar tracks each screenshot.

Narrative (PL): introduce the studio — who we are -> numbers -> products & AI ->
the people -> blog. The refreshed website (mi-code.pl) is the hook.

Source screenshots: d:/Work/screens/micode/shot-{1..7}.png (raw browser captures;
the OS/browser chrome is cropped off, the site's own white header is kept).

Outputs in docs/marketing/creatives/micode-site/renders/pl/:
    micode-reel.mp4       1080x1920, 30fps, smooth
    micode-reel.gif       600x1067, sparse frames (small file)
    micode-reel-4x5.mp4   1080x1344 (Instagram feed)
    micode-reel-4x5.gif

Usage:
    python build_micode_reel.py both 9:16
    python build_micode_reel.py both 4:5
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio.v2 as imageio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK = os.path.dirname(SCRIPT_DIR)                       # docs/marketing
SRC = r"d:/Work/screens/micode"                        # raw screenshots
OUT = os.path.join(MK, "creatives", "micode-site", "renders")
BADGE = os.path.join(MK, "assets", "micode-badge.png") # MICODE circular logo

# ---------- design tokens ----------
W, H = 1080, 1920
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
BLUE   = (37, 64, 173)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)

# browser window geometry (wider — content is the hero of the frame)
WIN_W, BAR_H = 1056, 76
VW = WIN_W
VX = (W - VW) // 2

# aspect-dependent globals, filled by set_aspect()
H = WIN_TOP = VH = VY = WIN_BOTTOM = 0
L = {}


def set_aspect(aspect):
    """Configure canvas height + vertical layout for '9:16' (Reels/Stories)
    or '4:5' (Instagram feed)."""
    global H, WIN_TOP, VH, VY, WIN_BOTTOM, L
    if aspect == "4:5":
        H, WIN_TOP, VH = 1344, 358, 548
        L = dict(ey=58, eye_sz=30, ul_dy=48, head_sz=62, head_gap=80, head_step=72,
                 cap_dy=10, cap_sz=30, glow1=(540, 470), glow2=(150, 1000),
                 pills_dy=34, pill_sz=30, pill_h=60, url_bar_sz=28,
                 cta_y=1112, cta_line_sz=33, cta_url_sz=44)
    else:  # 9:16
        H, WIN_TOP, VH = 1920, 512, 810
        L = dict(ey=128, eye_sz=36, ul_dy=54, head_sz=86, head_gap=96, head_step=94,
                 cap_dy=12, cap_sz=36, glow1=(540, 640), glow2=(150, 1500),
                 pills_dy=42, pill_sz=34, pill_h=70, url_bar_sz=30,
                 cta_y=1556, cta_line_sz=40, cta_url_sz=54)
    VY = WIN_TOP + BAR_H
    WIN_BOTTOM = VY + VH


SUFFIX = {"9:16": "", "4:5": "-4x5"}
set_aspect("9:16")

# ---------- scenes: (screenshot, chrome-crop-px, address-bar url, phase) ----------
SCENES = [
    ("shot-1.png", 94, "mi-code.pl",       "HERO"),
    ("shot-3.png", 94, "mi-code.pl",       "STATS"),
    ("shot-4.png", 94, "mi-code.pl",       "PROD"),
    ("shot-2.png",  0, "mi-code.pl",       "TEAM"),
    ("shot-7.png", 94, "mi-code.pl/blog",  "BLOG"),
]
SCENE_PHASE = [s[3] for s in SCENES]

# phase -> (eyebrow, headline, address label, address url)  -- PL, studio intro
PHASES = {
 "HERO":  ("NOWA STRONA", "Poznaj\nMICODE",            "Studio IT, Gdańsk", "mi-code.pl"),
 "STATS": ("18 LAT W IT", "Doświadczenie\nw liczbach", "O firmie",          "mi-code.pl"),
 "PROD":  ("PRODUKTY",    "Aplikacje\ni systemy AI",   "Co tworzymy",       "mi-code.pl"),
 "TEAM":  ("ZESPÓŁ",      "Ludzie\nza kodem",          "Założyciel",        "mi-code.pl"),
 "BLOG":  ("BLOG",        "Dzielimy się\nwiedzą",      "Blog",              "mi-code.pl/blog"),
}
PILLS = ["Aplikacje", "Enterprise", "AI"]
# bottom general text (replaces the footer brand block — logo is top-right)
CTA_LINE = "Tworzymy oprogramowanie od 18 lat"
CTA_URL = "mi-code.pl"

# timing
FPS = 30
HOLD_S = 3.6
TRANS_S = 0.5
GIF_HOLD_MS = 3600


# ---------- generic helpers ----------
def vgradient(c0, c1):
    base = Image.new("RGB", (W, H), c0)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        d.line([(0, y), (W, y)], fill=tuple(int(c0[i] + (c1[i]-c0[i])*t) for i in range(3)))
    return base.convert("RGBA")


def glow(canvas, center, radii, color, alpha, blur):
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


def cover(img, w, h):
    """Scale to cover (w,h) then center-crop."""
    img = img.convert("RGBA")
    s = max(w / img.width, h / img.height)
    img = img.resize((max(w, round(img.width*s)), max(h, round(img.height*s))), Image.LANCZOS)
    x = (img.width - w) // 2
    return img.crop((x, 0, x + w, h))


def tw(draw, s, font):
    return draw.textlength(s, font=font)


def centered(img, y, s, font, fill):
    d = ImageDraw.Draw(img)
    d.text(((W - tw(d, s, font)) / 2, y), s, font=font, fill=fill)


def spaced(draw, y, s, font, fill, gap):
    total = sum(tw(draw, ch, font) + gap for ch in s) - gap
    x = (W - total) / 2
    for ch in s:
        draw.text((x, y), ch, font=font, fill=fill)
        x += tw(draw, ch, font) + gap


def wrap(draw, text, font, max_w):
    out = []
    for para in text.split("\n"):
        cur = ""
        for w in para.split():
            t = (cur + " " + w).strip()
            if tw(draw, t, font) <= max_w:
                cur = t
            else:
                if cur: out.append(cur)
                cur = w
        out.append(cur)
    return out


def draw_lock(draw, cx, cy, col):
    bw, bh = 14, 11
    x0, y0 = cx - bw/2, cy - 2
    draw.rounded_rectangle([x0, y0, x0+bw, y0+bh], radius=2, fill=col)
    draw.arc([cx-5, y0-9, cx+5, y0+3], start=180, end=360, fill=col, width=2)


def draw_pills(canvas, y, pills):
    draw = ImageDraw.Draw(canvas)
    pf = ImageFont.truetype(SEMI_FONT, L["pill_sz"])
    padx, gap, h = 34, 24, L["pill_h"]
    widths = [tw(draw, p, pf) + padx*2 for p in pills]
    total = sum(widths) + gap*(len(pills)-1)
    x = (W - total) / 2
    for p, w in zip(pills, widths):
        draw.rounded_rectangle([x, y, x+w, y+h], radius=h//2, outline=ORANGE, width=3)
        draw.text((x+padx, y+h/2), p, font=pf, fill=WHITE, anchor="lm")
        x += w + gap


def draw_cta(canvas):
    """Bottom general text: studio line (white) + URL CTA (orange)."""
    lf = ImageFont.truetype(SEMI_FONT, L["cta_line_sz"])
    uf = ImageFont.truetype(HEAD_FONT, L["cta_url_sz"])
    y = L["cta_y"]
    centered(canvas, y, CTA_LINE, lf, WHITE)
    centered(canvas, y + L["cta_line_sz"] + 16, CTA_URL, uf, ORANGE)


# ---------- poster background ----------
def build_bg():
    canvas = vgradient((18, 26, 54), (8, 9, 16))          # navy -> near-black
    canvas = glow(canvas, L["glow1"], (560, 520), ORANGE, 135, 200)
    canvas = glow(canvas, L["glow2"], (380, 360), BLUE, 90, 230)
    draw = ImageDraw.Draw(canvas)

    badge = circle_img(Image.open(BADGE), 96)
    canvas.alpha_composite(badge, (W - 96 - 52, 48))

    win_h = BAR_H + VH
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = Image.new("RGBA", (WIN_W, win_h), (0, 0, 0, 0))
    ImageDraw.Draw(blk).rounded_rectangle([0, 0, WIN_W-1, win_h-1], radius=30, fill=(0, 0, 0, 165))
    shadow.alpha_composite(blk, (VX, WIN_TOP + 30))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(46)))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([VX, WIN_TOP, VX+WIN_W, WIN_TOP+win_h], radius=30, fill=(28, 28, 33, 255))
    draw.rounded_rectangle([VX, WIN_TOP, VX+WIN_W, WIN_TOP+BAR_H], radius=30, fill=(46, 46, 53, 255))
    draw.rectangle([VX, WIN_TOP+BAR_H-30, VX+WIN_W, WIN_TOP+BAR_H], fill=(46, 46, 53, 255))
    cy = WIN_TOP + BAR_H // 2
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = VX + 34 + i*30
        draw.ellipse([cx-8, cy-8, cx+8, cy+8], fill=c)

    draw_pills(canvas, WIN_BOTTOM + L["pills_dy"], PILLS)
    draw_cta(canvas)
    return canvas


def draw_caption(layer, y, label, url):
    d = ImageDraw.Draw(layer)
    lf = ImageFont.truetype(SUB_FONT, L["cap_sz"])
    uf = ImageFont.truetype(HEAD_FONT, L["cap_sz"])
    arrow = "  ->  "
    lw, aw, uw = tw(d, label, lf), tw(d, arrow, lf), tw(d, url, uf)
    x = (W - (lw + aw + uw)) / 2
    d.text((x, y), label, font=lf, fill=GREY); x += lw
    d.text((x, y), arrow, font=lf, fill=GREY); x += aw
    d.text((x, y), url, font=uf, fill=ORANGE)


def build_top(phase):
    eyebrow, headline, label, url = PHASES[phase]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    ef = ImageFont.truetype(SEMI_FONT, L["eye_sz"])
    ey = L["ey"]
    spaced(draw, ey, eyebrow, ef, ORANGE, 10)
    draw.rounded_rectangle([(W-96)/2, ey+L["ul_dy"], (W+96)/2, ey+L["ul_dy"]+6], radius=3, fill=ORANGE)

    hf = ImageFont.truetype(HEAD_FONT, L["head_sz"])
    y = ey + L["head_gap"]
    for line in wrap(draw, headline, hf, W-150):
        centered(layer, y, line, hf, WHITE); y += L["head_step"]

    draw_caption(layer, y + L["cap_dy"], label, url)
    return layer


def viewport_mask():
    m = Image.new("L", (VW, VH), 0)
    md = ImageDraw.Draw(m)
    md.rounded_rectangle([0, 0, VW-1, VH-1], radius=28, fill=255)
    md.rectangle([0, 0, VW-1, VH//2], fill=255)
    return m


def draw_url(canvas, url):
    draw = ImageDraw.Draw(canvas)
    uf = ImageFont.truetype(SEMI_FONT, L["url_bar_sz"])
    cy = WIN_TOP + BAR_H // 2
    uw = tw(draw, url, uf)
    pill_w = uw + 96
    px0 = (W - pill_w) / 2
    draw.rounded_rectangle([px0, cy-24, px0+pill_w, cy+24], radius=24, fill=(20, 20, 24, 255))
    draw_lock(draw, px0+34, cy, (39, 201, 63))
    draw.text((px0+58, cy-19), url, font=uf, fill=(225, 227, 233))


def ease(t):
    return t*t*(3 - 2*t)


def paste_alpha(canvas, layer, factor):
    if factor >= 0.999:
        canvas.alpha_composite(layer); return
    if factor <= 0.001:
        return
    a = layer.getchannel("A").point(lambda v: int(v * factor))
    l = layer.copy(); l.putalpha(a)
    canvas.alpha_composite(l)


def compose(bg, mask, shots, tops, scene, off):
    n = len(SCENES)
    nxt = (scene + 1) % n
    e = ease(off)
    frame = bg.copy()

    content = Image.new("RGBA", (VW, VH), (22, 22, 27, 255))
    content.alpha_composite(shots[scene], (0, int(-e*VH)))
    if off > 0:
        content.alpha_composite(shots[nxt], (0, int((1-e)*VH)))
    content.putalpha(mask)
    frame.alpha_composite(content, (VX, VY))

    draw_url(frame, SCENES[scene][2] if off < 0.5 else SCENES[nxt][2])

    pc, pn = SCENE_PHASE[scene], SCENE_PHASE[nxt]
    if pc == pn:
        paste_alpha(frame, tops[pc], 1.0)
    else:
        paste_alpha(frame, tops[pc], max(0.0, 1 - 2*e))
        paste_alpha(frame, tops[pn], max(0.0, 2*e - 1))
    return frame


def load_shot(fname, crop_top):
    im = Image.open(os.path.join(SRC, fname)).convert("RGB")
    if crop_top:
        im = im.crop((0, crop_top, im.width, im.height))
    return cover(im, VW, VH)


# ---------- render ----------
def _prep():
    bg = build_bg()
    mask = viewport_mask()
    tops = {p: build_top(p) for p in PHASES}
    shots = [load_shot(f, c) for f, c, _, _ in SCENES]
    outdir = os.path.join(OUT, "pl")
    os.makedirs(outdir, exist_ok=True)
    return bg, mask, shots, tops, outdir


def render_gif(suffix=""):
    bg, mask, shots, tops, outdir = _prep()
    n = len(SCENES)
    gw, gh = 600, round(600 * H / W)
    frames, durs = [], []
    for i in range(n):
        frames.append(compose(bg, mask, shots, tops, i, 0.0).convert("RGB").resize((gw, gh), Image.LANCZOS))
        durs.append(GIF_HOLD_MS)
        for t in (0.3, 0.55, 0.78, 1.0):
            frames.append(compose(bg, mask, shots, tops, i, t).convert("RGB").resize((gw, gh), Image.LANCZOS))
            durs.append(60)
    gif_path = os.path.join(outdir, f"micode-reel{suffix}.gif")
    frames[0].save(gif_path, save_all=True, append_images=frames[1:], duration=durs,
                   loop=0, optimize=True, disposal=2)
    print("  built", os.path.relpath(gif_path, MK))


def render_mp4(suffix=""):
    bg, mask, shots, tops, outdir = _prep()
    n = len(SCENES)
    hold_f = int(HOLD_S * FPS)
    trans_f = int(TRANS_S * FPS)
    mp4_path = os.path.join(outdir, f"micode-reel{suffix}.mp4")
    writer = imageio.get_writer(mp4_path, fps=FPS, codec="libx264", quality=8,
                                macro_block_size=8, pixelformat="yuv420p")
    for i in range(n):
        arr = np.array(compose(bg, mask, shots, tops, i, 0.0).convert("RGB"))
        for _ in range(hold_f):
            writer.append_data(arr)
        for t in range(1, trans_f + 1):
            writer.append_data(np.array(compose(bg, mask, shots, tops, i, t/trans_f).convert("RGB")))
    writer.close()
    print("  built", os.path.relpath(mp4_path, MK))


def main(mode, aspect):
    set_aspect(aspect)
    suffix = SUFFIX[aspect]
    print(f"[{aspect}] {W}x{H}")
    if mode in ("gif", "both"):
        render_gif(suffix)
    if mode in ("mp4", "both"):
        render_mp4(suffix)


if __name__ == "__main__":
    args = sys.argv[1:]
    mode = "both"
    if args and args[0] in ("gif", "mp4", "both"):
        mode, args = args[0], args[1:]
    aspect = args[0] if args and args[0] in SUFFIX else "9:16"
    main(mode, aspect)
