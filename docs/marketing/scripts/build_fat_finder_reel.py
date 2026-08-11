# -*- coding: utf-8 -*-
"""
Animated reel (MP4 + GIF) for the Fat Finder / "Audyt wydatkow" feature in
AI Budget Assistant (an AI audit of last month's spending: where the money
leaks, how much of it you could keep, and the receipts behind each finding).
Four phone screenshots cycle inside a phone bezel with vertical-slide
transitions over the shared warm-dark gradient + orange glow.

Icon layout (matches gamification / analytics / antinflation style):
  - Top right : app icon with orange ring
  - Bottom    : MICODE badge + mi-code.pl

Scene order (narrative: total -> biggest single saving -> hidden rise -> proof):
    0. hero     — Audyt: "Potencjalne miesieczne oszczednosci 1 807,37 zl", 5 znalezisk
    1. rent     — "Wysoki wydatek na mieszkanie" 4 350 -> 3 375, mozesz zaoszczedzic 975 zl
    2. clothes  — "Wydatki na ubrania wzrosly" +813%, 321,53 -> 100
    3. proof    — "Powiazane wydatki": lista paragonow z Biedronki pod znaleziskiem

Outputs in docs/marketing/creatives/fat-finder/renders/pl/:
    fat-finder-reel.mp4       1080x1920, 30fps
    fat-finder-reel.gif       600x1067
    fat-finder-reel-4x5.mp4
    fat-finder-reel-4x5.gif

Usage:
    python build_fat_finder_reel.py               # gif 9:16
    python build_fat_finder_reel.py mp4
    python build_fat_finder_reel.py both
    python build_fat_finder_reel.py both 4:5
"""
import os, sys, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import imageio.v2 as imageio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK    = os.path.dirname(SCRIPT_DIR)
OUT   = os.path.join(MK, "creatives", "fat-finder", "renders")
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON  = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

FF_DIR = os.path.join(MK, "creatives", "fat-finder")
SRC = [
    os.path.join(FF_DIR, "photo_6_2026-08-06_11-24-49.jpg"),  # hero: 1 807,37 zl + 5 znalezisk
    os.path.join(FF_DIR, "photo_4_2026-08-06_11-24-49.jpg"),  # mieszkanie: -975 zl
    os.path.join(FF_DIR, "photo_5_2026-08-06_11-24-49.jpg"),  # ubrania: +813%
    os.path.join(FF_DIR, "photo_1_2026-08-06_11-24-49.jpg"),  # powiazane wydatki (dowody)
]

# ---------- design tokens ----------
W = 1080
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)

PHASES = {
    "A": ("AUDYT WYDATKÓW",  "Gdzie uciekają\nTwoje pieniądze"),
    "B": ("KONKRETNE KWOTY", "Ile możesz\nzaoszczędzić"),
    "C": ("UKRYTE WZROSTY",  "Wydatki, które\nurosły po cichu"),
    "D": ("DOWODY W ŚRODKU", "Widzisz, z czego\nto wynika"),
}
SCENE_PHASE = ["A", "B", "C", "D"]
PILLS = ["Audyt AI", "Oszczędności", "Dowody"]
FOOTER_URL = "mi-code.pl"

FPS = 30
HOLD_S = 3.6
TRANS_S = 0.8
GIF_HOLD_MS = 3600

SUFFIX = {"9:16": "", "4:5": "-4x5"}

H = WIN_TOP = SCR_H = SCR_W = BEZEL = 0
L = {}


def set_aspect(aspect):
    global H, WIN_TOP, SCR_H, BEZEL, L
    if aspect == "4:5":
        H, WIN_TOP, SCR_H, BEZEL = 1344, 310, 770, 12
        L = dict(ey=44, eye_sz=28, ul_dy=42, head_sz=58, head_gap=72, head_step=68,
                 glow=(540, 490), pills_dy=20, pill_sz=24, pill_h=50, pill_padx=20, pill_gap=14,
                 badge_sz=66, badge_by=1190, url_dy=8, url_sz=22)
    else:
        H, WIN_TOP, SCR_H, BEZEL = 1920, 440, 1220, 14
        L = dict(ey=78, eye_sz=34, ul_dy=50, head_sz=82, head_gap=96, head_step=94,
                 glow=(540, 650), pills_dy=26, pill_sz=26, pill_h=54, pill_padx=24, pill_gap=16,
                 badge_sz=80, badge_by=1786, url_dy=10, url_sz=26)


