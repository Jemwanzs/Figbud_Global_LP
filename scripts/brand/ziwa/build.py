"""Build the official Ziwa LMS logo files from the approved identity.

Usage (fontTools required):

    python scripts/brand/ziwa/build.py <Outfit[wght].ttf>

The owner approved the final Ziwa LMS brand sheet on 29 Oct 2026 (orange and
yellow symbol, brown wordmark, tan LMS), replacing the blue and green version
approved the day before. The sheet is a picture, not a set of files, so the
logos are rebuilt as clean vectors from `geometry.json`: the symbol's outline
was traced from the sheet and smoothed, split at its fold into the orange
upper lobe and the yellow lower lobe, and each part's gradient fitted to the
sheet and corrected to the stated palette; the wordmark is set in Outfit
outlines fitted to the sheet's letter boxes (no <text>, so no font is needed
to display them). Layout, proportions and colours follow the sheet.

Writes services/api/seed/brand/ziwa-*-official.svg, which the API seeds and
publishes (services/api/src/brand/seed.rs). See docs/BRAND_ASSETS.md.
"""

import json
import sys
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[3]
SEED = ROOT / "services/api/seed/brand"
GEO = json.loads((Path(__file__).parent / "geometry.json").read_text(encoding="utf-8"))
SYM, LEAF, WORD, COLOURS, TILE = GEO["symbol"], GEO["leaf"], GEO["wordmark"], GEO["colours"], GEO["tile"]
WHITE = "#FFFFFF"


def gradient(id_: str, g: dict) -> str:
    stops = "".join(f'<stop offset="{t}" stop-color="{c}"/>' for t, c in g["stops"])
    return (
        f'<linearGradient id="{id_}" x1="{g["x1"]}" y1="{g["y1"]}" x2="{g["x2"]}" y2="{g["y2"]}" '
        f'gradientUnits="userSpaceOnUse">{stops}</linearGradient>'
    )


def symbol(p: str, mono: str | None = None) -> str:
    """The symbol in sheet coordinates. `p` keeps gradient ids unique within a file."""
    shape, dots = SYM["shape"], SYM["dots"]
    if mono:
        circles = "".join(f'<circle fill="{mono}" cx="{d["cx"]}" cy="{d["cy"]}" r="{d["r"]}"/>' for d in dots)
        return f'<path fill="{mono}" d="{shape}"/>{circles}'
    defs = (
        gradient(p + "u", SYM["upper"])
        + gradient(p + "l", SYM["lower"])
        + "".join(gradient(f"{p}d{i}", d["gradient"]) for i, d in enumerate(dots))
        + f'<clipPath id="{p}f"><path d="{SYM["fold"]}"/></clipPath>'
    )
    circles = "".join(
        f'<circle fill="url(#{p}d{i})" cx="{d["cx"]}" cy="{d["cy"]}" r="{d["r"]}"/>' for i, d in enumerate(dots)
    )
    # The orange upper lobe, then the yellow lower lobe below its fold, then the dots.
    return (
        f'<defs>{defs}</defs><path fill="url(#{p}u)" d="{shape}"/>'
        f'<path fill="url(#{p}l)" clip-path="url(#{p}f)" d="{shape}"/>{circles}'
    )


def glyphs(font: TTFont, letters) -> str:
    """Outlines fitted to their letter boxes (left, top, right, bottom) on the sheet."""
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    pen = SVGPathPen(gs)
    for char, (left, top, right, bottom) in letters:
        glyph = gs[cmap[ord(char)]]
        bounds = BoundsPen(gs)
        glyph.draw(bounds)
        x0, y0, x1, y1 = bounds.bounds
        sx, sy = (right - left) / (x1 - x0), (bottom - top) / (y1 - y0)
        glyph.draw(TransformPen(pen, (sx, 0, 0, -sy, left - x0 * sx, bottom + y0 * sy)))
    return pen.getCommands()


def wordmark(heavy: TTFont, medium: TTFont, p: str, word: str, lms: str, mono: str | None = None) -> str:
    leaf_fill = mono or f"url(#{p}leaf)"
    defs = "" if mono else f"<defs>{gradient(p + 'leaf', LEAF['gradient'])}</defs>"
    rules = "".join(
        f'<rect fill="{lms}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2:g}"/>' for x, y, w, h in WORD["rules"]
    )
    return (
        f'{defs}<path fill="{word}" d="{glyphs(heavy, WORD["ziwa"])}"/>'
        f'<path fill="{leaf_fill}" d="{LEAF["d"]}"/>'
        f'<path fill="{lms}" d="{glyphs(medium, WORD["lms"])}"/>{rules}'
    )


