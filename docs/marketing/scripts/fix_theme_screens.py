# -*- coding: utf-8 -*-
"""
Stop-gap marketing touch-up for the theme/personalization screenshots
(docs/marketing/creatives/design/) while the real in-app fix is being built:

  1. photo_3 (Pulpit): a thin blue strip bled above the white status bar
     ("фон ушёл в трэй") -> repaint the top rows with the status-bar bg.
  2. all three: the Samsung OS nav bar sits directly under the content; on
     photo_2 the "Zastosuj" button even extends under it -> replace the whole
     nav-bar band with each screen's own bottom background so the buttons get
     clean padding and no OS bar collides with them.

Outputs *_fixed.png next to the originals (originals untouched — the user is
editing the app in parallel and will re-send corrected shots).

Run: python fix_theme_screens.py
"""
import os
from PIL import Image, ImageDraw

DESIGN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                      "creatives", "design")
STAMP = "2026-07-23_22-01-53"

# per-image bottom background (sampled from safe corners just above the nav bar)
BOTTOM_BG = {
    "photo_1": (249, 250, 252),
    "photo_2": (255, 255, 255),
    "photo_3": (255, 255, 255),
}
NAV_TOP = 1200          # OS nav-bar band starts ~here (grey 3-button strip)
TOP_BLEED_ROWS = 6      # photo_3 blue strip height above the white status bar
STATUS_BG = (249, 250, 252)


def fix(name):
    src = os.path.join(DESIGN, f"{name}_{STAMP}.jpg")
    im = Image.open(src).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im)

    # 1. top bleed — dashboard only
    if name == "photo_3":
        d.rectangle([0, 0, w, TOP_BLEED_ROWS - 1], fill=STATUS_BG)

    # 2. remove OS nav bar -> clean bottom padding in the screen's own bg
    d.rectangle([0, NAV_TOP, w, h], fill=BOTTOM_BG[name])

    out = os.path.join(DESIGN, f"{name}_fixed.png")
    im.save(out, "PNG")
    print("  built", os.path.relpath(out, DESIGN), im.size)


if __name__ == "__main__":
    for n in ("photo_1", "photo_2", "photo_3"):
        fix(n)
