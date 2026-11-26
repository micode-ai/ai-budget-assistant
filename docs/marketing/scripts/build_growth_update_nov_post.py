# -*- coding: utf-8 -*-
"""
"Our small wins" growth update, November 2026 — a 2-slide carousel (1080x1350)
for Threads (EN) and Instagram feed (PL), built from the user's REAL
screenshots taken 2026-11-26:

  * Search Console Performance, 3 months (2026-08-25 .. 2026-11-24):
    248 clicks, 29.8K impressions, CTR 0.8%, avg position 14.9
  * Search Console milestone badges: 70 (Nov 11) .. 150 (Nov 24) clicks / 28 days
  * Admin dashboard: 152 users, 23,437 expenses recorded

Previous milestone post (Sep 2026, build_google_search_milestone_*.py):
60 clicks / 28 days, 10K impressions, avg position 20.8.

Screenshots are shown as-is (only cropped), never retouched. Tone stays
modest: avg position 14.9 is still page two — never claim page one.
"Active today" (2) is deliberately not shown.

Outputs: docs/marketing/creatives/growth-update-2026-11/renders/{en,pl}/
    growth-update-1.png  numbers + 3-month chart
    growth-update-2.png  weekly impressions (Polish blog highlighted) + avg position
    growth-update-3.png  the 70..150 badge ladder

Usage:
    python build_growth_update_nov_post.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

import build_google_search_milestone_reel as R
from build_google_search_milestone_threads import trim_white, shot_card

SHOTS = "C:/Users/perev/OneDrive/Pictures/Screenshots"
BADGES_SHOT = os.path.join(SHOTS, "Снимок экрана 2026-11-26 103625.png")
CHART_SHOT = os.path.join(SHOTS, "Снимок экрана 2026-11-26 103638.png")
SLUG = "growth-update-2026-11"

TEXT = {
    "en": dict(
        eyebrow="OUR SMALL WINS",
        head1="Three months of growth",
        sub1="AI Budget Assistant · Aug–Nov 2026",
        tiles=[("152", "users"), ("23,437", "expenses logged"), ("29.8K", "Google impressions")],
        compare=("Clicks from Google in 28 days", "60", "Sept", "150", "Nov"),
        head3="11× more seen in Google",
        sub3="Search impressions per week, Sept 28 → Nov 16",
        legend=("Polish blog", "rest of the site"),
        weeks=["Sep 28", "Oct 5", "Oct 12", "Oct 19", "Oct 26", "Nov 2", "Nov 9", "Nov 16"],
        position=("Average position in Google", "22.2", "end of Sept", "9.6", "last week"),
        head2="6 Google badges in 2 weeks",
        sub2="70 → 150 clicks from Search in 28 days",
        thanks="Modest numbers, but they're ours. Thank you!",
    ),
    "pl": dict(
        eyebrow="NASZE MAŁE SUKCESY",
        head1="Trzy miesiące wzrostu",
        sub1="AI Budget Assistant · sierpień–listopad 2026",
        tiles=[("152", "użytkowników"), ("23 437", "zapisanych wydatków"), ("29,8 tys.", "wyświetleń w Google")],
        compare=("Kliknięcia z Google w 28 dni", "60", "wrzesień", "150", "listopad"),
        head3="11× więcej wyświetleń w Google",
        sub3="Wyświetlenia w wyszukiwarce tygodniowo, 28.09 → 16.11",
        legend=("blog po polsku", "reszta strony"),
        weeks=["28.09", "5.10", "12.10", "19.10", "26.10", "2.11", "9.11", "16.11"],
        position=("Średnia pozycja w Google", "22,2", "koniec września", "9,6", "ostatni tydzień"),
        head2="6 odznak od Google w 2 tygodnie",
        sub2="Od 70 do 150 kliknięć z wyszukiwarki w 28 dni",
        thanks="Skromnie, ale rośniemy. Dziękujemy!",
    ),
}


def base():
    R.W, R.H = 1080, 1350
    W, H = R.W, R.H
    c = R.vgradient((44, 28, 15), (11, 11, 14))
    c = R.add_glow(c, (540, 520), (620, 520), R.ORANGE, 120, 200)
    c = R.add_glow(c, (150, H - 260), (360, 320), (255, 80, 50), 40, 220)
    d = ImageDraw.Draw(c)
    isz, ring = 76, 4
    d.ellipse([W - isz - 44 - ring, 40 - ring, W - 44 + ring, 40 + isz + ring], outline=R.ORANGE, width=ring)
    c.alpha_composite(R.circle_img(Image.open(R.ICON), isz), (W - isz - 44, 40))
    return c


def header(c, t, head, sub):
    W = R.W
    d = ImageDraw.Draw(c)
    R.spaced(d, 62, t["eyebrow"], ImageFont.truetype(R.SEMI_FONT, 26), R.ORANGE, 8)
    d.rounded_rectangle([(W - 96) / 2, 100, (W + 96) / 2, 106], radius=3, fill=R.ORANGE)
    R.centered(d, 122, head, ImageFont.truetype(R.HEAD_FONT, 64), R.WHITE)
    R.centered(d, 206, sub, ImageFont.truetype(R.SUB_FONT, 30), R.GREY)


def footer(c, t, y_thanks):
    d = ImageDraw.Draw(c)
    R.centered(d, y_thanks, t["thanks"], ImageFont.truetype(R.SEMI_FONT, 36), R.ORANGE)
    R.centered(d, R.H - 70, "MICODE  ·  ai-budget.pl", ImageFont.truetype(R.SEMI_FONT, 26), R.GREY)


def fit_font(path, text, size, max_w):
    while size > 12:
        f = ImageFont.truetype(path, size)
        if f.getlength(text) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(path, size)


def tiles(c, items, y):
    d = ImageDraw.Draw(c)
    gap, x0 = 24, 54
    tw_ = (R.W - 2 * x0 - 2 * gap) // 3
    th = 170
    for i, (num, label) in enumerate(items):
        x = x0 + i * (tw_ + gap)
        d.rounded_rectangle([x, y, x + tw_, y + th], radius=26, fill=R.CARD, outline=R.CARD_LINE, width=2)
        d.rounded_rectangle([x + 28, y + 26, x + 76, y + 32], radius=3, fill=R.ORANGE)
        nf = fit_font(R.HEAD_FONT, num, 64, tw_ - 56)
        d.text((x + 28, y + 44), num, font=nf, fill=R.WHITE)
        lf = fit_font(R.SUB_FONT, label, 28, tw_ - 56)
        d.text((x + 28, y + 122), label, font=lf, fill=R.GREY)
    return y + th


def slide1(t):
    c = base()
    header(c, t, t["head1"], t["sub1"])
    y = tiles(c, t["tiles"], 272)
    chart = Image.open(CHART_SHOT).convert("RGB")
    chart = chart.crop((6, 44, chart.width - 10, 470))   # metric cards + chart, no toolbar / info bar
    c, y = shot_card(c, chart, R.W / 2, y + 36, target_w=956, pad=14)
    y = compare_card(c, t["compare"], y + 36)
    footer(c, t, y + 40)
    return c


def compare_card(c, spec, y):
    label, v0, m0, v1, m1 = spec
    d = ImageDraw.Draw(c)
    x0, x1, h = 54, R.W - 54, 230
    d.rounded_rectangle([x0, y, x1, y + h], radius=26, fill=R.CARD, outline=R.CARD_LINE, width=2)
    R.centered(d, y + 24, label, ImageFont.truetype(R.SEMI_FONT, 30), R.GREY)
    nf = ImageFont.truetype(R.HEAD_FONT, 96)
    mf = ImageFont.truetype(R.SUB_FONT, 28)
    for cx, num, mon, col in ((R.W * 0.30, v0, m0, R.GREY), (R.W * 0.70, v1, m1, R.ORANGE)):
        R.centered(d, y + 62, num, nf, col, cx=cx)
        R.centered(d, y + 178, mon, mf, R.DIM if col == R.GREY else R.WHITE, cx=cx)
    R.centered(d, y + 84, "→", ImageFont.truetype(R.HEAD_FONT, 72), R.ORANGE)
    return y + h


def slide2(t):
    c = base()
    header(c, t, t["head2"], t["sub2"])
    badges = Image.open(BADGES_SHOT).convert("RGB")
    badges = badges.crop((0, 0, 750, 790))   # drop the grey page edge on the right
    c, y = shot_card(c, badges, R.W / 2, 276, target_h=820, pad=12)
    footer(c, t, y + 44)
    return c


# Search Console API snapshot (gsc-snapshot.yml, issue #720), weeks Mon-Sun.
SITE_WK = [663, 760, 908, 1323, 1649, 3155, 5250, 7295]
PL_WK = [53, 147, 206, 315, 335, 1125, 2657, 3907]


def fmt(n, lang):
    s = f"{n:,}"
    return s.replace(",", " ") if lang == "pl" else s


def slide_weekly(t, lang):
    c = base()
    header(c, t, t["head3"], t["sub3"])
    d = ImageDraw.Draw(c)
    x0, x1, y0, y1 = 54, R.W - 54, 276, 276 + 600
    d.rounded_rectangle([x0, y0, x1, y1], radius=26, fill=R.CARD, outline=R.CARD_LINE, width=2)
    # legend
    lf = ImageFont.truetype(R.SUB_FONT, 26)
    lx = x0 + 36
    for col, txt in ((R.ORANGE, t["legend"][0]), ((92, 94, 104), t["legend"][1])):
        d.rounded_rectangle([lx, y0 + 34, lx + 26, y0 + 60], radius=6, fill=col)
        d.text((lx + 38, y0 + 28), txt, font=lf, fill=R.GREY)
        lx += 38 + lf.getlength(txt) + 44
    base_y, top_y = y1 - 70, y0 + 140
    n = len(SITE_WK)
    slot = (x1 - x0 - 60) / n
    bw = slot * 0.62
    mx = max(SITE_WK)
    vf = ImageFont.truetype(R.SEMI_FONT, 24)
    xf = ImageFont.truetype(R.SUB_FONT, 22)
    for i, (tot, pl) in enumerate(zip(SITE_WK, PL_WK)):
        cx = x0 + 30 + slot * (i + 0.5)
        ht = (base_y - top_y) * tot / mx
        hp = (base_y - top_y) * pl / mx
        bx0, bx1 = cx - bw / 2, cx + bw / 2
        d.rounded_rectangle([bx0, base_y - ht, bx1, base_y], radius=8, fill=(92, 94, 104))
        if hp >= 4:
            d.rounded_rectangle([bx0, base_y - hp, bx1, base_y], radius=8, fill=R.ORANGE)
        R.centered(d, base_y - ht - 34, fmt(tot, lang), vf, R.WHITE if i == n - 1 else R.GREY, cx=cx)
        R.centered(d, base_y + 16, t["weeks"][i], xf, R.DIM, cx=cx)
    d.line([x0 + 30, base_y, x1 - 30, base_y], fill=R.CARD_LINE, width=2)
    y = compare_card(c, t["position"], y1 + 30)
    footer(c, t, y + 40)
    return c


def build():
    for lang, t in TEXT.items():
        out = os.path.join(R.MK, "creatives", SLUG, "renders", lang)
        os.makedirs(out, exist_ok=True)
        slides = (lambda: slide1(t), lambda: slide_weekly(t, lang), lambda: slide2(t))
        for n, fn in enumerate(slides, 1):
            p = os.path.join(out, f"growth-update-{n}.png")
            fn().convert("RGB").save(p, "PNG")
            print("  built", os.path.relpath(p, R.MK))


if __name__ == "__main__":
    build()
