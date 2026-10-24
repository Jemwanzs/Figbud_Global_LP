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
