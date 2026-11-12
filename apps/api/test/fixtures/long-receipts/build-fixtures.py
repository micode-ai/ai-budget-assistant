#!/usr/bin/env python
"""
Builds the SYNTHETIC long-receipt fixtures. Everything here is made up: the shops do not exist, the
items and prices come from the lists below, the date and numbers are invented. No real receipt, user
or store data was used.

  python build-fixtures.py            # writes <name>.json (expected result) and out/<name>.part<N>.png

The .json files are committed; out/ is gitignored and rebuilt on demand (scripts/long-receipt-eval.mjs
does it when the images are missing). Needs Pillow.
"""
import json
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

ITEMS = [
    ("Mleko 3,2% 1L", 3.49), ("Chleb pszenny", 4.20), ("Maslo extra 200g", 8.99), ("Jajka M 10szt", 11.50),
    ("Ser zolty plaster", 6.79), ("Jogurt naturalny", 2.19), ("Banany kg", 5.99), ("Jablka kg", 4.49),
    ("Makaron spaghetti", 3.99), ("Ryz bialy 1kg", 5.49), ("Pomidory kg", 9.99), ("Ogorki kg", 6.49),
    ("Kawa mielona 250g", 17.99), ("Herbata czarna 20szt", 7.29), ("Cukier 1kg", 4.59), ("Maka 1kg", 3.29),
    ("Olej rzepakowy 1L", 8.49), ("Sok pomaranczowy 1L", 5.79), ("Woda gazowana 1,5L", 1.99), ("Piwo jasne 0,5L", 3.89),
    ("Czekolada mleczna", 4.99), ("Chipsy solone", 6.19), ("Pasta do zebow", 7.99), ("Papier toaletowy 8szt", 13.99),
    ("Plyn do naczyn", 6.49), ("Szynka wiejska 100g", 5.59), ("Parowki 6szt", 9.29), ("Cebula kg", 3.19),
    ("Ziemniaki kg", 2.89), ("Marchew kg", 3.49), ("Maslanka 0,5L", 2.69), ("Twarog polcustowy", 4.89),
    ("Bulki 6szt", 4.99), ("Dzem truskawkowy", 6.89), ("Platki owsiane", 4.19), ("Orzechy wloskie 100g", 9.49),
]

# name, shop, items, split of line indexes per part (before overlap), overlap lines, repeat-at-boundary
SPECS = [
    ("two-parts-short", "Sklep Zielony Kosz", 18, 2, 3, False),
    ("two-parts-mid", "Market Nowa Brama", 24, 2, 3, False),
    ("two-parts-repeat-at-boundary", "Delikatesy Pod Lipa", 22, 2, 2, True),
    ("three-parts", "Hurtownia Dobry Targ", 36, 3, 3, False),
    ("three-parts-repeat-at-boundary", "Spizarnia Jedna Rodzina", 33, 3, 2, True),
    ("long-four-parts", "Supermarket Wielka Spizarnia", 44, 4, 3, False),
]


def money(v):
    return f"{v:.2f}".replace(".", ",")


def build(spec, seed):
    name, shop, n, parts, overlap, repeat = spec
    rnd = random.Random(seed)
    names = ITEMS[:]
    rnd.shuffle(names)
    lines = []
    for i in range(n):
        base, price = names[i % len(names)]
        qty = rnd.choice([1, 1, 1, 2, 3])
        lines.append({"name": base, "qty": qty, "unitPrice": price, "totalPrice": round(price * qty, 2)})
    boundary = n // parts
    if repeat:
        # the same product sits right before and right after the first cut: a REAL repeat, not overlap
        lines[boundary - 1] = {"name": "Woda gazowana 1,5L", "qty": 1, "unitPrice": 1.99, "totalPrice": 1.99}
        lines[boundary] = {"name": "Woda gazowana 1,5L", "qty": 1, "unitPrice": 1.99, "totalPrice": 1.99}
    total = round(sum(l["totalPrice"] for l in lines), 2)
    return {
        "name": name,
        "synthetic": True,
        "shop": shop,
        "date": "2026-03-14",
        "currency": "PLN",
        "partsCount": parts,
        "overlapLines": overlap,
        "repeatAcrossBoundary": repeat,
        "expected": {"lineCount": n, "total": total, "lines": lines},
    }


def render(fx):
    try:
        font = ImageFont.truetype("consola.ttf", 22)
    except OSError:
        font = ImageFont.truetype("DejaVuSansMono.ttf", 22)
    w, lh, pad = 560, 30, 24
    rows = [fx["shop"].upper(), "NIP 000-000-00-00 (fikcyjny)", f"Data: {fx['date']}   Paragon nr {sum(map(ord, fx["name"])) * 7 % 9000 + 1000}", "-" * 38]
    head = len(rows)
    for l in fx["expected"]["lines"]:
        label = f"{l['name'][:22]}"
        rows.append(f"{label:<22} {l['qty']}x{money(l['unitPrice']):>6} {money(l['totalPrice']):>7}")
    foot_start = len(rows)
    rows += ["-" * 38, f"SUMA PLN {money(fx['expected']['total']):>28}", f"DO ZAPLATY {money(fx['expected']['total']):>26}", "Dziekujemy za zakupy"]
    img = Image.new("RGB", (w, pad * 2 + lh * len(rows)), "white")
    d = ImageDraw.Draw(img)
    for i, r in enumerate(rows):
        d.text((pad, pad + i * lh), r, fill="black", font=font)
    n, k, ov = fx["expected"]["lineCount"], fx["partsCount"], fx["overlapLines"]
    cuts = [head + round(n * i / k) for i in range(k + 1)]
    cuts[0], cuts[-1] = 0, foot_start + 4
    os.makedirs(OUT, exist_ok=True)
    for p in range(k):
        top = cuts[p] if p == 0 else cuts[p] - ov
        y0 = 0 if p == 0 else pad + top * lh
        y1 = img.height if p == k - 1 else pad + cuts[p + 1] * lh
        img.crop((0, y0, w, y1)).save(os.path.join(OUT, f"{fx['name']}.part{p + 1}.png"))


def main():
    for idx, spec in enumerate(SPECS):
        fx = build(spec, 1000 + idx)
        with open(os.path.join(HERE, fx["name"] + ".json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(fx, f, ensure_ascii=False, indent=2)
            f.write("\n")
        render(fx)
    print(f"built {len(SPECS)} fixtures into {OUT}")


if __name__ == "__main__":
    sys.exit(main())