def init_scr_w():
    global SCR_W
    img = Image.open(SRC[0])
    SCR_W = round(SCR_H * img.width / img.height)


# ---------- helpers ----------

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


def wrap_text(draw, text, font, max_w):
    out = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            t = (cur + " " + word).strip()
            if tw(draw, t, font) <= max_w:
                cur = t
            else:
                if cur:
                    out.append(cur)
                cur = word
        out.append(cur)
    return out


# ---------- phone geometry ----------

def phone_rect():
    pw = SCR_W + BEZEL * 2
    ph = SCR_H + BEZEL * 2
    px = (W - pw) // 2
    return px, WIN_TOP, pw, ph


def screen_origin():
    px, py, _, _ = phone_rect()
    return px + BEZEL, py + BEZEL


# ---------- background ----------

def build_bg():
    canvas = vgradient((44, 28, 15), (11, 11, 14))
    gx, gy = L["glow"]
    canvas = add_glow(canvas, (gx, gy), (620, 580), ORANGE, 140, 200)
    canvas = add_glow(canvas, (140, H - 360), (380, 360), (255, 80, 50), 46, 220)

    # top right: app icon with orange ring
    icon_sz = 92
    icon = circle_img(Image.open(ICON), icon_sz)
    draw = ImageDraw.Draw(canvas)
    draw.ellipse([W-icon_sz-52-4, 48-4, W-52+4, 48+icon_sz+4], outline=ORANGE, width=4)
    canvas.alpha_composite(icon, (W - icon_sz - 52, 48))

    # phone shadow
    px, py, pw, ph = phone_rect()
    radius = round(BEZEL * 2.2)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
    ImageDraw.Draw(blk).rounded_rectangle([0, 0, pw-1, ph-1], radius=radius, fill=(0, 0, 0, 170))
    shadow.alpha_composite(blk, (px, py + 28))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(42)))

    # phone body
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle([px, py, px+pw, py+ph], radius=radius, fill=(18, 18, 20, 255))
    draw.rounded_rectangle([px, py, px+pw, py+ph], radius=radius, outline=(58, 58, 65, 255), width=2)

    # pills
    _, _, _, ph_val = phone_rect()
    _draw_pills(canvas, WIN_TOP + ph_val + L["pills_dy"])

    # bottom: MICODE badge + mi-code.pl
    _draw_footer(canvas)
    return canvas


def _draw_pills(canvas, y):
    draw = ImageDraw.Draw(canvas)
    pf = ImageFont.truetype(SEMI_FONT, L["pill_sz"])
    padx, gap, ph = L["pill_padx"], L["pill_gap"], L["pill_h"]
    widths = [tw(draw, p, pf) + padx * 2 for p in PILLS]
    total = sum(widths) + gap * (len(PILLS) - 1)
    x = (W - total) / 2
    for p, pw in zip(PILLS, widths):
        draw.rounded_rectangle([x, y, x+pw, y+ph], radius=ph//2, outline=ORANGE, width=3)
        draw.text((x + padx, y + ph / 2), p, font=pf, fill=WHITE, anchor="lm")
        x += pw + gap


def _draw_footer(canvas):
    bsz = L["badge_sz"]
    badge = circle_img(Image.open(BADGE), bsz)
    bx = (W - bsz) // 2
    by = L["badge_by"]
    canvas.alpha_composite(badge, (bx, by))
    uf = ImageFont.truetype(SEMI_FONT, L["url_sz"])
    centered(canvas, by + bsz + L["url_dy"], FOOTER_URL, uf, GREY)


# ---------- text layer ----------

def build_top(phase):
    eyebrow, headline = PHASES[phase]
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw  = ImageDraw.Draw(layer)
    ef = ImageFont.truetype(SEMI_FONT, L["eye_sz"])
    ey = L["ey"]
    spaced(draw, ey, eyebrow, ef, ORANGE, 8)
    draw.rounded_rectangle([(W-96)/2, ey+L["ul_dy"], (W+96)/2, ey+L["ul_dy"]+6],
                            radius=3, fill=ORANGE)
    hf = ImageFont.truetype(HEAD_FONT, L["head_sz"])
    y = ey + L["head_gap"]
    for line in wrap_text(draw, headline, hf, W - 150):
        centered(layer, y, line, hf, WHITE)
        y += L["head_step"]
    return layer


# ---------- animation ----------

def viewport_mask():
    m = Image.new("L", (SCR_W, SCR_H), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, SCR_W-1, SCR_H-1],
                                         radius=round(BEZEL * 2.0), fill=255)
    return m


def ease(t):
    return t * t * (3 - 2 * t)


