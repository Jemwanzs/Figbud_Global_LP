"""Prepare FigBud brand assets from the logo files supplied by FigBud.

Usage (Pillow and fontTools required; run once when new source files arrive):

    python scripts/brand/prepare_brand_assets.py <figbud.png> <zirahr.png> <jasiri.png> <Outfit[wght].ttf>

Writes:
- packages/brand/assets/official/   the supplied files, byte for byte
- services/api/seed/brand/          what the API seeds into the brand library:
- apps/*/public/                    built-in favicon and app icon fallbacks
    *-official*  exact pixels of the supplied artwork; transparent margins
                 trimmed or an intact part cropped (no redrawing, no recolouring)
    *-proposed*  recoloured theme variants and the Expense Now concept;
                 seeded as drafts only, never published without the owner's approval

See docs/BRAND_ASSETS.md.
"""

import shutil
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
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


def outline(font: TTFont, text: str, x: float, baseline: float, size: float, tracking=0.0) -> tuple[str, float]:
    """SVG path data for `text` set in `font`, and the advance it used (no <text>, so no font needed)."""
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs)
    cursor = x
    for char in text:
        name = cmap[ord(char)]
        glyph = glyphs[name]
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        cursor += glyph.width * scale + tracking
    return pen.getCommands(), cursor - x - tracking


# Expense Now concept symbol on a 64 x 64 grid: a rounded tile whose "E" ends in a
# forward arrow: spending that moves. Original artwork for FigBud; not yet approved.
def symbol(prefix: str, x=0.0, y=0.0, s=1.0) -> str:
    t = f'transform="translate({x} {y}) scale({s})"'
    return f"""<g {t}>
    <defs><linearGradient id="{prefix}g" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FDBA74"/><stop offset="0.45" stop-color="#F97316"/><stop offset="1" stop-color="#C2410C"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="url(#{prefix}g)"/>
    <path fill="#FFF7ED" d="M19 14h24a4 4 0 0 1 0 8H27v6.5h9.5V25l12 7-12 7v-3.5H27V42h16a4 4 0 0 1 0 8H19a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z"/>
  </g>"""


def svg(width: float, height: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" '
        f'width="{width:.0f}" height="{height:.0f}" role="img" aria-label="{title}">\n  {body}\n</svg>\n'
    )


def concept(font: TTFont, prefix: str, title: str, words, mark) -> None:
    """Horizontal, stacked, symbol and favicon SVGs for a proposed logo concept.

    `words` are (text, colour on dark, colour on light); `mark(id, x, y, scale)`
    draws the 64 x 64 symbol.
    """
    for theme in ("on-dark", "on-light"):
        colour = (lambda w: w[1]) if theme == "on-dark" else (lambda w: w[2])
        # Horizontal: symbol + wordmark.
        paths, cursor = [], 84
        for i, word in enumerate(words):
            d, w = outline(font, word[0], cursor, 46, 34, tracking=-0.4)
            paths.append(f'\n  <path fill="{colour(word)}" d="{d}"/>')
            cursor += w + (9 if i < len(words) - 1 else 2)
        (SEED / f"{prefix}-horizontal-{theme}-proposed.svg").write_text(
            svg(cursor, 64, mark("h", 0, 0, 1) + "".join(paths), title), encoding="utf-8"
        )
        # Stacked: symbol above the centred wordmark.
        widths = [outline(font, word[0], 0, 0, 30, tracking=-0.3)[1] for word in words]
        total = sum(widths) + 8 * (len(words) - 1)
        width = max(total, 96) + 8
        left = (width - total) / 2
        paths = []
        for word, w in zip(words, widths):
            d, _ = outline(font, word[0], left, 112, 30, tracking=-0.3)
            paths.append(f'\n  <path fill="{colour(word)}" d="{d}"/>')
            left += w + 8
        (SEED / f"{prefix}-stacked-{theme}-proposed.svg").write_text(
            svg(width, 122, mark("s", (width - 72) / 2, 0, 72 / 64) + "".join(paths), title), encoding="utf-8"
        )
    (SEED / f"{prefix}-symbol-proposed.svg").write_text(svg(64, 64, mark("y"), title), encoding="utf-8")
    # Favicon: the same symbol, tile filling the square so it reads at 16 px.
    (SEED / f"{prefix}-favicon-proposed.svg").write_text(svg(32, 32, mark("f", 0, 0, 0.5), title), encoding="utf-8")
    print(f"  {prefix}-*-proposed.svg")


def expense_now(font: TTFont) -> None:
    concept(
        font,
        "expense-now",
        "Expense Now",
        [("Expense", "#FFF7ED", "#1C1917"), ("Now", "#F97316", "#F97316")],
        symbol,
    )


# Ziwa LMS concept symbol (64 x 64): "ziwa" is Swahili for lake. A "Z" drawn as
# two flowing water lines joined by a current, teal to emerald on deep navy.
# Original artwork for FigBud; not yet approved.
def ziwa_symbol(prefix: str, x=0.0, y=0.0, s=1.0) -> str:
    t = f'transform="translate({x} {y}) scale({s})"'
    return f"""<g {t}>
    <defs><linearGradient id="{prefix}z" x1="12" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5EEAD4"/><stop offset="0.5" stop-color="#2DD4BF"/><stop offset="1" stop-color="#10B981"/>
    </linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="#0B1F3A"/>
    <path d="M15 21.5C22 16.5 28 26.5 35 21.5S45 17.5 49 20.5L16 43.5C20 46.5 27 47.5 32 43S42 37.5 49 42.5" fill="none" stroke="url(#{prefix}z)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>"""


def ziwa(font: TTFont) -> None:
    concept(
        font,
        "ziwa",
        "Ziwa LMS",
        [("Ziwa", "#F0FDFA", "#0B1F3A"), ("LMS", "#2DD4BF", "#0F766E")],
        ziwa_symbol,
    )


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
    figbud, zirahr, jasiri, font = sys.argv[1:5]
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
    font = TTFont(font)
    instantiateVariableFont(font, {"wght": 600}, inplace=True)
    expense_now(font)
    ziwa(font)


if __name__ == "__main__":
    main()
