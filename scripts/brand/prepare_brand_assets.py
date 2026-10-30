"""Prepare FigBud brand assets from the logo files supplied by FigBud.

Usage (Pillow required; run once when new source files arrive):

    python scripts/brand/prepare_brand_assets.py <figbud.png> <zirahr.png> <jasiri.png>

Writes:
- packages/brand/assets/official/   the supplied files, byte for byte
- services/api/seed/brand/          what the API seeds into the brand library:
- apps/*/public/                    built-in favicon and app icon fallbacks
    *-official*  exact pixels of the supplied artwork; transparent margins
                 trimmed or an intact part cropped (no redrawing, no recolouring)
    *-proposed*  recoloured theme variants;
                 seeded as drafts only, never published without the owner's approval

See docs/BRAND_ASSETS.md.
"""

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OFFICIAL = ROOT / "packages/brand/assets/official"
SEED = ROOT / "services/api/seed/brand"
INK = (21, 18, 15)  # --fb-ink, the light-theme text colour


def trim(im: Image.Image) -> Image.Image:
    return im.crop(im.getchannel("A").getbbox())


def recolour_neutrals(im: Image.Image, colour, *, min_level=150, max_spread=40) -> Image.Image:
    """Recolour light, unsaturated pixels (the white or grey lettering), keeping alpha and accents."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and min(r, g, b) >= min_level and max(r, g, b) - min(r, g, b) <= max_spread:
                px[x, y] = (*colour, a)
    return out


def save_png(im: Image.Image, name: str) -> None:
    im.save(SEED / name, optimize=True)
    print(f"  {name} {im.size[0]}x{im.size[1]}")


# Ziwa LMS and Expense Now: owner-approved identities rebuilt as vectors by
# scripts/brand/ziwa/build.py and scripts/brand/expense_now/build.py.


def on_tile(symbol: Image.Image, size: int, symbol_height: int, background, radius: int) -> Image.Image:
    """The unmodified symbol, scaled and centred on a plain square (favicons and app icons)."""
    scale = symbol_height / symbol.height
    art = symbol.resize((max(1, round(symbol.width * scale)), symbol_height), Image.LANCZOS)
    if art.width > size * 0.9:  # wide symbols fit the width instead
        scale = (size * 0.9) / symbol.width
        art = symbol.resize((round(symbol.width * scale), round(symbol.height * scale)), Image.LANCZOS)
    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    if background:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
        tile.paste(Image.new("RGBA", (size, size), (*background, 255)), (0, 0), mask)
    tile.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return tile


def icons(figbud_symbol: Image.Image, zirahr_symbol: Image.Image) -> None:
    """Favicons and app icons: the official symbols on plain backgrounds, no recolouring."""
    web = ROOT / "apps/figbud-web/public"
    zira = ROOT / "apps/zirahr-web/public"
    web.mkdir(parents=True, exist_ok=True)
    zira.mkdir(parents=True, exist_ok=True)

    # FigBud's symbol is white, so it sits on FigBud ink; readable on light and dark browser chrome.
    fav = on_tile(figbud_symbol, 64, 44, INK, 14)
    app = on_tile(figbud_symbol, 180, 104, INK, 0)
    save_png(fav, "figbud-favicon-official.png")
    save_png(app, "figbud-app-icon-official.png")
    fav.save(web / "icon.png", optimize=True)
    app.save(web / "apple-icon.png", optimize=True)
    on_tile(figbud_symbol, 48, 34, INK, 10).save(web / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    # ZiraHR's cyan symbol reads on any background; the app icon gets a dark tile (iOS fills transparency with black).
    fav = on_tile(zirahr_symbol, 64, 60, None, 0)
    app = on_tile(zirahr_symbol, 180, 124, (11, 20, 22), 0)
    save_png(fav, "zirahr-favicon-official.png")
    save_png(app, "zirahr-app-icon-official.png")
    fav.save(zira / "icon.png", optimize=True)
    app.save(zira / "apple-icon.png", optimize=True)
    on_tile(zirahr_symbol, 48, 46, None, 0).save(zira / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("  favicons and app icons (also the websites' built-in fallbacks)")


def main() -> None:
    figbud, zirahr, jasiri = sys.argv[1:4]
    OFFICIAL.mkdir(parents=True, exist_ok=True)
    SEED.mkdir(parents=True, exist_ok=True)
    for src, name in ((figbud, "figbud-logo.png"), (zirahr, "zirahr-logo.png"), (jasiri, "jasiri-logo.png")):
        shutil.copyfile(src, OFFICIAL / name)
    print("official originals copied")

    fb = Image.open(figbud).convert("RGBA")
    save_png(trim(fb), "figbud-horizontal-on-dark-official.png")
    figbud_symbol = trim(fb.crop((0, 0, 60, fb.height)))
    save_png(figbud_symbol, "figbud-symbol-on-dark-official.png")
    save_png(recolour_neutrals(trim(fb), INK), "figbud-horizontal-on-light-proposed.png")
    save_png(recolour_neutrals(trim(fb.crop((0, 0, 60, fb.height))), INK), "figbud-symbol-on-light-proposed.png")

    zr = Image.open(zirahr).convert("RGBA")
    # The supplied file is cut off at the right edge ("HR" and part of the dot are missing);
    # only the symbol is intact. The full file is kept for reference.
    zirahr_symbol = trim(zr.crop((540, 250, 1080, 790)))
    save_png(zirahr_symbol, "zirahr-symbol-official.png")
    save_png(trim(zr), "zirahr-supplied-incomplete.png")

    js = Image.open(jasiri).convert("RGBA")
    save_png(trim(js), "jasiri-horizontal-on-dark-official.png")
    save_png(recolour_neutrals(trim(js), INK), "jasiri-horizontal-on-light-proposed.png")

    icons(figbud_symbol, zirahr_symbol)


if __name__ == "__main__":
    main()