def paste_alpha(canvas, layer, factor):
    if factor >= 0.999:
        canvas.alpha_composite(layer); return
    if factor <= 0.001:
        return
    a = layer.getchannel("A").point(lambda v: int(v * factor))
    l = layer.copy(); l.putalpha(a)
    canvas.alpha_composite(l)


def compose(bg, mask, shots, tops, scene, off):
    n   = len(shots)
    nxt = (scene + 1) % n
    e   = ease(off)
    sx, sy = screen_origin()

    frame = bg.copy()
    content = Image.new("RGBA", (SCR_W, SCR_H), (22, 22, 27, 255))
    content.alpha_composite(shots[scene], (0, int(-e * SCR_H)))
    if off > 0:
        content.alpha_composite(shots[nxt], (0, int((1 - e) * SCR_H)))
    content.putalpha(mask)
    frame.alpha_composite(content, (sx, sy))

    pc, pn = SCENE_PHASE[scene], SCENE_PHASE[nxt]
    if pc == pn:
        paste_alpha(frame, tops[pc], 1.0)
    else:
        paste_alpha(frame, tops[pc], max(0.0, 1 - 2*e))
        paste_alpha(frame, tops[pn], max(0.0, 2*e - 1))
    return frame


# ---------- prepare ----------

def _prep():
    init_scr_w()
    bg   = build_bg()
    mask = viewport_mask()
    tops = {p: build_top(p) for p in PHASES}
    shots = []
    for p in SRC:
        img = Image.open(p).convert("RGBA").resize((SCR_W, SCR_H), Image.LANCZOS)
        shots.append(img)
    outdir = os.path.join(OUT, "pl")
    os.makedirs(outdir, exist_ok=True)
    return bg, mask, shots, tops, outdir


# ---------- renderers ----------

def render_gif(suffix=""):
    bg, mask, shots, tops, outdir = _prep()
    n = len(shots)
    gw, gh = 600, round(600 * H / W)
    frames, durs = [], []
    for i in range(n):
        frames.append(compose(bg, mask, shots, tops, i, 0.0)
                      .convert("RGB").resize((gw, gh), Image.LANCZOS))
        durs.append(GIF_HOLD_MS)
        for t in (0.3, 0.55, 0.78, 1.0):
            frames.append(compose(bg, mask, shots, tops, i, t)
                          .convert("RGB").resize((gw, gh), Image.LANCZOS))
            durs.append(60)
    path = os.path.join(outdir, f"fat-finder-reel{suffix}.gif")
    frames[0].save(path, save_all=True, append_images=frames[1:],
                   duration=durs, loop=0, optimize=True, disposal=2)
    print("  built", os.path.relpath(path, MK))


def render_mp4(suffix=""):
    import imageio_ffmpeg
    bg, mask, shots, tops, outdir = _prep()
    n = len(shots)
    hold_f  = int(HOLD_S * FPS)
    trans_f = int(TRANS_S * FPS)
    tmp  = os.path.join(outdir, f"_tmp{suffix}.mp4")
    path = os.path.join(outdir, f"fat-finder-reel{suffix}.mp4")

    writer = imageio.get_writer(tmp, fps=FPS, codec="libx264", quality=8,
                                macro_block_size=2, pixelformat="yuv420p")
    for i in range(n):
        still = np.array(compose(bg, mask, shots, tops, i, 0.0).convert("RGB"))
        for _ in range(hold_f):
            writer.append_data(still)
        for t in range(1, trans_f + 1):
            writer.append_data(
                np.array(compose(bg, mask, shots, tops, i, t / trans_f).convert("RGB"))
            )
    writer.close()

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run([
        ffmpeg, "-y", "-i", tmp,
        "-c:v", "libx264", "-profile:v", "main", "-level", "4.0",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-crf", "18",
        path,
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    os.remove(tmp)
    print("  built", os.path.relpath(path, MK))


# ---------- entry ----------

def main(mode, aspect):
    set_aspect(aspect)
    print(f"[{aspect}] {W}x{H}  mode={mode}")
    if mode in ("gif", "both"):
        render_gif(SUFFIX[aspect])
    if mode in ("mp4", "both"):
        render_mp4(SUFFIX[aspect])


if __name__ == "__main__":
    args = sys.argv[1:]
    mode = "gif"
    if args and args[0] in ("gif", "mp4", "both"):
        mode, args = args[0], args[1:]
    aspect = args[0] if args and args[0] in SUFFIX else "9:16"
    main(mode, aspect)
