# -*- coding: utf-8 -*-
"""
"Nasze małe sukcesy" reel: the first three months of ai-budget.pl in Google
Search (Search Console, 2026-06-19 .. 2026-09-22). Animated, frame-time based
(no phone bezel): the impressions curve draws itself left to right while the
two counters tick up, then the "60 clicks in 28 days" badge lands.

Data is DIGITISED from the user's Search Console screenshot (daily series
read off the chart pixels), then scaled so the totals match the numbers the
panel prints: 107 clicks, 10K impressions, avg position 20.8. The tone is
deliberately modest — these are small numbers and the copy says so. Do not
reword into growth-hacker bragging, and do not claim page one (avg 20.8 is
page two/three).

No Google logo or Google-styled artwork: we cite the source in text only.

Outputs in docs/marketing/creatives/google-search-milestone/renders/pl/:
    google-search-milestone-reel.mp4 / .gif         1080x1920
    google-search-milestone-reel-4x5.mp4 / .gif     1080x1344

Usage:
    python build_google_search_milestone_reel.py            # mp4+gif, 9:16
    python build_google_search_milestone_reel.py both 4:5
    python build_google_search_milestone_reel.py still 9:16 8.5   # one frame at t=8.5s
"""
import os, sys, math, subprocess
import numpy as np
import imageio
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK = os.path.dirname(SCRIPT_DIR)
SLUG = "google-search-milestone"
OUT = os.path.join(MK, "creatives", SLUG, "renders", "pl")
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
GOLD = (251, 188, 5)
WHITE = (250, 250, 252)
GREY = (200, 203, 210)
DIM = (130, 133, 142)
CARD = (30, 30, 36)
CARD_LINE = (60, 60, 70)

FPS = 30
T_INTRO = 2.0      # headline alone
T_DRAW = 6.0       # chart draws itself
T_OUTRO = 5.0      # badge + thanks
TOTAL = T_INTRO + T_DRAW + T_OUTRO

EYEBROW = "NASZE MAŁE SUKCESY"
HEADLINE = "Google nas zauważył"
SUBTITLE = "Pierwsze 3 miesiące ai-budget.pl w wyszukiwarce"
THANKS = "Skromnie, ale rośniemy. Dziękujemy!"
SOURCE = "Źródło: Google Search Console, 19.06–22.09.2026"
FOOTER_URL = "ai-budget.pl"
MONTHS = [(0, "cze"), (12, "lip"), (43, "sie"), (74, "wrz")]  # day index of the 1st

# Daily series digitised from the Search Console chart, day 0 = 2026-06-19.
IMPRESSIONS_RAW = [0, 0, 1, 8, 8, 4, 1, 1, 11, 7, 37, 50, 47, 44, 44, 44, 48, 44, 52, 37,
    42, 52, 51, 40, 45, 41, 31, 31, 33, 30, 23, 34, 34, 33, 31, 30, 38, 45, 52, 58, 62, 59,
    61, 62, 78, 86, 91, 109, 127, 125, 112, 117, 120, 130, 134, 122, 100, 91, 108, 126, 130,
    127, 126, 112, 99, 112, 119, 130, 132, 129, 139, 156, 168, 191, 232, 263, 231, 241, 212,
    225, 229, 245, 253, 272, 284, 215, 246, 272, 294, 233, 219, 178, 149, 144, 133, 133]
CLICKS_RAW = [0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 2, 0, 2, 0, 1, 0, 0, 0, 0, 0, 2, 1,
    1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 2, 1, 0, 3, 3, 0, 1, 0,
    1, 2, 1, 0, 1, 1, 3, 2, 1, 2, 2, 3, 1, 2, 2, 0, 1, 2, 1, 3, 4, 1, 0, 3, 4, 1, 3, 3, 3, 3,
    3, 4, 1, 2, 2, 2, 2, 0, 2, 0]
TOTAL_IMPR = 10000   # panel prints "10K"
TOTAL_CLICKS = 107
N = len(IMPRESSIONS_RAW)

_si = sum(IMPRESSIONS_RAW)
IMPR = [v * TOTAL_IMPR / _si for v in IMPRESSIONS_RAW]
_sc = sum(CLICKS_RAW)
CLK = [v * TOTAL_CLICKS / _sc for v in CLICKS_RAW]
# light 3-day smoothing for the drawn curve only (counters use the raw sums)
IMPR_S = [sum(IMPR[max(0, i-1):i+2]) / len(IMPR[max(0, i-1):i+2]) for i in range(N)]
CUM_I = np.cumsum(IMPR)
CUM_C = np.cumsum(CLK)

W = H = 0
L = {}


