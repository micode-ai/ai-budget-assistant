# -*- coding: utf-8 -*-
"""
Render the "new website" story creatives (9:16) in the AI Budget Assistant
house style (matches web-story.jpg): dark gradient + orange glow, MICODE badge,
centered headline, browser-window mockup, orange pills, brand footer.

Announces:
  - www.ai-budget.pl  -> new landing / business-card site (+ blog, guides)
  - app.ai-budget.pl  -> the web app moved here (same login)

Source screenshots (in this folder):
  web-site.png    landing hero
  web-site-1.png  feature cards
  web-site-2.png  blog
  web-site-3.png  app login

Usage:
    python build_web_site_story.py            # all langs (pl ru en)
    python build_web_site_story.py pl
    python build_web_site_story.py pl ru en
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MK = os.path.dirname(SCRIPT_DIR)                    # docs/marketing
SRC = os.path.join(MK, "creatives", "web-site")     # source screenshots
OUT = os.path.join(SRC, "renders")                  # rendered posters
BADGE = os.path.join(MK, "assets", "micode-badge.png")
ICON = os.path.join(MK, "..", "..", "apps", "mobile", "assets", "icon.png")

# ---------- design tokens ----------
W, H = 1080, 1920
HEAD_FONT = "C:/Windows/Fonts/segoeuib.ttf"   # Segoe UI Bold
SEMI_FONT = "C:/Windows/Fonts/seguisb.ttf"    # Segoe UI Semibold
SUB_FONT  = "C:/Windows/Fonts/segoeui.ttf"    # Segoe UI
ORANGE = (245, 131, 42)
WHITE  = (250, 250, 252)
GREY   = (200, 203, 210)

# ---------- frames ----------
# each frame: source screenshot, url shown in the browser bar, copy keys, pills
FRAMES = [
    {"src": "web-site.png",   "url": "www.ai-budget.pl",      "cta": "www.ai-budget.pl", "key": "hero"},
    {"src": "web-site-1.png", "url": "www.ai-budget.pl",      "cta": "www.ai-budget.pl", "key": "features"},
    {"src": "web-site-2.png", "url": "www.ai-budget.pl/blog", "cta": "www.ai-budget.pl", "key": "blog"},
    {"src": "web-site-3.png", "url": "app.ai-budget.pl",      "cta": "app.ai-budget.pl", "key": "app"},
]

# lang -> key -> (eyebrow, headline, subtitle, [pill, pill, pill])
COPY = {
 "pl": {
   "hero":     ("NOWA STRONA", "Mamy nową\nstronę-wizytówkę",
                "Poznaj AI Budget Assistant w sieci",
                ["Wizytówka", "Blog", "9 języków"]),
   "features": ("WSZYSTKO W JEDNYM", "Cała aplikacja\nna jednej stronie",
                "Wydatki, budżety, AI, import z banku",
                ["Asystent AI", "Wspólny budżet", "Skan paragonów"]),
   "blog":     ("BLOG I PORADNIKI", "Poradniki\nfinansowe za darmo",
                "Budżet domowy, oszczędzanie, metoda kopertowa",
                ["Poradniki", "Bez Excela", "Krok po kroku"]),
   "app":      ("WERSJA WEB", "Aplikacja działa\nw przeglądarce",
                "Przeniesiona na app.ai-budget.pl — ten sam login",
                ["Bez instalacji", "Ten sam login", "Duży ekran"]),
 },
 "ru": {
   "hero":     ("НОВЫЙ САЙТ", "У нас новый\nсайт-визитка",
                "Знакомьтесь: AI Budget Assistant в сети",
                ["Визитка", "Блог", "9 языков"]),
   "features": ("ВСЁ В ОДНОМ", "Всё приложение\nна одной странице",
                "Расходы, бюджеты, AI, импорт из банка",
                ["AI-ассистент", "Общий бюджет", "Сканер чеков"]),
   "blog":     ("БЛОГ И ГАЙДЫ", "Гайды про\nфинансы — бесплатно",
                "Бюджет, накопления, метод конвертов",
                ["Гайды", "Без Excel", "По шагам"]),
   "app":      ("ВЕБ-ВЕРСИЯ", "Приложение —\nпрямо в браузере",
                "Переехало на app.ai-budget.pl — тот же вход",
                ["Без установки", "Тот же вход", "Большой экран"]),
 },
 "en": {
   "hero":     ("NEW WEBSITE", "Meet our new\nlanding site",
                "AI Budget Assistant, now on the web",
                ["Landing", "Blog", "9 languages"]),
   "features": ("ALL IN ONE", "The whole app\non one page",
                "Expenses, budgets, AI, bank import",
                ["AI assistant", "Shared budget", "Receipt scan"]),
   "blog":     ("BLOG & GUIDES", "Free personal\nfinance guides",
                "Budgeting, saving, the envelope method",
                ["Guides", "No Excel", "Step by step"]),
   "app":      ("WEB VERSION", "The app runs\nin your browser",
                "Moved to app.ai-budget.pl — same login",
                ["No install", "Same login", "Big screen"]),
 },
}

# ---------- helpers ----------
def vgradient(c0, c1):
    base = Image.new("RGB", (W, H), c0)
    d = ImageDraw.Draw(base)
    for y in range(H):
        t = y / (H - 1)
        col = tuple(int(c0[i] + (c1[i] - c0[i]) * t) for i in range(3))
        d.line([(0, y), (W, y)], fill=col)
    return base.convert("RGBA")


def glow(canvas, center, radii, color, alpha, blur):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center; rx, ry = radii
    d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color + (alpha,))
    return Image.alpha_composite(canvas, layer.filter(ImageFilter.GaussianBlur(blur)))


def round_img(img, r):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0]-1, img.size[1]-1], radius=r, fill=255)
    img = img.convert("RGBA"); img.putalpha(mask)
    return img


def circle_img(img, size):
    img = img.convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size-1, size-1], fill=255)
    img.putalpha(mask)
    return img


def text_w(draw, s, font):
    return draw.textlength(s, font=font)


def centered(img, y, s, font, fill):
    draw = ImageDraw.Draw(img)
    draw.text(((W - text_w(draw, s, font)) / 2, y), s, font=font, fill=fill)


def spaced(draw, y, s, font, fill, gap):
    """Draw letter-spaced, centered (used for the eyebrow)."""
    total = sum(text_w(draw, ch, font) + gap for ch in s) - gap
    x = (W - total) / 2
    for ch in s:
        draw.text((x, y), ch, font=font, fill=fill)
        x += text_w(draw, ch, font) + gap
    return total


def wrap(draw, text, font, max_w):
    out = []
    for para in text.split("\n"):
        words, cur = para.split(), ""
        for w in words:
            t = (cur + " " + w).strip()
            if text_w(draw, t, font) <= max_w:
                cur = t
            else:
                if cur: out.append(cur)
                cur = w
        out.append(cur)
    return out


def draw_lock(draw, cx, cy, col):
    """Tiny padlock glyph centered at (cx, cy)."""
    body_w, body_h = 14, 11
    x0, y0 = cx - body_w / 2, cy - 2
    draw.rounded_rectangle([x0, y0, x0 + body_w, y0 + body_h], radius=2, fill=col)
    draw.arc([cx - 5, y0 - 9, cx + 5, y0 + 3], start=180, end=360, fill=col, width=2)


def draw_browser(canvas, src_path, url):
    """Browser-window mockup with title bar (dots + secure url) + screenshot."""
    draw = ImageDraw.Draw(canvas)
    win_w = 1004
    bar_h = 76
    x = (W - win_w) // 2
    top = 690

    shot = Image.open(src_path).convert("RGB")
    shot_w = win_w
    shot_h = round(shot.height * shot_w / shot.width)
    shot = shot.resize((shot_w, shot_h), Image.LANCZOS)

    win_h = bar_h + shot_h

    # drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    blk = Image.new("RGBA", (win_w, win_h), (0, 0, 0, 0))
    ImageDraw.Draw(blk).rounded_rectangle([0, 0, win_w-1, win_h-1], radius=30, fill=(0, 0, 0, 165))
    shadow.alpha_composite(blk, (x, top + 30))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(46)))
    draw = ImageDraw.Draw(canvas)

    # window body + title bar
    draw.rounded_rectangle([x, top, x + win_w, top + win_h], radius=30, fill=(28, 28, 33, 255))
    draw.rounded_rectangle([x, top, x + win_w, top + bar_h], radius=30, fill=(46, 46, 53, 255))
    draw.rectangle([x, top + bar_h - 30, x + win_w, top + bar_h], fill=(46, 46, 53, 255))

    # traffic-light dots
    cy = top + bar_h // 2
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        cx = x + 34 + i * 30
        draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=c)

    # address pill (centered) with lock + url
    uf = ImageFont.truetype(SEMI_FONT, 30)
    uw = text_w(draw, url, uf)
    pill_w = uw + 96
    px0 = (W - pill_w) / 2
    draw.rounded_rectangle([px0, cy - 24, px0 + pill_w, cy + 24], radius=24, fill=(20, 20, 24, 255))
    draw_lock(draw, px0 + 34, cy, (39, 201, 63))
    draw.text((px0 + 58, cy - 19), url, font=uf, fill=(225, 227, 233))

    # screenshot, clipped to rounded bottom corners
    shot = round_img(shot, 8)
    canvas.alpha_composite(shot, (x, top + bar_h))

    # crisp outer border
    ImageDraw.Draw(canvas).rounded_rectangle(
        [x, top, x + win_w - 1, top + win_h - 1], radius=30, outline=(255, 255, 255, 40), width=3)
    return canvas, top + win_h


def draw_pills(canvas, y, pills):
    draw = ImageDraw.Draw(canvas)
    pf = ImageFont.truetype(SEMI_FONT, 34)
    padx, gap, h = 34, 24, 70
    widths = [text_w(draw, p, pf) + padx * 2 for p in pills]
    total = sum(widths) + gap * (len(pills) - 1)
    x = (W - total) / 2
    for p, w in zip(pills, widths):
        draw.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, outline=ORANGE, width=3)
        draw.text((x + padx, y + (h - 44) / 2), p, font=pf, fill=WHITE)
        x += w + gap


def draw_footer(canvas, url):
    draw = ImageDraw.Draw(canvas)
    icon = circle_img(Image.open(ICON), 124)
    cx_block_y = 1560

    name = "AI Budget Assistant"
    nf = ImageFont.truetype(HEAD_FONT, 52)
    uf = ImageFont.truetype(SEMI_FONT, 40)

    text_block_w = max(text_w(draw, name, nf), text_w(draw, "  " + url, uf))
    gap = 26
    total_w = 124 + gap + text_block_w
    x0 = (W - total_w) / 2

    # orange ring + icon
    ring = ImageDraw.Draw(canvas)
    ring.ellipse([x0 - 4, cx_block_y - 4, x0 + 128, cx_block_y + 128], outline=ORANGE, width=5)
    canvas.alpha_composite(icon, (int(x0), cx_block_y))

    tx = x0 + 124 + gap
    draw.text((tx, cx_block_y + 10), name, font=nf, fill=WHITE)
    # play triangle + url
    ty = cx_block_y + 70
    draw.polygon([(tx + 2, ty + 8), (tx + 2, ty + 32), (tx + 22, ty + 20)], fill=ORANGE)
    draw.text((tx + 34, ty + 2), url, font=uf, fill=ORANGE)

    # micode.pl tagline at the very bottom
    tf = ImageFont.truetype(SUB_FONT, 30)
    centered(canvas, 1838, "mi-code.pl", tf, (150, 150, 158))


# ---------- compose ----------
def build_one(frame, lang, out_path):
    eyebrow, headline, subtitle, pills = COPY[lang][frame["key"]]

    canvas = vgradient((44, 28, 15), (11, 11, 14))
    canvas = glow(canvas, (540, 700), (560, 520), ORANGE, 150, 200)
    canvas = glow(canvas, (150, 1520), (380, 360), (255, 90, 60), 55, 220)
    draw = ImageDraw.Draw(canvas)

    # MICODE badge top-right
    badge = Image.open(BADGE).convert("RGBA").resize((96, 96), Image.LANCZOS)
    canvas.alpha_composite(badge, (W - 96 - 52, 48))

    # eyebrow + underline
    ef = ImageFont.truetype(SEMI_FONT, 36)
    ey = 150
    ew = spaced(draw, ey, eyebrow, ef, ORANGE, 10)
    draw.rounded_rectangle([(W - 96) / 2, ey + 58, (W + 96) / 2, ey + 64], radius=3, fill=ORANGE)

    # headline (centered, multi-line)
    hf = ImageFont.truetype(HEAD_FONT, 88)
    y = ey + 104
    for line in wrap(draw, headline, hf, W - 150):
        centered(canvas, y, line, hf, WHITE)
        y += 100

    # subtitle (centered, wrapped)
    sf = ImageFont.truetype(SUB_FONT, 38)
    y += 8
    for line in wrap(draw, subtitle, sf, W - 180):
        centered(canvas, y, line, sf, GREY)
        y += 50

    # browser mockup
    canvas, win_bottom = draw_browser(canvas, os.path.join(SRC, frame["src"]), frame["url"])

    # pills below the window
    draw_pills(canvas, win_bottom + 60, pills)

    # footer
    draw_footer(canvas, frame["cta"])

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.convert("RGB").save(out_path, "PNG")


def main(langs):
    for lang in langs:
        if lang not in COPY:
            print(f"  no COPY for '{lang}', skipping"); continue
        for i, frame in enumerate(FRAMES, 1):
            out = os.path.join(OUT, lang, f"{i:02d}-{frame['key']}.png")
            build_one(frame, lang, out)
            print("  built", os.path.relpath(out, MK))


if __name__ == "__main__":
    langs = sys.argv[1:] or ["pl", "ru", "en"]
    main(langs)
