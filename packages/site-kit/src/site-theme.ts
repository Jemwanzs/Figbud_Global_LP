/**
 * A website's Brand & Theme Studio colours (owner's brief, 11 Nov 2026): a
 * palette, independent light and dark colours and gradient presets, published
 * from Admin Studio → Websites → a website → Colours & themes. The websites
 * turn the published theme into CSS custom properties scoped to the website
 * (`data-site` on its <body>), so no other website's colours change; unset
 * colours keep the website's built-in ones (packages/brand/src/tokens.css).
 *
 * The derived surfaces and the contrast rules match the API
 * (services/api/src/site_theme.rs), which refuses to publish a critical
 * failure; the Studio shows the same checks as warnings while drafting.
 */

export const GRADIENT_PRESETS = ["hero", "band", "demo", "cta", "footer"] as const;
export type GradientPreset = (typeof GRADIENT_PRESETS)[number];
export type ThemeMode = "light" | "dark";

export interface Swatch {
  name: string;
  hex: string;
}

export interface ModeTokens {
  background?: string | null;
  surface?: string | null;
  text?: string | null;
  text_muted?: string | null;
  /** Button and active-state fill. */
  action?: string | null;
  /** Text on the button colour. */
  action_text?: string | null;
  /** The brand colour as text: links, labels. */
  accent_text?: string | null;
  border?: string | null;
  focus?: string | null;
  /** Secondary text on gradient panels and contrasting bands. */
  text_on_gradient?: string | null;
}

export interface GradientStop {
  color: string;
  /** Position, 0–100 %. */
  at: number;
  /** Opacity, 0–100 % (default 100). */
  opacity?: number;
}

export interface Gradient {
  kind?: "linear" | "radial";
  /** Linear: direction in degrees. */
  angle?: number;
  /** Radial: centre, in % of the width and height. */
  x?: number;
  y?: number;
  stops: GradientStop[];
}

export interface GradientPair {
  light?: Gradient | null;
  dark?: Gradient | null;
}

/**
 * A mode's section band colours (owner's brief, 13 Nov 2026). Unset means
 * the band inherits from the theme (`bandColours`); a value is that
 * website's own override for the band, in that mode only.
 */
export interface BandColours {
  /** Behind "Brand band" sections. */
  brand?: string | null;
  /** Behind "Soft band" sections. */
  soft?: string | null;
}

export const BAND_KEYS = ["brand", "soft"] as const;
export type BandKey = (typeof BAND_KEYS)[number];

/** The Studio's part of a website's theme (`settings.theme`). */
export interface StudioTheme {
  palette?: Swatch[];
  light?: ModeTokens;
  dark?: ModeTokens;
  gradients?: Partial<Record<GradientPreset, GradientPair>>;
  /** Section band overrides per mode; missing ones inherit. */
  bands?: Partial<Record<ThemeMode, BandColours>>;
}

export const MODE_FIELDS = [
  "background",
  "surface",
  "text",
  "text_muted",
  "action",
  "action_text",
  "accent_text",
  "border",
  "focus",
  "text_on_gradient",
] as const satisfies readonly (keyof ModeTokens)[];

/** What a mode must set together, so it can be checked. */
export const CORE_FIELDS = [
  "background",
  "surface",
  "text",
  "text_muted",
  "action",
  "action_text",
  "accent_text",
] as const satisfies readonly (keyof ModeTokens)[];

/** The derived surfaces, in % towards the text colour (site_theme.rs). */
export const ELEVATED = 3;
export const SURFACE_2 = 6;
export const SURFACE_3 = 9;

const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9_-]+$/;

export const isHex = (value: unknown): value is string => typeof value === "string" && HEX.test(value);

