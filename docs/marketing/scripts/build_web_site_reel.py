# -*- coding: utf-8 -*-
"""
Render the "new website" REEL (mp4 + gif), the same way web-story was made:
a fixed 9:16 poster (gradient + glow, MICODE badge, headline, pills, brand
footer) with the screenshot CYCLING inside a browser window via quick
vertical-slide transitions, looped. The address bar switches per screenshot
(www.ai-budget.pl -> www.ai-budget.pl/blog -> app.ai-budget.pl) so the move
to app.ai-budget.pl is shown on screen.

Outputs (per lang) in docs/marketing/web-site-story/<lang>/:
    web-site-reel.mp4   1080x1920, 30fps, smooth
    web-site-reel.gif   600x1067, sparse frames (small file, like web-story.gif)

Usage:
    python build_web_site_reel.py            # pl ru en
    python build_web_site_reel.py pl
"""
import os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio.v2 as imageio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK = os.path.dirname(SCRIPT_DIR)                    # docs/marketing
SRC = os.path.join(MK, "creatives", "web-site")     # source screenshots
OUT = os.path.join(SRC, "renders")                  # rendered reels + posters
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

# ---------- design tokens ----------
W, H = 1080, 1920
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)

# browser window geometry (W fixed at 1080; H + vertical layout depend on aspect)
WIN_W, BAR_H = 1004, 76
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
        # H=1344 (mult. of 8 → no codec resize; 1080/1344=0.804, inside IG's 4:5..16:9)
        H, WIN_TOP, VH = 1344, 392, 470
        L = dict(ey=66, eye_sz=30, ul_dy=50, head_sz=64, head_gap=84, head_step=74,
                 cap_dy=10, cap_sz=30, glow1=(540, 520), glow2=(150, 1080),
                 pills_dy=40, pill_sz=30, pill_h=62, icon=86, name_sz=40, url_sz=30,
                 footer_by=1118, tag_y=1306, tag_sz=26, url_bar_sz=28)
    else:  # 9:16
        H, WIN_TOP, VH = 1920, 690, 540
        L = dict(ey=150, eye_sz=36, ul_dy=58, head_sz=88, head_gap=104, head_step=100,
                 cap_dy=14, cap_sz=36, glow1=(540, 700), glow2=(150, 1520),
                 pills_dy=56, pill_sz=34, pill_h=70, icon=96, name_sz=44, url_sz=32,
                 footer_by=1610, tag_y=1846, tag_sz=28, url_bar_sz=30)
    VY = WIN_TOP + BAR_H
    WIN_BOTTOM = VY + VH


# filename suffix per aspect so variants don't overwrite each other
SUFFIX = {"9:16": "", "4:5": "-4x5"}

set_aspect("9:16")

# ---------- scenes: screenshot + address-bar url ----------
SCENES = [
    ("web-site.png",   "www.ai-budget.pl"),
    ("web-site-1.png", "www.ai-budget.pl"),
    ("web-site-2.png", "www.ai-budget.pl/blog"),
    ("web-site-3.png", "app.ai-budget.pl"),
]

# --- PL only. Two narrative phases, top text crossfades between them. ---
# phase -> (eyebrow, headline, address label, address url)
PHASES = {
 "A": ("NOWA STRONA", "Poznaj naszą\nnową stronę", "Wizytówka i blog", "www.ai-budget.pl"),
 "B": ("WERSJA WEB",  "Aplikacja\nw przeglądarce", "Logujesz się na", "app.ai-budget.pl"),
}
SCENE_PHASE = ["A", "A", "A", "B"]      # one per SCENES entry
PILLS = ["Wizytówka", "Blog", "Wersja web"]
FOOTER_URL = "www.ai-budget.pl"

# timing
FPS = 30
HOLD_S = 3.8        # mp4 hold per screen (slow paging)
TRANS_S = 0.5
GIF_HOLD_MS = 3800  # gif hold per screen


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


def draw_footer(canvas, url):
    draw = ImageDraw.Draw(canvas)
    isz = L["icon"]
    icon = circle_img(Image.open(ICON), isz)
    by = L["footer_by"]
    name = "AI Budget Assistant"
    nf = ImageFont.truetype(HEAD_FONT, L["name_sz"])
    uf = ImageFont.truetype(SEMI_FONT, L["url_sz"])
    tri_w = 28
    name_w = tw(draw, name, nf)
    url_w = tri_w + tw(draw, url, uf)
    block_w = max(name_w, url_w)
    gap = 22
    x0 = (W - (isz + gap + block_w)) / 2
    icy = by + isz / 2
    off = round(isz * 0.22)
    # orange ring + icon
    draw.ellipse([x0-4, by-4, x0+isz+4, by+isz+4], outline=ORANGE, width=4)
    canvas.alpha_composite(icon, (int(x0), by))
    # text block, vertically centered on the icon (two lines around the center)
    tx = x0 + isz + gap
    draw.text((tx, icy - off), name, font=nf, fill=WHITE, anchor="lm")
    uy = icy + off
    draw.polygon([(tx+2, uy-9), (tx+2, uy+9), (tx+20, uy)], fill=ORANGE)
    draw.text((tx + tri_w, uy), url, font=uf, fill=ORANGE, anchor="lm")
    centered(canvas, L["tag_y"], "mi-code.pl", ImageFont.truetype(SUB_FONT, L["tag_sz"]), (150, 150, 158))


