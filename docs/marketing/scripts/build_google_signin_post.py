# -*- coding: utf-8 -*-
"""
Static social POST announcing Google sign-in ("Continue with Google") in the
AI Budget Assistant app — same brand language as the other AI Budget creatives
(dark + orange, framed phone screenshot, app-icon footer, mi-code.pl).

Source phone screenshot: d:/Work/screens/photo_2026-06-25_14-00-34.jpg (login
screen showing the "Continue with Google" button).

Outputs (PL) in docs/marketing/creatives/google-signin/:
    google-signin-post.png       1080x1350  (4:5 Instagram/Facebook feed)
    google-signin-post-1x1.png   1080x1080  (square)
    google-signin-post-9x16.png  1080x1920  (story)

Usage:
    python build_google_signin_post.py            # all three
    python build_google_signin_post.py 4:5
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK = os.path.dirname(SCRIPT_DIR)                       # docs/marketing
SHOT = r"d:/Work/screens/photo_2026-06-25_14-00-34.jpg"
ICON = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")
BADGE = os.path.join(MK, "assets", "micode-badge.png")   # MICODE company logo
OUT = os.path.join(MK, "creatives", "google-signin")

# ---------- design tokens ----------
W = 1080
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (188, 192, 200)

# copy (PL)
EYEBROW  = "NOWA FUNKCJA"
HEAD1    = "Logowanie"
HEAD2    = "przez Google"
SUBLINE  = "Bez hasła — w kilka sekund."
URL      = "mi-code.pl"

ASPECTS = {
    "4:5":  dict(file="google-signin-post.png",      H=1350),
    "1:1":  dict(file="google-signin-post-1x1.png",  H=1080),
    "9:16": dict(file="google-signin-post-9x16.png", H=1920),
}

# per-aspect layout, filled by layout()
H = 0
L = {}


def layout(aspect):
    global H, L
    H = ASPECTS[aspect]["H"]
    if aspect == "1:1":
        L = dict(ey=40, eye_sz=28, ul_dy=42, head_sz=60, head_gap=74, head_step=66,
                 sub_dy=10, sub_sz=26, phone_top=292, phone_h=576,
                 glow=(540, 470), badge_by=918, badge_sz=78, url_sz=26, url_dy=12)
    elif aspect == "9:16":
        L = dict(ey=110, eye_sz=36, ul_dy=56, head_sz=92, head_gap=120, head_step=108,
                 sub_dy=20, sub_sz=38, phone_top=520, phone_h=1096,
                 glow=(540, 720), badge_by=1696, badge_sz=104, url_sz=32, url_dy=16)
    else:  # 4:5
        L = dict(ey=56, eye_sz=32, ul_dy=48, head_sz=78, head_gap=92, head_step=86,
                 sub_dy=14, sub_sz=32, phone_top=372, phone_h=752,
                 glow=(540, 560), badge_by=1176, badge_sz=92, url_sz=30, url_dy=14)


# ---------- helpers ----------
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


def rounded(img, radius):
    img = img.convert("RGBA")
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width-1, img.height-1], radius=radius, fill=255)
    img.putalpha(m)
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


def draw_phone(canvas):
    shot = Image.open(SHOT).convert("RGB")
    ratio = shot.width / shot.height
    sh = L["phone_h"]
    sw = round(sh * ratio)
    scr = rounded(shot.resize((sw, sh), Image.LANCZOS), round(sw * 0.10))
    bez = 16
    bw, bh = sw + bez*2, sh + bez*2
    px = (W - bw) // 2
    py = L["phone_top"]
    # drop shadow
    sh_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    ImageDraw.Draw(blk).rounded_rectangle([0, 0, bw-1, bh-1], radius=round(sw*0.10)+bez, fill=(0, 0, 0, 180))
    sh_layer.alpha_composite(blk, (px, py + 26))
    canvas = Image.alpha_composite(canvas, sh_layer.filter(ImageFilter.GaussianBlur(40)))
    # bezel
    d = ImageDraw.Draw(canvas)
    d.rounded_rectangle([px, py, px+bw, py+bh], radius=round(sw*0.10)+bez, fill=(18, 18, 20, 255))
    d.rounded_rectangle([px, py, px+bw, py+bh], radius=round(sw*0.10)+bez, outline=(60, 60, 66, 255), width=2)
    canvas.alpha_composite(scr, (px + bez, py + bez))
    return canvas


def draw_footer(canvas):
    """Clean company sign-off: centered MICODE logo + mi-code.pl (no triangle)."""
    bsz = L["badge_sz"]
    badge = circle_img(Image.open(BADGE), bsz)
    bx = (W - bsz) // 2
    by = L["badge_by"]
    canvas.alpha_composite(badge, (bx, by))
    uf = ImageFont.truetype(SEMI_FONT, L["url_sz"])
    centered(canvas, by + bsz + L["url_dy"], URL, uf, GREY)


def build():
    canvas = vgradient((26, 19, 13), (7, 7, 9))           # warm-dark -> near-black
    canvas = glow(canvas, L["glow"], (560, 470), ORANGE, 120, 200)
    draw = ImageDraw.Draw(canvas)

    # top-right app badge
    badge = circle_img(Image.open(ICON), 92)
    draw.ellipse([W-92-52-4, 48-4, W-52+4, 48+92+4], outline=ORANGE, width=4)
    canvas.alpha_composite(badge, (W - 92 - 52, 48))

    # eyebrow + underline
    ef = ImageFont.truetype(SEMI_FONT, L["eye_sz"])
    spaced(draw, L["ey"], EYEBROW, ef, ORANGE, 10)
    draw.rounded_rectangle([(W-96)/2, L["ey"]+L["ul_dy"], (W+96)/2, L["ey"]+L["ul_dy"]+6], radius=3, fill=ORANGE)

    # two-tone headline
    hf = ImageFont.truetype(HEAD_FONT, L["head_sz"])
    y = L["ey"] + L["head_gap"]
    centered(canvas, y, HEAD1, hf, WHITE)
    centered(canvas, y + L["head_step"], HEAD2, hf, ORANGE)

    # subline
    sf = ImageFont.truetype(SUB_FONT, L["sub_sz"])
    centered(canvas, y + L["head_step"]*2 + L["sub_dy"], SUBLINE, sf, GREY)

    canvas = draw_phone(canvas)
    draw_footer(canvas)
    return canvas


def main(which):
    os.makedirs(OUT, exist_ok=True)
    for aspect in (which if which else list(ASPECTS)):
        layout(aspect)
        img = build().convert("RGB")
        path = os.path.join(OUT, ASPECTS[aspect]["file"])
        img.save(path, quality=95)
        print("  built", os.path.relpath(path, MK), f"{W}x{H}")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a in ASPECTS]
    main(args)