const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** `a` moved `percent` of the way to `b`, as `color-mix(in srgb, …)` (and the API) compute it. */
export function mix(a: string, b: string, percent: number): string {
  if (!isHex(a) || !isHex(b)) return a;
  const p = Math.min(100, Math.max(0, percent)) / 100;
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x
    .map((v, i) =>
      Math.floor(v + (y[i]! - v) * p + 0.5)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two hex colours (0 if either isn't one). */
export function contrast(a: string, b: string): number {
  if (!isHex(a) || !isHex(b)) return 0;
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const alpha = (hex: string, percent: number) => {
  const [r, g, b] = rgb(hex);
  return percent >= 100 ? hex.toLowerCase() : `rgb(${r} ${g} ${b} / ${percent}%)`;
};

/** A gradient as CSS (only from checked numbers and hex colours). */
export function gradientCss(g: Gradient): string | null {
  const stops = g.stops.filter((s) => isHex(s.color));
  if (stops.length < 2) return null;
  const clamp = (n: number | undefined, max: number, fallback: number) =>
    Math.min(max, Math.max(0, Math.round(Number.isFinite(n) ? (n as number) : fallback)));
  const list = stops
    .map((s) => `${alpha(s.color, clamp(s.opacity, 100, 100))} ${clamp(s.at, 100, 0)}%`)
    .join(", ");
  return g.kind === "radial"
    ? `radial-gradient(ellipse at ${clamp(g.x, 100, 50)}% ${clamp(g.y, 100, 50)}%, ${list})`
    : `linear-gradient(${clamp(g.angle, 360, 0)}deg, ${list})`;
}

/** Whether a mode sets every core colour (it's then applied as a whole). */
export const modeComplete = (
  m?: ModeTokens | null,
): m is ModeTokens & Record<(typeof CORE_FIELDS)[number], string> =>
  !!m && CORE_FIELDS.every((f) => isHex(m[f]));

/** A mode's CSS custom properties: its colours and the surfaces derived from them. */
export function themeTokens(m: ModeTokens): Record<string, string> {
  if (!modeComplete(m)) return {};
  const { background: bg, surface, text, text_muted: muted, action, action_text, accent_text } = m;
  const t: Record<string, string> = {
    "--bg": bg,
    "--bg-elevated": mix(bg, text, ELEVATED),
    "--surface": surface,
    "--surface-2": mix(surface, text, SURFACE_2),
    "--surface-3": mix(surface, text, SURFACE_3),
    "--line": alpha(text, 12),
    "--line-strong": isHex(m.border) ? m.border : alpha(text, 22),
    "--text": text,
    "--text-muted": muted,
    "--text-subtle": muted,
    "--text-on-grad": isHex(m.text_on_gradient) ? m.text_on_gradient : muted,
    "--accent": accent_text,
    "--accent-strong": accent_text,
    "--accent-ink": bg,
    "--accent-soft": alpha(action, 14),
    "--product-text": accent_text,
    "--action": action,
    "--action-strong": action,
    "--action-ink": action_text,
    "--glow": alpha(action, 22),
    "--focus": isHex(m.focus) ? m.focus : accent_text,
  };
  for (const [key, value] of Object.entries(t)) t[key] = value.toLowerCase();
  return t;
}

/** The elements that take a mode's colours on a website, as in tokens.css. */
function modeSelectors(slug: string, mode: ThemeMode) {
  const other = mode === "dark" ? "light" : "dark";
  const site = `[data-site="${slug}"]`;
  return [
    `[data-theme="${mode}"] ${site}`,
    `${site} [data-theme="${mode}"]`,
    `[data-theme="${other}"] ${site} [data-tone="inverse"]`,
    `[data-theme="${mode}"] ${site} [data-tone="inverse"] [data-tone="inverse"]`,
  ].join(",\n");
}

/**
 * Gradients made from a mode's own colours, by the built-in recipe: the
 * background into the surface, lit by a touch (6 %) of the button colour.
 * For ZiraHR's built-in colours this gives its own stops (#43362e is Charcoal
 * Mocha with 6 % Signature Orange).
 */
export function derivedGradients(m: ModeTokens): Partial<Record<GradientPreset, Gradient>> {
  if (!modeComplete(m)) return {};
  const { background: bg, surface, action } = m;
  const lit = mix(surface, action, 6);
  const glow = (): Gradient => ({
    kind: "radial",
    x: 80,
    y: 20,
    stops: [
      { color: lit, at: 0 },
      { color: surface, at: 45 },
      { color: bg, at: 100 },
    ],
  });
  return {
    hero: {
      kind: "linear",
      angle: 125,
      stops: [
        { color: bg, at: 5 },
        { color: mix(bg, surface, 50), at: 54 },
        { color: surface, at: 100 },
      ],
    },
    band: glow(),
    demo: glow(),
    cta: {
      kind: "linear",
      angle: 140,
      stops: [
        { color: bg, at: 15 },
        { color: surface, at: 65 },
        { color: lit, at: 100 },
      ],
    },
  };
}

/**
 * A mode's gradients as CSS (owner's brief, 12 Nov 2026: gradients come from
 * the published theme, never from unrelated colours). A gradient the Studio
 * set is used as it is. Where the background or surface was changed but a
 * gradient was left as built in, it's made from the new colours instead, so
 * bands, demonstration stages and calls to action don't keep the old ones.
 */
export function modeGradientCss(
  slug: string,
  theme: StudioTheme,
  mode: ThemeMode,
): Partial<Record<GradientPreset, string>> {
  const m = theme[mode] ?? {};
  const base = builtInTheme(slug);
  const own = base[mode] ?? {};
  const recoloured =
    modeComplete(m) &&
    (!modeComplete(own) ||
      m.background.toLowerCase() !== own.background.toLowerCase() ||
      m.surface.toLowerCase() !== own.surface.toLowerCase());
  const derived = recoloured ? derivedGradients(m) : {};
  const out: Partial<Record<GradientPreset, string>> = {};
  for (const preset of GRADIENT_PRESETS) {
    const g = theme.gradients?.[preset]?.[mode];
    const builtIn = base.gradients?.[preset]?.[mode];
    let css = g ? gradientCss(g) : null;
    const asBuilt = !g || (builtIn && css === gradientCss(builtIn));
    const made = derived[preset];
    if (asBuilt && made) css = gradientCss(made);
    if (css) out[preset] = css;
  }
  return out;
}

/** A mode's colours as the website uses them: its own when complete, else the built-in ones. */
export const effectiveMode = (slug: string, theme: StudioTheme | null | undefined, mode: ThemeMode) => {
  const own = theme?.[mode];
  const built = builtInTheme(slug)[mode];
  return (modeComplete(own) ? own : built) as ModeTokens & Record<(typeof CORE_FIELDS)[number], string>;
};

export interface BandColour {
  hex: string;
  /** The band's own override, rather than inherited. */
  override: boolean;
  /** Where an inherited colour comes from, for the Studio. */
  source: string;
  /** Text and secondary text on the band. */
  text: string;
  muted: string;
}

const MODE_NAME: Record<ThemeMode, string> = { light: "Light mode", dark: "Dark mode" };

/**
 * A mode's section bands (owner's brief, 13 Nov 2026): one palette for the
 * whole website. Brand bands are a dark band in either mode, on the dark
 * mode's cards and panels colour with its text; soft bands are the mode's own
 * deeper surface, with its text. An override replaces just the colour, for
 * that band and mode; removing it inherits the theme's current colour again.
 */
export function bandColours(
  slug: string,
  theme: StudioTheme | null | undefined,
  mode: ThemeMode,
): Record<BandKey, BandColour> {
  const m = effectiveMode(slug, theme, mode);
  const dark = effectiveMode(slug, theme, "dark");
  const own = theme?.bands?.[mode] ?? {};
  const pick = (key: BandKey, hex: string, source: string, text: string, muted: string): BandColour => {
    const set = own[key];
    return isHex(set)
      ? { hex: set.toLowerCase(), override: true, source: "Custom override", text, muted }
      : { hex: hex.toLowerCase(), override: false, source, text, muted };
  };
  return {
    brand: pick("brand", dark.surface, "Dark mode → Cards and panels", dark.text, dark.text_muted),
    soft: pick(
      "soft",
      mix(m.surface, m.text, SURFACE_2),
      `${MODE_NAME[mode]} → Cards and panels, deeper`,
      m.text,
      m.text_muted,
    ),
  };
}

/** The band custom properties for a mode (`.fb-tone-brand`, `.fb-tone-soft`). */
export function bandTokens(slug: string, theme: StudioTheme | null | undefined, mode: ThemeMode) {
  const { brand, soft } = bandColours(slug, theme, mode);
  return {
    "--section-brand": brand.hex,
    "--section-brand-text": brand.text.toLowerCase(),
    "--section-brand-muted": brand.muted.toLowerCase(),
    "--section-soft": soft.hex,
  };
}

/**
 * The website's published theme as a stylesheet, scoped to the website. The
 * section bands are always included: with nothing published they come from
 * the website's built-in colours.
 */
export function siteThemeCss(slug: string, theme?: StudioTheme | null): string {
  if (!SLUG.test(slug)) return "";
  theme ??= {};
  const blocks: string[] = [];
  for (const mode of ["dark", "light"] as const) {
    const declarations = Object.entries(themeTokens(theme[mode] ?? {})).map(([k, v]) => `${k}: ${v};`);
    for (const [preset, css] of Object.entries(modeGradientCss(slug, theme, mode))) {
      declarations.push(`--grad-${preset}: ${css};`);
    }
    for (const [k, v] of Object.entries(bandTokens(slug, theme, mode))) declarations.push(`${k}: ${v};`);
    if (declarations.length)
      blocks.push(
        `${modeSelectors(slug, mode)} {\n  color-scheme: ${mode};\n  ${declarations.join("\n  ")}\n}`,
      );
  }
  return blocks.join("\n");
}

export interface ThemeIssue {
  mode: ThemeMode;
  /** Blocks publishing (WCAG AA), or a warning. */
  critical: boolean;
  message: string;
  ratio?: number;
}

/**
 * The checks the API makes before publishing, for the Studio to show while
 * drafting (with each failing ratio).
 */
export function themeIssues(theme: StudioTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const m = theme[mode] ?? {};
    const gradients = GRADIENT_PRESETS.flatMap((p) => {
      const g = theme.gradients?.[p]?.[mode];
      return g ? [{ preset: p, g }] : [];
    });
    if (!MODE_FIELDS.some((f) => m[f]) && !gradients.length) continue;
    if (!modeComplete(m)) {
      issues.push({ mode, critical: true, message: "Set every core colour, so the theme can be checked." });
      continue;
    }
    const bg = m.background;
    const surfaces = [
      bg,
      mix(bg, m.text, ELEVATED),
      m.surface,
      mix(m.surface, m.text, SURFACE_2),
      mix(m.surface, m.text, SURFACE_3),
    ];
    const worst = (fg: string, backs: string[]) => Math.min(...backs.map((b) => contrast(fg, b)));
    const need = (ratio: number, min: number, message: string) => {
      if (ratio < min) issues.push({ mode, critical: true, message, ratio });
    };
    need(worst(m.text, surfaces), 4.5, "Text on the background and surfaces");
    need(worst(m.text_muted, surfaces), 4.5, "Secondary text on the background and surfaces");
    need(worst(m.accent_text, surfaces), 4.5, "Accent text (links, labels) on the background and surfaces");
    need(contrast(m.action_text, m.action), 4.5, "Button text on the button colour");
    if (isHex(m.focus)) need(contrast(m.focus, bg), 3, "Focus ring on the background");
    const seen = (g: Gradient) =>
      g.stops.filter((s) => isHex(s.color)).map((s) => mix(bg, s.color, s.opacity ?? 100));
    const secondary = isHex(m.text_on_gradient) ? m.text_on_gradient : m.text_muted;
    for (const { preset, g } of gradients) {
      const backs = seen(g);
      if (!backs.length) continue;
      need(worst(m.text, backs), 4.5, `Text on the ${preset} gradient`);
      need(
        worst(preset === "hero" ? m.text_muted : secondary, backs),
        4.5,
        `Secondary text on the ${preset} gradient`,
      );
    }
    // Warnings: legible, but worth a look.
    // Section band overrides: their text must stay readable.
    for (const key of BAND_KEYS) {
      const set = theme.bands?.[mode]?.[key];
      if (!isHex(set)) continue;
      const on = key === "brand" ? theme.dark : m;
      if (!modeComplete(on)) continue;
      const name = key === "brand" ? "Brand band" : "Soft band";
      need(contrast(on.text, set), 4.5, `Text on the ${name.toLowerCase()} (${mode} mode)`);
      need(contrast(on.text_muted, set), 4.5, `Secondary text on the ${name.toLowerCase()} (${mode} mode)`);
    }
    if (contrast(m.action, bg) < 3)
      issues.push({
        mode,
        critical: false,
        message: "Buttons stand out little from the background (under 3:1)",
        ratio: contrast(m.action, bg),
      });
    if (isHex(m.border) && contrast(m.border, bg) < 1.5)
      issues.push({
        mode,
        critical: false,
        message: "Borders are faint on the background",
        ratio: contrast(m.border, bg),
      });
  }
  return issues;
}

/** FigBud's shared colours (tokens.css), which websites without their own use. */
const PARENT: Required<Pick<StudioTheme, "light" | "dark">> = {
  dark: {
    background: "#020617",
    surface: "#0f172a",
    text: "#f8fafc",
    text_muted: "#cbd5e1",
    action: "#22c55e",
    action_text: "#020617",
    accent_text: "#4ade80",
    focus: "#4ade80",
  },
  light: {
    background: "#f8fafc",
    surface: "#ffffff",
    text: "#0f172a",
    text_muted: "#475569",
    action: "#15803d",
    action_text: "#ffffff",
    // The deeper green: it stays above 4.5:1 on the deepest derived surface.
    accent_text: "#166534",
    focus: "#16a34a",
  },
};

/**
 * Each website's built-in theme (tokens.css): what "Restore defaults" brings
 * back, and where a Studio draft starts. ZiraHR's is the owner's palette and
 * gradients of 11 Nov 2026.
 */
export const BUILT_IN_THEMES = {
  // FigBud Global (UI-BT3, 14 Nov 2026): the shared colours it was built with,
  // and its brand colours from tokens.css to pick from.
  figbud: {
    palette: [
      { name: "FigBud Green", hex: "#22c55e" },
      { name: "Bright Green", hex: "#4ade80" },
      { name: "Deep Green", hex: "#15803d" },
      { name: "Midnight", hex: "#020617" },
      { name: "Deep Slate", hex: "#0f172a" },
      { name: "Snow", hex: "#f8fafc" },
      { name: "Sky Blue", hex: "#60a5fa" },
      { name: "Soft Violet", hex: "#c084fc" },
    ],
    ...PARENT,
    gradients: {},
  },
  zirahr: {
    palette: [
      { name: "Signature Orange", hex: "#f7933a" },
      { name: "Deep Charcoal", hex: "#292625" },
      { name: "Charcoal Mocha", hex: "#38302d" },
      { name: "Cream", hex: "#fff5e6" },
      { name: "Warm Ivory", hex: "#f9f5ef" },
      { name: "Warm Taupe", hex: "#78675e" },
      { name: "Muted Bronze", hex: "#b98b61" },
    ],
    dark: {
      background: "#292625",
      surface: "#38302d",
      text: "#fff5e6",
      text_muted: "#d8c9b8",
      action: "#f7933a",
      action_text: "#292625",
      accent_text: "#f9a65c",
      focus: "#f9a65c",
      text_on_gradient: "#eadfd2",
    },
    light: {
      background: "#f9f5ef",
      surface: "#fff5e6",
      text: "#292625",
      text_muted: "#6a5a51",
      action: "#f7933a",
      action_text: "#292625",
      accent_text: "#9a4f17",
      focus: "#b05a1c",
      text_on_gradient: "#6a5a51",
    },
    gradients: {
      hero: {
        dark: {
          kind: "linear",
          angle: 125,
          stops: [
            { color: "#292625", at: 5 },
            { color: "#2f2a28", at: 54 },
            { color: "#38302d", at: 100 },
          ],
        },
        light: {
          kind: "linear",
          angle: 125,
          stops: [
            { color: "#f9f5ef", at: 5 },
            { color: "#fff5e6", at: 54 },
            { color: "#f1dcc2", at: 100 },
          ],
        },
      },
      band: {
        dark: {
          kind: "radial",
          x: 80,
          y: 20,
          stops: [
            { color: "#43362e", at: 0 },
            { color: "#38302d", at: 45 },
            { color: "#292625", at: 100 },
          ],
        },
        light: {
          kind: "radial",
          x: 80,
          y: 20,
          stops: [
            { color: "#f6e3cc", at: 0 },
            { color: "#fff5e6", at: 45 },
            { color: "#f9f5ef", at: 100 },
          ],
        },
      },
      demo: {
        dark: {
          kind: "radial",
          x: 80,
          y: 20,
          stops: [
            { color: "#43362e", at: 0 },
            { color: "#38302d", at: 45 },
            { color: "#292625", at: 100 },
          ],
        },
        light: {
          kind: "radial",
          x: 80,
          y: 20,
          stops: [
            { color: "#f6e3cc", at: 0 },
            { color: "#fff5e6", at: 45 },
            { color: "#f9f5ef", at: 100 },
          ],
        },
      },
      cta: {
        dark: {
          kind: "linear",
          angle: 140,
          stops: [
            { color: "#292625", at: 15 },
            { color: "#38302d", at: 65 },
            { color: "#43362e", at: 100 },
          ],
        },
        light: {
          kind: "linear",
          angle: 140,
          stops: [
            { color: "#f9f5ef", at: 15 },
            { color: "#f6e6d3", at: 65 },
            { color: "#f1dcc2", at: 100 },
          ],
        },
      },
    },
  },
} satisfies Record<string, StudioTheme>;

/** A website's built-in theme (its own, else FigBud's shared colours, no gradients). */
export const builtInTheme = (slug: string): StudioTheme =>
  (BUILT_IN_THEMES as Record<string, StudioTheme>)[slug] ?? { palette: [], ...PARENT, gradients: {} };
