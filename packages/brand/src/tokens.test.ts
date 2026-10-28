import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Guard rails for the shared design tokens: every product accent stays
// readable on both site themes (WCAG 2.2 AA).
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const dark = block(':root,\n[data-theme="dark"]');
const light = block('[data-theme="light"]');

describe.each(["figbud", "zirahr", "jasiri", "expense_now", "ziwa"])("%s tokens", (slug) => {
  const product = block(`[data-product="${slug}"]`);

  it("accent text is readable on the dark theme", () => {
    const text = product["product-text"] ?? dark.accent!;
    expect(contrast(text, dark.bg!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, dark.surface!)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent text is readable on the light theme", () => {
    const text =
      slug === "figbud"
        ? light.accent!
        : block(
            `[data-theme="light"] [data-product="${slug}"],\n[data-theme="light"][data-product="${slug}"]`,
          )["product-text"]!;
    expect(contrast(text, light.bg!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, light.surface!)).toBeGreaterThanOrEqual(4.5);
  });

  it("ink is readable on the accent (product buttons)", () => {
    expect(contrast(product["product-ink"]!, product.product!)).toBeGreaterThanOrEqual(4.5);
  });
});

// The FigBud Global parent palette (emerald, blue, violet on navy): body,
// muted and subtle text, the accent as text and as a button, both themes.
describe.each([
  ["dark", dark],
  ["light", light],
] as const)("parent palette, %s theme", (_name, theme) => {
  it.each(["text", "text-muted", "text-subtle"])("%s is readable on every surface", (role) => {
    for (const surface of ["bg", "bg-elevated", "surface", "surface-2"]) {
      expect(contrast(theme[role]!, theme[surface]!), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("accent and highlight colours are readable as text", () => {
    for (const role of ["accent", "accent-2", "accent-3"]) {
      expect(contrast(theme[role]!, theme.bg!), role).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme[role]!, theme.surface!), role).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("button text is readable on the accent", () => {
    expect(contrast(theme["accent-ink"]!, theme.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it("focus rings stand out from the page", () => {
    expect(contrast(theme.focus!, theme.bg!)).toBeGreaterThanOrEqual(3);
  });
});

// Tinted chips (status badges, avatars): coloured text on a 10% (or the
// token's own) tint of itself, over a surface, stays readable.
function blend(fg: string, alpha: number, bg: string): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(ch(fg, i) * alpha + ch(bg, i) * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}
const softAlpha = (selector: string) =>
  Number(/--accent-soft: rgb\(\d+ \d+ \d+ \/ ([\d.]+)\)/.exec(css.slice(css.indexOf(`${selector} {`)))![1]);

describe.each([
  ["dark", dark, ':root,\n[data-theme="dark"]'],
  ["light", light, '[data-theme="light"]'],
] as const)("tinted chips, %s theme", (_name, theme, selector) => {
  it("status colours are readable on their own tint", () => {
    for (const role of ["success", "warning", "danger"]) {
      for (const surface of ["bg", "surface"]) {
        const chip = blend(theme[role]!, 0.1, theme[surface]!);
        expect(contrast(theme[role]!, chip), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("the accent is readable on the soft accent", () => {
    const chip = blend("#16a34a", softAlpha(selector), theme.surface!);
    expect(contrast(theme.accent!, chip)).toBeGreaterThanOrEqual(4.5);
  });
});
