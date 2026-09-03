"""Generate the PWA icon set for the web build from the app icon.

Everything in `apps/mobile/public/` is copied verbatim into `dist/` by
`expo export --platform web`, which is how these reach the deployed SPA.

Re-run whenever `assets/icon.png` changes:
    python apps/mobile/scripts/generate-web-icons.py

Three sizes, for three different consumers:

  * `icon-192.png` / `icon-512.png` — the manifest's own `any` icons.
  * `icon-maskable-512.png` — Android's adaptive-icon crop. A maskable icon is
    cut to whatever shape the launcher wants (often a circle), so the artwork is
    scaled into the inner 80% "safe zone" and the rest is filled with the icon's
    own background. Handing the full-bleed icon to a maskable slot would clip
    the wallet off the top.
  * `apple-touch-icon.png` — iOS ignores the manifest's icons entirely and reads
    this one from a `<link>` tag, so without it an "Add to Home Screen" on an
    iPhone gets a screenshot of the page instead of the app icon. iOS also does
    not composite over anything, hence the flattened opaque background.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "icon.png"
OUT = ROOT / "public"

# Matches the native splash (`expo-splash-screen.backgroundColor` in app.json),
# so the icon's padding is invisible against it.
BACKGROUND = (0, 0, 0)

# Android's maskable safe zone: the inner 80% of the canvas is the only part
# guaranteed to survive the launcher's crop.
SAFE_ZONE = 0.8


def flatten(img: Image.Image) -> Image.Image:
    """Drop alpha onto the background — iOS renders touch icons without one."""
    flat = Image.new("RGB", img.size, BACKGROUND)
    flat.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
    return flat


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGBA")

    for size in (192, 512):
        src.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png")
        print("wrote", f"icon-{size}.png")

    size = 512
    inner = int(size * SAFE_ZONE)
    maskable = Image.new("RGB", (size, size), BACKGROUND)
    maskable.paste(flatten(src.resize((inner, inner), Image.LANCZOS)),
                   ((size - inner) // 2, (size - inner) // 2))
    maskable.save(OUT / "icon-maskable-512.png")
    print("wrote icon-maskable-512.png")

    flatten(src.resize((180, 180), Image.LANCZOS)).save(OUT / "apple-touch-icon.png")
    print("wrote apple-touch-icon.png")


if __name__ == "__main__":
    main()