def set_aspect(aspect):
    global W, H, L
    W = 1080
    if aspect == "9:16":
        H = 1920
        L = dict(ey=110, ef=30, hy=200, hf=78, sy=310, sf=32,
                 cy=400, ch=210, cbig=84, ctag=28, csub=28,
                 gy=660, gh=600, badge_y=1330, hex_r=120, bnum=86, btxt=36,
                 thanks_y=1640, thf=40, src_y=1705, srcf=24, foot_y=1770, bsz=70)
    else:
        H = 1344
        L = dict(ey=64, ef=25, hy=128, hf=62, sy=216, sf=27,
                 cy=286, ch=170, cbig=68, ctag=24, csub=24,
                 gy=486, gh=420, badge_y=935, hex_r=88, bnum=64, btxt=30,
                 thanks_y=1150, thf=34, src_y=1204, srcf=21, foot_y=1250, bsz=0)


def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out_back(t):
    t = max(0.0, min(1.0, t))
    c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def tw(draw, s, font):
    return draw.textlength(s, font=font)


def centered(draw, y, s, font, fill, cx=None):
    cx = W / 2 if cx is None else cx
    draw.text((cx - tw(draw, s, font) / 2, y), s, font=font, fill=fill)


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


def fmt_int(v):
    return f"{int(round(v)):,}".replace(",", " ")


def fade_layer(canvas, layer, a):
    if a <= 0:
        return canvas
    if a < 1:
        r, g, b, al = layer.split()
        al = al.point(lambda p: int(p * a))
        layer = Image.merge("RGBA", (r, g, b, al))
    return Image.alpha_composite(canvas, layer)


