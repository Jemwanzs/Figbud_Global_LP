"""Build the official Expense Now logo files from the approved identity.

Usage (fontTools required):

    python scripts/brand/expense_now/build.py <Montserrat[wght].ttf>

The owner approved the Expense Now brand sheet on 30 Oct 2026: a radial
burst of tapered rays in orange, yellow, blue, green and browns, with the
wordmark "Expense" in brand brown over "Now" in primary orange. It replaces
the earlier concept. The sheet is a picture, not a set of files, so the logos
are rebuilt as clean vectors from `geometry.json`: each ray's inner point,
outer end, end width and colour were measured on the sheet's main logo, the
primary colours snapped to the approved palette (#FF7A00, #FFC107, #4E2D17,
#10B981, #0B6EDB) and the secondary browns and greens cleaned; each ray is
drawn as a taper from a fine inner point to a rounded outer end. The
sheet's wordmark is Montserrat ExtraBold (open font licence); it is set in
Montserrat outlines fitted to the sheet's cap height, baseline and width (no
<text>, so no font is needed to display it).

Small icons get an optically sized symbol (thicker rays), so the burst stays
legible at 16-48 px; app icons use the sheet's white and brown tiles.

Writes services/api/seed/brand/expense-now-*-official.svg, which the API
seeds and publishes (services/api/src/brand/seed.rs). See docs/BRAND_ASSETS.md.
"""

import json
import math
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
COLOURS, WORD, TILE = GEO["colours"], GEO["wordmark"], GEO["tile"]
WHITE = "#FFFFFF"
MIN_TRACKING = -0.045  # em


def f(v: float) -> str:
    return f"{v:.2f}".rstrip("0").rstrip(".")


def ray(inner, outer, width: float, inner_width: float) -> str:
    """A taper from a fine inner point to a rounded outer end."""
    (x0, y0), (x1, y1) = inner, outer
    length = math.dist(inner, outer)
    ux, uy = (x1 - x0) / length, (y1 - y0) / length
    nx, ny = -uy, ux
    ro, ri = width / 2, inner_width / 2
    # The outer cap's centre sits one radius inside the measured tip.
    cx, cy = x1 - ux * ro, y1 - uy * ro
    a = (x0 + nx * ri, y0 + ny * ri)
    b = (cx + nx * ro, cy + ny * ro)
    c = (cx - nx * ro, cy - ny * ro)
    d = (x0 - nx * ri, y0 - ny * ri)
    return (
        f"M{f(a[0])} {f(a[1])}L{f(b[0])} {f(b[1])}A{f(ro)} {f(ro)} 0 0 1 {f(c[0])} {f(c[1])}"
        f"L{f(d[0])} {f(d[1])}A{f(ri)} {f(ri)} 0 0 1 {f(a[0])} {f(a[1])}Z"
    )


def symbol(mono: str | None = None, dark: bool = False, boost: float = 1.0) -> str:
    """The burst in sheet coordinates. `boost` thickens rays for small icons."""
    parts = []
    for r in GEO["rays"]:
        colour = mono or (GEO["on_dark"].get(r["colour"], r["colour"]) if dark else r["colour"])
        width = r["width"] * boost
        parts.append(f'<path fill="{colour}" d="{ray(r["inner"], r["outer"], width, GEO["inner_width"] * boost)}"/>')
    dot = GEO["dot"]
    parts.append(f'<circle fill="{mono or dot["colour"]}" cx="{dot["cx"]}" cy="{dot["cy"]}" r="{f(dot["r"] * boost)}"/>')
    return "".join(parts)


def symbol_box(boost: float = 1.0) -> tuple[float, float, float, float]:
    xs, ys = [], []
    for r in GEO["rays"]:
        pad = r["width"] * boost / 2
        for x, y in (r["inner"], r["outer"]):
            xs += [x - pad, x + pad]
            ys += [y - pad, y + pad]
    return min(xs), min(ys), max(xs), max(ys)


