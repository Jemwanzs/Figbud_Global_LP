import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

// Guard rails for the shared design tokens: every product accent stays
// readable on both site themes (WCAG 2.2 AA).
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** The declarations of the first rule whose selectors begin with `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf("{", start), css.indexOf("}", start));
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

const DARK = ':root,\n[data-theme="dark"],';
const LIGHT = '\n[data-theme="light"],\n[data-theme="dark"] [data-tone="inverse"]';
const dark = block(DARK);
const light = block(LIGHT);

describe("contrasting surfaces (UI-TH3)", () => {
  const selectors = (start: string) => css.slice(css.indexOf(start), css.indexOf("{", css.indexOf(start)));
  it("take the other theme's colours, and the page's own again inside two", () => {
    expect(selectors(DARK)).toContain('[data-theme="light"] [data-tone="inverse"]');
    expect(selectors(DARK)).toContain('[data-theme="dark"] [data-tone="inverse"] [data-tone="inverse"]');
    expect(selectors(LIGHT)).toContain('[data-theme="light"] [data-tone="inverse"] [data-tone="inverse"]');
  });
});

describe.each(["figbud", "zirahr", "jasiri", "expense_now", "ziwa"])("%s tokens", (slug) => {
  const product = block(`[data-product="${slug}"] {`);

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
  Number(/--accent-soft: rgb\(\d+ \d+ \d+ \/ ([\d.]+)\)/.exec(css.slice(css.indexOf(selector)))![1]);

describe.each([
  ["dark", dark, DARK],
  ["light", light, LIGHT],
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

// ZiraHR's own warm surfaces (owner, 6 Nov 2026): the same checks as the parent
// palette, plus the status colours and ZiraHR's accent as text on them.
const warmDark = block('[data-theme="dark"] [data-site="zirahr"],');
const warmLight = block('[data-theme="light"] [data-site="zirahr"],');
const zirahr = block('[data-product="zirahr"] {');

describe.each([
  ["dark", warmDark, dark],
  ["light", warmLight, light],
] as const)("ZiraHR warm palette, %s theme", (_name, theme, parent) => {
  const surfaces = ["bg", "bg-elevated", "surface", "surface-2"];

  it.each(["text", "text-muted", "text-subtle", "accent", "product-text"])(
    "%s is readable on every surface",
    (role) => {
      for (const surface of surfaces) {
        expect(contrast(theme[role]!, theme[surface]!), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("status colours (the parent's, unless the website sets its own) are readable on the warm surfaces", () => {
    for (const role of ["success", "warning", "danger"]) {
      for (const surface of surfaces) {
        const colour = theme[role] ?? parent[role]!;
        expect(contrast(colour, theme[surface]!), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("button text is readable on the accent and on ZiraHR's orange", () => {
    expect(contrast(theme["accent-ink"]!, theme.accent!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(zirahr["product-ink"]!, zirahr.product!)).toBeGreaterThanOrEqual(4.5);
  });

  it("focus rings stand out from the page", () => {
    expect(contrast(theme.focus!, theme.bg!)).toBeGreaterThanOrEqual(3);
  });
});

// FigBud Studio's warm palette (owner, 8 Nov 2026): text and accents readable
// on every surface, buttons readable in both themes, section colours visible.
const studioDark = block('[data-studio][data-theme="dark"] {');
const studioLight = block('[data-studio][data-theme="light"] {');
const AREAS = ["overview", "websites", "products", "content", "leads", "pricing", "publishing", "settings"];

describe.each([
  ["dark", studioDark, dark],
  ["light", studioLight, light],
] as const)("Studio palette, %s theme", (_name, theme, parent) => {
  const surfaces = ["bg", "bg-elevated", "surface", "surface-2"];

  it.each(["text", "text-muted", "text-subtle", "accent", "accent-2", "accent-3"])(
    "%s is readable on every surface",
    (role) => {
      for (const surface of surfaces) {
        expect(contrast(theme[role]!, theme[surface]!), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("status colours, kept from the parent palette, are readable on the warm surfaces", () => {
    for (const role of ["success", "warning", "danger"]) {
      for (const surface of surfaces) {
        expect(contrast(parent[role]!, theme[surface]!), `${role} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("button text is readable on the primary action and on the accent", () => {
    const action = theme.action ?? theme.accent!;
    const ink = theme["action-ink"] ?? theme["accent-ink"]!;
    expect(contrast(ink, action)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, theme["action-strong"] ?? theme["accent-strong"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["accent-ink"]!, theme.accent!)).toBeGreaterThanOrEqual(4.5);
  });

  it("section colours stand out from the sidebar and its highlighted row", () => {
    for (const area of AREAS) {
      for (const surface of ["bg-elevated", "surface-2"]) {
        expect(
          contrast(theme[`area-${area}`]!, theme[surface]!),
          `${area} on ${surface}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("focus rings stand out from the page", () => {
    expect(contrast(theme.focus!, theme.bg!)).toBeGreaterThanOrEqual(3);
  });
});

// ZiraHR's Signature Orange buttons and gradients (owner's briefs, 11 Nov 2026):
// Deep Charcoal on orange, and body and secondary text readable on every
// colour stop of every gradient, in both themes.
function gradientStops(selector: string): Record<string, string[]> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start), css.indexOf("\n}", start));
  return Object.fromEntries(
    [...body.matchAll(/--(grad-(?:hero|band|demo|cta)):\s*([^;]+);/g)].map((m) => [
      m[1],
      [...m[2]!.matchAll(/#[0-9a-f]{6}/gi)].map((c) => c[0]),
    ]),
  );
}

describe.each([
  ["dark", warmDark, '[data-theme="dark"] [data-site="zirahr"],'],
  ["light", warmLight, '[data-theme="light"] [data-site="zirahr"],'],
] as const)("ZiraHR buttons and gradients, %s theme", (_name, theme, selector) => {
  it("button text is readable on Signature Orange and its hover", () => {
    expect(theme.action).toBe("#f7933a");
    expect(contrast(theme["action-ink"]!, theme.action!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(theme["action-ink"]!, theme["action-strong"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["grad-hero", "grad-band", "grad-demo", "grad-cta"])(
    "%s keeps text readable at every stop",
    (name) => {
      const stops = gradientStops(selector)[name]!;
      expect(stops.length).toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(contrast(theme.text!, stop), `text on ${stop}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(theme["text-on-grad"]!, stop), `secondary text on ${stop}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );
});