# ---------------------------------------------------------------- static bg
def build_bg():
    c = vgradient((44, 28, 15), (11, 11, 14))
    c = add_glow(c, (540, int(H * 0.28)), (620, 540), ORANGE, 120, 200)
    c = add_glow(c, (150, H - 300), (360, 340), (255, 80, 50), 40, 220)
    d = ImageDraw.Draw(c)
    isz, ring = (88, 4) if H > 1500 else (72, 4)
    d.ellipse([W-isz-48-ring, 44-ring, W-48+ring, 44+isz+ring], outline=ORANGE, width=ring)
    c.alpha_composite(circle_img(Image.open(ICON), isz), (W - isz - 48, 44))
    if L["bsz"]:
        bsz = L["bsz"]
        c.alpha_composite(circle_img(Image.open(BADGE), bsz), ((W - bsz) // 2 - 90, L["foot_y"]))
        uf = ImageFont.truetype(SEMI_FONT, 30)
        d.text(((W - bsz) // 2 - 90 + bsz + 18, L["foot_y"] + (bsz - 36) // 2), FOOTER_URL, font=uf, fill=GREY)
    else:
        uf = ImageFont.truetype(SEMI_FONT, 26)
        centered(d, L["foot_y"], "MICODE  ·  " + FOOTER_URL, uf, GREY)
    return c


def header_layer(a_head, a_sub):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    ef = ImageFont.truetype(SEMI_FONT, L["ef"])
    spaced(d, L["ey"], EYEBROW, ef, ORANGE, 8)
    d.rounded_rectangle([(W-96)/2, L["ey"]+L["ef"]+14, (W+96)/2, L["ey"]+L["ef"]+20], radius=3, fill=ORANGE)
    hf = ImageFont.truetype(HEAD_FONT, L["hf"])
    centered(d, L["hy"], HEADLINE, hf, WHITE)
    out = lay
    if a_sub > 0:
        s = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sf = ImageFont.truetype(SUB_FONT, L["sf"])
        centered(ImageDraw.Draw(s), L["sy"], SUBTITLE, sf, GREY)
        out = fade_layer(out, s, a_sub)
    return out, a_head


def counter_card(d, x0, y, cw, ch, tag, value, sub, accent):
    d.rounded_rectangle([x0, y, x0 + cw, y + ch], radius=30, fill=CARD, outline=CARD_LINE, width=2)
    d.rounded_rectangle([x0, y + 16, x0 + 12, y + ch - 16], radius=6, fill=accent)
    tx = x0 + 44
    tf = ImageFont.truetype(SEMI_FONT, L["ctag"])
    bf = ImageFont.truetype(HEAD_FONT, L["cbig"])
    sf = ImageFont.truetype(SUB_FONT, L["csub"])
    d.text((tx, y + int(ch * 0.12)), tag, font=tf, fill=accent)
    by = y + int(ch * 0.27)
    d.text((tx, by), value, font=bf, fill=WHITE)
    # anchor the descriptor to digit height, not the value's ink box: "tys." has a
    # descender and would otherwise push the line into the card border
    bb = d.textbbox((tx, by), "0", font=bf)[3]
    d.text((tx, bb + int(ch * 0.07)), sub, font=sf, fill=GREY)


def counters_layer(p):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    mx, gap = 70, 30
    cw = (W - 2 * mx - gap) // 2
    idx = p * (N - 1)
    i0 = int(idx)
    frac = idx - i0
    ci = CUM_I[i0] + (CUM_I[min(i0+1, N-1)] - CUM_I[i0]) * frac if p > 0 else 0
    cc = CUM_C[i0] + (CUM_C[min(i0+1, N-1)] - CUM_C[i0]) * frac if p > 0 else 0
    iv = "10 tys." if p >= 1 else fmt_int(ci)
    cv = str(TOTAL_CLICKS) if p >= 1 else fmt_int(cc)
    counter_card(d, mx, L["cy"], cw, L["ch"], "WYŚWIETLENIA", iv, "w wynikach Google", ORANGE)
    counter_card(d, mx + cw + gap, L["cy"], cw, L["ch"], "KLIKNIĘCIA", cv, "wejść z wyszukiwarki", GOLD)
    return lay


def chart_layer(p):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    x0, x1 = 70, W - 70
    y0, y1 = L["gy"], L["gy"] + L["gh"]
    d.rounded_rectangle([x0, y0, x1, y1], radius=30, fill=CARD, outline=CARD_LINE, width=2)
    lf = ImageFont.truetype(SEMI_FONT, 24 if H > 1500 else 21)
    d.text((x0 + 36, y0 + 26), "Wyświetlenia dziennie", font=lf, fill=ORANGE)
    lw = tw(d, "Kliknięcia", lf)
    d.text((x1 - 36 - lw, y0 + 26), "Kliknięcia", font=lf, fill=GOLD)

    px0, px1 = x0 + 40, x1 - 40
    top = y0 + 80
    clk_band = int(L["gh"] * 0.16)
    base = y1 - 70 - clk_band - 16          # impressions baseline
    cbase = y1 - 70                          # clicks baseline
    ymax = max(IMPR_S) * 1.08
    for frac_g in (0.25, 0.5, 0.75, 1.0):
        gy = base - (base - top) * frac_g
        d.line([(px0, gy), (px1, gy)], fill=(48, 48, 56), width=1)
    d.line([(px0, base), (px1, base)], fill=(70, 70, 80), width=2)

    step = (px1 - px0) / (N - 1)
    mf = ImageFont.truetype(SUB_FONT, 24 if H > 1500 else 21)
    for di, name in MONTHS:
        mx_ = px0 + di * step
        d.line([(mx_, cbase + 6), (mx_, cbase + 14)], fill=DIM, width=2)
        d.text((mx_ + 6, cbase + 12), name, font=mf, fill=DIM)

    if p <= 0:
        return lay
    last = p * (N - 1)
    pts = []
    for i in range(N):
        if i > last:
            break
        pts.append((px0 + i * step, base - (base - top) * IMPR_S[i] / ymax))
    i0 = int(last)
    if i0 < N - 1 and last > i0:
        f = last - i0
        v = IMPR_S[i0] + (IMPR_S[i0+1] - IMPR_S[i0]) * f
        pts.append((px0 + last * step, base - (base - top) * v / ymax))

    # gradient area under the curve
    if len(pts) >= 2:
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(pts + [(pts[-1][0], base), (pts[0][0], base)], fill=255)
        grad = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(grad)
        for yy in range(int(top), int(base) + 1):
            t = (yy - top) / max(1, base - top)
            gd.line([(px0, yy), (px1, yy)], fill=ORANGE + (int(150 * (1 - t) + 20),))
        from PIL import ImageChops
        grad.putalpha(ImageChops.multiply(grad.split()[3], mask))
        lay = Image.alpha_composite(lay, grad)
        d = ImageDraw.Draw(lay)
        d.line(pts, fill=ORANGE, width=6, joint="curve")
        ex, ey_ = pts[-1]
        d.ellipse([ex - 11, ey_ - 11, ex + 11, ey_ + 11], fill=WHITE, outline=ORANGE, width=4)

    # click bars in the lower band
    cmax = max(CLK)
    bw = max(3, int(step * 0.55))
    for i in range(N):
        if i > last:
            break
        if CLK[i] <= 0:
            continue
        h = (clk_band) * CLK[i] / cmax
        cx = px0 + i * step
        d.rounded_rectangle([cx - bw / 2, cbase - h, cx + bw / 2, cbase], radius=2, fill=GOLD)
    return lay


def hexagon(cx, cy, r):
    return [(cx + r * math.cos(math.radians(60 * k - 90)), cy + r * math.sin(math.radians(60 * k - 90))) for k in range(6)]


def badge_layer(s, a_txt):
    """s: scale-in progress 0..1 for the hexagon; a_txt: text fade."""
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if s <= 0:
        return lay
    d = ImageDraw.Draw(lay)
    r = L["hex_r"] * ease_out_back(s)
    cx = 70 + L["hex_r"] + 20
    cy = L["badge_y"] + L["hex_r"] + 10
    d.polygon(hexagon(cx, cy, r), fill=GOLD)
    d.polygon(hexagon(cx, cy, r * 0.8), fill=(255, 214, 102))
    nf = ImageFont.truetype(HEAD_FONT, max(10, int(L["bnum"] * ease_out_back(s))))
    t = "60"
    bb = d.textbbox((0, 0), t, font=nf)
    d.text((cx - (bb[2] + bb[0]) / 2, cy - (bb[3] + bb[1]) / 2), t, font=nf, fill=(40, 30, 10))
    if a_txt > 0:
        txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        td = ImageDraw.Draw(txt)
        tx = cx + L["hex_r"] + 44
        f1 = ImageFont.truetype(HEAD_FONT, L["btxt"] + 6)
        f2 = ImageFont.truetype(SUB_FONT, L["btxt"] - 4)
        line_h = L["btxt"] + 16
        yy = cy - line_h * 1.5
        td.text((tx, yy), "60 kliknięć w 28 dni", font=f1, fill=WHITE)
        td.text((tx, yy + line_h + 8), "gratulacje od", font=f2, fill=GREY)
        td.text((tx, yy + 2 * line_h + 8), "Google Search Console", font=f2, fill=GREY)
        lay = fade_layer(lay, txt, a_txt)
    return lay


def outro_text_layer(a):
    lay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if a <= 0:
        return lay
    d = ImageDraw.Draw(lay)
    centered(d, L["thanks_y"], THANKS, ImageFont.truetype(SEMI_FONT, L["thf"]), ORANGE)
    centered(d, L["src_y"], SOURCE, ImageFont.truetype(SUB_FONT, L["srcf"]), DIM)
    return fade_layer(Image.new("RGBA", (W, H), (0, 0, 0, 0)), lay, a)


def frame(bg, t):
    c = bg.copy()
    hdr, a = header_layer(1, ease((t - 0.5) / 0.6))
    c = fade_layer(c, hdr, ease(t / 0.5))
    a_panels = ease((t - 1.2) / 0.6)
    p = ease((t - T_INTRO) / T_DRAW)
    c = fade_layer(c, counters_layer(p), a_panels)
    c = fade_layer(c, chart_layer(p), a_panels)
    to = t - T_INTRO - T_DRAW
    c = Image.alpha_composite(c, badge_layer(ease(to / 0.7) if to > 0 else 0, ease((to - 0.5) / 0.5)))
    c = Image.alpha_composite(c, outro_text_layer(ease((to - 1.4) / 0.6)))
    return c


def render(aspect, mode):
    set_aspect(aspect)
    os.makedirs(OUT, exist_ok=True)
    suffix = "" if aspect == "9:16" else "-4x5"
    bg = build_bg()
    nfr = int(TOTAL * FPS)
    if mode in ("mp4", "both"):
        import imageio_ffmpeg
        tmp = os.path.join(OUT, f"_tmp{suffix}.mp4")
        path = os.path.join(OUT, f"{SLUG}-reel{suffix}.mp4")
        w = imageio.get_writer(tmp, fps=FPS, codec="libx264", quality=8, macro_block_size=2, pixelformat="yuv420p")
        for i in range(nfr):
            w.append_data(np.array(frame(bg, i / FPS).convert("RGB")))
        w.close()
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", tmp, "-c:v", "libx264",
                        "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p",
                        "-movflags", "+faststart", "-crf", "18", path],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        os.remove(tmp)
        print("  built", os.path.relpath(path, MK))
    if mode in ("gif", "both"):
        gfps = 12
        frames = []
        for i in range(int(TOTAL * gfps)):
            f = frame(bg, i / gfps).convert("RGB")
            frames.append(f.resize((W // 2, H // 2), Image.LANCZOS))
        frames += [frames[-1]] * gfps  # small tail hold
        path = os.path.join(OUT, f"{SLUG}-reel{suffix}.gif")
        frames[0].save(path, save_all=True, append_images=frames[1:], duration=int(1000 / gfps), loop=0, optimize=True)
        print("  built", os.path.relpath(path, MK))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "both"
    aspect = sys.argv[2] if len(sys.argv) > 2 else "9:16"
    if mode == "still":
        set_aspect(aspect)
        tt = float(sys.argv[3]) if len(sys.argv) > 3 else TOTAL
        os.makedirs(OUT, exist_ok=True)
        pth = os.path.join(OUT, f"_still-{aspect.replace(':','x')}-{tt}.png")
        frame(build_bg(), tt).convert("RGB").save(pth)
        print(pth)
    else:
        for a in (["9:16", "4:5"] if aspect == "both" else [aspect]):
            render(a, mode)