def word(font: TTFont, spec: dict) -> tuple[str, float]:
    """One line of the wordmark fitted to the sheet's cap height, baseline and edges; returns the
    outlines and the right edge. The sheet's letters touch; spacing is tightened at most to
    MIN_TRACKING so they never overlap (the line then runs slightly wider than on the sheet)."""
    gs, cmap = font.getGlyphSet(), font.getBestCmap()
    cap = font["OS/2"].sCapHeight
    scale = (spec["baseline"] - spec["cap_top"]) / cap
    names = [cmap[ord(ch)] for ch in spec["text"]]
    # Ink extents of the first and last glyphs, to align the edges exactly.
    def bounds(name):
        pen = BoundsPen(gs)
        gs[name].draw(pen)
        return pen.bounds

    first_left = bounds(names[0])[0]
    last_right = bounds(names[-1])[2]
    natural = sum(gs[n].width for n in names[:-1]) - first_left + last_right
    em = font["head"].unitsPerEm
    fitted = ((spec["right"] - spec["left"]) / scale - natural) / max(1, len(names) - 1)
    tracking = max(fitted, MIN_TRACKING * em)
    print(f"  {spec['text']}: letter spacing {tracking / em:+.3f} em (sheet fit {fitted / em:+.3f})")
    pen = SVGPathPen(gs)
    x = -first_left
    for name in names:
        transform = (scale, 0, 0, -scale, spec["left"] + x * scale, spec["baseline"])
        gs[name].draw(TransformPen(pen, transform))
        x += gs[name].width + tracking
    right = spec["left"] + (x - gs[names[-1]].width - tracking + last_right) * scale
    return pen.getCommands(), right


def svg(view, body: str, size: tuple[int, int] | None = None) -> str:
    x, y, w, h = view
    width, height = size or (round(w), round(h))
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(x)} {f(y)} {f(w)} {f(h)}" width="{width}" '
        f'height="{height}" role="img" aria-label="Expense Now">{body}</svg>\n'
    )


def write(name: str, text: str) -> None:
    (SEED / name).write_text(text, encoding="utf-8", newline="\n")
    print(f"  {name} ({len(text) // 1024} KB)")


def main() -> None:
    font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": WORD["weight"]})
    (expense, expense_right), (now, now_right) = word(font, WORD["expense"]), word(font, WORD["now"])
    brown, orange = COLOURS["brown"], COLOURS["orange"]
    pad = 8
    x0, y0, x1, y1 = symbol_box()
    sbox = (x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)
    # Horizontal logo: the symbol and the two-line wordmark as laid out on the sheet.
    right = max(expense_right, now_right) + pad
    hbox = (sbox[0], sbox[1], right - sbox[0], sbox[3])

    def logo(word_colour: str, now_colour: str, mono: str | None = None, dark: bool = False) -> str:
        return (
            symbol(mono, dark) + f'<path fill="{word_colour}" d="{expense}"/>' + f'<path fill="{now_colour}" d="{now}"/>'
        )

    write("expense-now-horizontal-on-light-official.svg", svg(hbox, logo(brown, orange)))
    write("expense-now-horizontal-on-dark-official.svg", svg(hbox, logo(WHITE, orange, dark=True)))
    write("expense-now-symbol-official.svg", svg(sbox, symbol()))
    write("expense-now-symbol-on-dark-official.svg", svg(sbox, symbol(dark=True)))
    mono_light, mono_dark = COLOURS["mono_light"], COLOURS["mono_dark"]
    write(
        "expense-now-horizontal-monochrome-official.svg",
        svg(hbox, logo(mono_light, mono_light, mono=mono_light)),
    )
    write(
        "expense-now-horizontal-monochrome-on-dark-official.svg",
        svg(hbox, logo(mono_dark, mono_dark, mono=mono_dark)),
    )

    # Favicons and app icons: the symbol on the sheet's rounded tiles, white
    # (the default) and brown. Favicons use thicker rays for small sizes.
    def tile(boost: float, dark: bool, size: int) -> str:
        bx0, by0, bx1, by1 = symbol_box(boost)
        side = max(bx1 - bx0, by1 - by0)
        cx, cy = (bx0 + bx1) / 2, (by0 + by1) / 2
        t = side / TILE["symbol_ratio"]
        tx, ty = cx - t / 2, cy - t / 2
        rect = f'x="{f(tx)}" y="{f(ty)}" width="{f(t)}" height="{f(t)}" rx="{f(t * TILE["radius_ratio"])}"'
        if dark:
            back = (
                f'<defs><linearGradient id="bt" x1="{f(tx)}" y1="{f(ty)}" x2="{f(tx + t)}" y2="{f(ty + t)}" '
                f'gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="{brown}"/>'
                f'<stop offset="1" stop-color="{COLOURS["brown_deep"]}"/></linearGradient></defs>'
                f'<rect fill="url(#bt)" {rect}/>'
            )
        else:
            back = f'<rect fill="{WHITE}" {rect}/>'
        return svg((tx, ty, t, t), back + symbol(dark=dark, boost=boost), (size, size))

    write("expense-now-favicon-official.svg", tile(1.6, False, 64))
    write("expense-now-favicon-dark-official.svg", tile(1.6, True, 64))
    write("expense-now-app-icon-official.svg", tile(1.0, False, 512))
    write("expense-now-app-icon-dark-official.svg", tile(1.0, True, 512))


if __name__ == "__main__":
    main()