def svg(view: tuple[float, float, float, float], body: str, size: tuple[int, int] | None = None) -> str:
    x, y, w, h = view
    width, height = size or (round(w), round(h))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x:g} {y:g} {w:g} {h:g}" width="{width}" height="{height}" '
        f'role="img" aria-label="Ziwa LMS">{body}</svg>\n'
    )


def write(name: str, text: str) -> None:
    (SEED / name).write_text(text, encoding="utf-8", newline="\n")
    print(f"  {name} ({len(text) // 1024} KB)")


def main() -> None:
    def font(weight: int) -> TTFont:
        return instantiateVariableFont(TTFont(sys.argv[1]), {"wght": weight})

    heavy, medium = font(WORD["ziwa_weight"]), font(WORD["lms_weight"])
    brown, tan = COLOURS["brown"], COLOURS["tan"]
    x0, y0, x1, y1 = SYM["box"]
    pad = 6
    # The symbol's box in sheet coordinates, padded.
    sbox = (round(x0 - pad, 2), round(y0 - pad, 2), round(x1 - x0 + 2 * pad, 2), round(y1 - y0 + 2 * pad, 2))
    # Horizontal logo: symbol and wordmark as laid out on the sheet.
    right = max(b[2] for _, b in WORD["ziwa"]) + pad
    bottom = max(y1, max(b[3] for _, b in WORD["lms"])) + pad
    top = min(y0, LEAF["box"][1]) - pad
    hbox = (sbox[0], round(min(sbox[1], top), 2), round(right - sbox[0], 2), round(bottom - min(sbox[1], top), 2))

    write("ziwa-horizontal-on-light-official.svg", svg(hbox, symbol("a") + wordmark(heavy, medium, "a", brown, tan)))
    write("ziwa-horizontal-on-dark-official.svg", svg(hbox, symbol("a") + wordmark(heavy, medium, "a", WHITE, tan)))
    write("ziwa-symbol-official.svg", svg(sbox, symbol("a")))
    write(
        "ziwa-horizontal-one-colour-official.svg",
        svg(hbox, symbol("a", brown) + wordmark(heavy, medium, "a", brown, brown, mono=brown)),
    )
    write("ziwa-symbol-one-colour-official.svg", svg(sbox, symbol("a", brown)))

    # Favicons and app icons: the symbol on the sheet's rounded tiles, ivory
    # (the default) and brown, at the sheet's proportions.
    side = max(sbox[2], sbox[3])
    cx, cy = sbox[0] + sbox[2] / 2, sbox[1] + sbox[3] / 2
    tile = side / TILE["symbol_ratio"]
    tx, ty = cx - tile / 2, cy - tile / 2
    view = (round(tx, 2), round(ty, 2), round(tile, 2), round(tile, 2))
    rect = f'x="{tx:.2f}" y="{ty:.2f}" width="{tile:.2f}" height="{tile:.2f}" rx="{tile * TILE["radius_ratio"]:.2f}"'
    light = f'<rect fill="{COLOURS["ivory"]}" {rect}/>'
    dark = (
        f'<defs><linearGradient id="bt" x1="{tx:.2f}" y1="{ty:.2f}" x2="{tx + tile:.2f}" y2="{ty + tile:.2f}" '
        f'gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{brown}"/>'
        f'<stop offset="1" stop-color="{COLOURS["brown_deep"]}"/></linearGradient></defs><rect fill="url(#bt)" {rect}/>'
    )
    write("ziwa-favicon-official.svg", svg(view, light + symbol("a"), (64, 64)))
    write("ziwa-favicon-dark-official.svg", svg(view, dark + symbol("a"), (64, 64)))
    write("ziwa-app-icon-official.svg", svg(view, light + symbol("a"), (512, 512)))
    write("ziwa-app-icon-dark-official.svg", svg(view, dark + symbol("a"), (512, 512)))


if __name__ == "__main__":
    main()
