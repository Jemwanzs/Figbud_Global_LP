"""Build the official Ziwa LMS logo files from the approved identity.

Usage (fontTools required):

    python scripts/brand/ziwa/build.py <Outfit[wght].ttf>

The owner approved the Ziwa LMS brand sheet on 28 Oct 2026. The sheet is a
picture, not a set of files, so the logos are rebuilt as clean vectors from
`geometry.json`: the symbol's outlines were traced from the sheet and
smoothed, its gradients fitted to the sheet's colours, and the wordmark set
in Outfit outlines fitted to the sheet's letter boxes (no <text>, so no font
is needed to display them). Layout, proportions and colours follow the sheet.

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
SYM, LEAF, WORD, COLOURS = GEO["symbol"], GEO["leaf"], GEO["wordmark"], GEO["colours"]
WHITE = "#FFFFFF"


def gradient(id_: str, g: dict) -> str:
    stops = "".join(f'<stop offset="{t}" stop-color="{c}"/>' for t, c in g["stops"])
    return (
        f'<linearGradient id="{id_}" x1="{g["x1"]}" y1="{g["y1"]}" x2="{g["x2"]}" y2="{g["y2"]}" '
        f'gradientUnits="userSpaceOnUse">{stops}</linearGradient>'
    )


def symbol(p: str, mono: str | None = None) -> str:
    """The symbol in sheet coordinates. `p` keeps gradient ids unique within a file."""
    bx, by, br = SYM["blue_dot"]
    gx, gy, gr = SYM["green_dot"]
    blue, green = SYM["blue_drop"], SYM["green_drop"]
    ox, oy = SYM["origin"]
    if mono:
        shapes = (
            f'<path fill="{mono}" d="{blue}"/><circle fill="{mono}" cx="{bx}" cy="{by}" r="{br}"/>'
            f'<path fill="{mono}" d="{green}"/><circle fill="{mono}" cx="{gx}" cy="{gy}" r="{gr}"/>'
        )
        return f'<g transform="translate({ox} {oy})">{shapes}</g>'
    g, s = SYM["gradients"], SYM["sheen"]
    defs = (
        gradient(p + "m", g["main"]) + gradient(p + "t", g["tail"]) + gradient(p + "u", g["gupper"])
        + gradient(p + "l", g["glower"]) + gradient(p + "b", g["bdot"]) + gradient(p + "g", g["gdot"])
        + f'<radialGradient id="{p}h" cx="{s["cx"]}" cy="{s["cy"]}" r="{s["r"]}" gradientUnits="userSpaceOnUse">'
        f'<stop offset="0" stop-color="{s["color"]}" stop-opacity="{s["opacity"]}"/>'
        f'<stop offset="1" stop-color="{s["color"]}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="{p}tc"><path d="{SYM["folds"]["blue"]}"/></clipPath>'
        f'<clipPath id="{p}lc"><path d="{SYM["folds"]["green"]}"/></clipPath>'
        f'<clipPath id="{p}tp"><path d="{blue}"/></clipPath>'
    )
    shapes = (
        # Blue drop: the body, a sheen at the neck, then the tail below its fold.
        f'<path fill="url(#{p}m)" d="{blue}"/>'
        f'<circle fill="url(#{p}h)" clip-path="url(#{p}tp)" cx="{s["cx"]}" cy="{s["cy"]}" r="{s["r"]}"/>'
        f'<path fill="url(#{p}t)" clip-path="url(#{p}tc)" d="{blue}"/>'
        f'<circle fill="url(#{p}b)" cx="{bx}" cy="{by}" r="{br}"/>'
        # Green drop: the upper lobe, then the lower lobe below its fold.
        f'<path fill="url(#{p}u)" d="{green}"/>'
        f'<path fill="url(#{p}l)" clip-path="url(#{p}lc)" d="{green}"/>'
        f'<circle fill="url(#{p}g)" cx="{gx}" cy="{gy}" r="{gr}"/>'
    )
    return f'<defs>{defs}</defs><g transform="translate({ox} {oy})">{shapes}</g>'


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
    g = LEAF["gradient"]
    leaf_fill = mono or f"url(#{p}leaf)"
    defs = (
        ""
        if mono
        else f'<defs><linearGradient id="{p}leaf" x1="{g["x1"]}" y1="{g["y1"]}" x2="{g["x2"]}" y2="{g["y2"]}" '
        f'gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{g["c1"]}"/>'
        f'<stop offset=".5" stop-color="{g["cm"]}"/><stop offset="1" stop-color="{g["c2"]}"/></linearGradient></defs>'
    )
    rules = "".join(
        f'<rect fill="{lms}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2}"/>' for x, y, w, h in WORD["rules"]
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
    brown, gold = COLOURS["brown"], COLOURS["gold"]
    ox, oy = SYM["origin"]
    x0, y0, x1, y1 = SYM["box"]
    pad = 6
    # The symbol's box in sheet coordinates, padded.
    sbox = (ox + x0 - pad, oy + y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)
    # Horizontal logo: symbol and wordmark as laid out on the sheet.
    hbox = (sbox[0], sbox[1], 940 - sbox[0], sbox[3])

    write("ziwa-horizontal-on-light-official.svg", svg(hbox, symbol("a") + wordmark(heavy, medium, "a", brown, gold)))
    write("ziwa-horizontal-on-dark-official.svg", svg(hbox, symbol("a") + wordmark(heavy, medium, "a", WHITE, gold)))
    write("ziwa-symbol-official.svg", svg(sbox, symbol("a")))
    write(
        "ziwa-horizontal-one-colour-official.svg",
        svg(hbox, symbol("a", brown) + wordmark(heavy, medium, "a", brown, gold, mono=brown)),
    )
    write("ziwa-symbol-one-colour-official.svg", svg(sbox, symbol("a", brown)))

    # Favicon: the symbol centred in a square so it fills browser tabs.
    side = max(sbox[2], sbox[3])
    fav = (sbox[0] - (side - sbox[2]) / 2, sbox[1] - (side - sbox[3]) / 2, side, side)
    write("ziwa-favicon-official.svg", svg(fav, symbol("a"), (64, 64)))

    # App icon: the symbol on the sheet's white rounded tile.
    tile = side / 0.72
    tx, ty = fav[0] - (tile - side) / 2, fav[1] - (tile - side) / 2
    body = f'<rect fill="#FFFFFF" x="{tx:.2f}" y="{ty:.2f}" width="{tile:.2f}" height="{tile:.2f}" rx="{tile * 0.225:.2f}"/>'
    write("ziwa-app-icon-official.svg", svg((tx, ty, tile, tile), body + symbol("a"), (512, 512)))


if __name__ == "__main__":
    main()