# ---------- poster background (fixed: no top text, no inner screenshot) ----------
def build_bg():
    canvas = vgradient((44, 28, 15), (11, 11, 14))
    canvas = glow(canvas, L["glow1"], (560, 520), ORANGE, 150, 200)
    canvas = glow(canvas, L["glow2"], (380, 360), (255, 90, 60), 55, 220)
    draw = ImageDraw.Draw(canvas)

    badge = Image.open(BADGE).convert("RGBA").resize((96, 96), Image.LANCZOS)
    canvas.alpha_composite(badge, (W - 96 - 52, 48))

    # window shadow + body + title bar + traffic dots (url drawn per-frame)
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
    draw_footer(canvas, FOOTER_URL)
    return canvas


def draw_caption(layer, y, label, url):
    """Centered 'label  →  url' — grey label, bold orange url (the address callout)."""
    d = ImageDraw.Draw(layer)
    lf = ImageFont.truetype(SUB_FONT, L["cap_sz"])
    uf = ImageFont.truetype(HEAD_FONT, L["cap_sz"])
    arrow = "  →  "
    lw, aw, uw = tw(d, label, lf), tw(d, arrow, lf), tw(d, url, uf)
    x = (W - (lw + aw + uw)) / 2
    d.text((x, y), label, font=lf, fill=GREY); x += lw
    d.text((x, y), arrow, font=lf, fill=GREY); x += aw
    d.text((x, y), url, font=uf, fill=ORANGE)


def build_top(phase):
    """Transparent full-canvas layer with eyebrow + headline + address caption."""
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
    md.rectangle([0, 0, VW-1, VH//2], fill=255)   # square the top edge
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
    """off in [0,1): fraction the current scene has slid up; blends scene->next."""
    n = len(SCENES)
    nxt = (scene + 1) % n
    e = ease(off)
    frame = bg.copy()

    # sliding screenshot inside the browser viewport
    content = Image.new("RGBA", (VW, VH), (22, 22, 27, 255))
    content.alpha_composite(shots[scene], (0, int(-e*VH)))
    if off > 0:
        content.alpha_composite(shots[nxt], (0, int((1-e)*VH)))
    content.putalpha(mask)
    frame.alpha_composite(content, (VX, VY))

    # address bar tracks the screenshot
    draw_url(frame, SCENES[scene][1] if off < 0.5 else SCENES[nxt][1])

    # top text — only changes when the transition crosses a phase boundary.
    # Sequential fade (old out in first half, new in second half) avoids
    # ghosted overlapping headlines at the same position.
    pc, pn = SCENE_PHASE[scene], SCENE_PHASE[nxt]
    if pc == pn:
        paste_alpha(frame, tops[pc], 1.0)
    else:
        paste_alpha(frame, tops[pc], max(0.0, 1 - 2*e))
        paste_alpha(frame, tops[pn], max(0.0, 2*e - 1))
    return frame


# ---------- render (PL only) ----------
def _prep():
    bg = build_bg()
    mask = viewport_mask()
    tops = {p: build_top(p) for p in PHASES}
    shots = [cover(Image.open(os.path.join(SRC, s)), VW, VH) for s, _ in SCENES]
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
    gif_path = os.path.join(outdir, f"web-site-reel{suffix}.gif")
    frames[0].save(gif_path, save_all=True, append_images=frames[1:], duration=durs,
                   loop=0, optimize=True, disposal=2)
    print("  built", os.path.relpath(gif_path, MK))


def render_mp4(suffix=""):
    bg, mask, shots, tops, outdir = _prep()
    n = len(SCENES)
    hold_f = int(HOLD_S * FPS)
    trans_f = int(TRANS_S * FPS)
    mp4_path = os.path.join(outdir, f"web-site-reel{suffix}.mp4")
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
    # usage: build_web_site_reel.py [gif|mp4|both] [9:16|4:5]
    args = sys.argv[1:]
    mode = "gif"
    if args and args[0] in ("gif", "mp4", "both"):
        mode, args = args[0], args[1:]
    aspect = args[0] if args and args[0] in SUFFIX else "9:16"
    main(mode, aspect)
