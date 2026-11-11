import { contrast, isHex, mix } from "@figbud/site-kit";

/*
 * The Admin Studio's own appearance (owner's brief, 12 Nov 2026): Settings &
 * Security → Appearance & themes. Mirrors services/api/src/studio_appearance.rs.
 * The Studio applies the published colours as tokens on its own <html>
 * (`[data-studio]`), so websites and their previews are never affected.
 */

export type StudioModeKey = "light" | "dark";

export interface StudioMode {
  background?: string;
  sidebar?: string;
  surface?: string;
  hover?: string;
  field?: string;
  border?: string;
  text?: string;
  text_muted?: string;
  action?: string;
  action_text?: string;
  accent_text?: string;
  success?: string;
  warning?: string;
  danger?: string;
  glow?: string;
  /** 0–40 %. */
  glow_intensity?: number;
}

export interface Appearance {
  light?: StudioMode;
  dark?: StudioMode;
  shared?: { primary?: string; secondary?: string; palette?: { name: string; hex: string }[] };
}

export interface AppearanceAdmin {
  appearance: Appearance;
  draft: Appearance | null;
  history: { published_at: string; by: string | null; appearance: Appearance }[];
  version: number;
  can_edit: boolean;
}

export const MODE_COLOURS = [
  "background",
  "sidebar",
  "surface",
  "hover",
  "field",
  "border",
  "text",
  "text_muted",
  "action",
  "action_text",
  "accent_text",
  "success",
  "warning",
  "danger",
  "glow",
] as const;
type Colour = (typeof MODE_COLOURS)[number];

/** Optional: unset uses the page background (fields) or no glow. */
export const OPTIONAL: readonly Colour[] = ["field", "glow"];

/**
 * The built-in palette (packages/brand/src/tokens.css, `[data-studio]`): warm
 * cream, cream, warm orange, warm brown and brown, with near-black brown in
 * dark mode. Borders are the built-in translucent lines as seen on the page.
 */
export const STUDIO_DEFAULTS: Required<Pick<Appearance, "light" | "dark">> & Appearance = {
  dark: {
    background: "#0c0806",
    sidebar: "#130d09",
    surface: "#1a120d",
    hover: "#241810",
    border: "#3b332d",
    text: "#f8f1e8",
    text_muted: "#e3d4c3",
    action: "#f28c38",
    action_text: "#2a170c",
    accent_text: "#f28c38",
    success: "#4ade80",
    warning: "#fbbf24",
    danger: "#f87171",
    glow: "#f28c38",
    glow_intensity: 22,
  },
  light: {
    background: "#f8f1e8",
    sidebar: "#fffaf4",
    surface: "#fffaf4",
    hover: "#f1e6d8",
    border: "#d5ccc3",
    text: "#352219",
    text_muted: "#5c4434",
    action: "#f28c38",
    action_text: "#352219",
    accent_text: "#a4500f",
    success: "#166534",
    warning: "#854d0e",
    danger: "#b91c1c",
    glow: "#f28c38",
    glow_intensity: 28,
  },
  shared: {
    primary: "#f28c38",
    secondary: "#c99a76",
    palette: [
      { name: "Warm cream", hex: "#f8f1e8" },
      { name: "Cream", hex: "#fffaf4" },
      { name: "Warm orange", hex: "#f28c38" },
      { name: "Warm brown", hex: "#c99a76" },
      { name: "Brown", hex: "#5c4434" },
      { name: "Deep brown", hex: "#352219" },
      { name: "Charcoal brown", hex: "#0c0806" },
    ],
  },
};

const rgba = (hex: string, percent: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r} ${g} ${b} / ${percent}%)`;
};

const CORE: readonly Colour[] = MODE_COLOURS.filter((c) => !OPTIONAL.includes(c));
export const modeComplete = (m?: StudioMode): m is StudioMode & Record<(typeof CORE)[number], string> =>
  !!m && CORE.every((c) => isHex(m[c]));

/** A mode's tokens: its colours and what's derived from them. */
export function studioTokens(m: StudioMode, secondary?: string): Record<string, string> {
  if (!modeComplete(m)) return {};
  const t: Record<string, string> = {
    "--bg": m.background,
    "--bg-elevated": m.sidebar,
    "--surface": m.surface,
    "--surface-2": m.hover,
    "--surface-3": mix(m.hover, m.text, 6),
    "--line": rgba(m.border, 55),
    "--line-strong": m.border,
    "--text": m.text,
    "--text-muted": m.text_muted,
    "--text-subtle": m.text_muted,
    "--accent": m.accent_text,
    "--accent-strong": m.accent_text,
    "--accent-ink": m.background,
    "--accent-soft": rgba(m.action, 12),
    "--action": m.action,
    "--action-strong": mix(m.action, m.text, 8),
    "--action-ink": m.action_text,
    "--focus": m.accent_text,
    "--success": m.success,
    "--warning": m.warning,
    "--danger": m.danger,
    "--glow": isHex(m.glow) ? rgba(m.glow, Math.min(40, Math.max(0, m.glow_intensity ?? 20))) : "transparent",
  };
  if (isHex(secondary)) t["--accent-2"] = secondary;
  return t;
}

/** The published appearance as a stylesheet for the Studio's own <html>. */
export function studioAppearanceCss(a?: Appearance | null): string {
  if (!a) return "";
  return (["dark", "light"] as const)
    .flatMap((mode) => {
      const m = a[mode];
      const tokens = studioTokens(m ?? {}, a.shared?.secondary);
      const decl = Object.entries(tokens).map(([k, v]) => `${k}: ${v};`);
      if (!decl.length) return [];
      const field = isHex(m?.field)
        ? `\n[data-studio][data-theme="${mode}"] .fb-field { background-color: ${m.field}; }`
        : "";
      return [`[data-studio][data-theme="${mode}"] {\n  ${decl.join("\n  ")}\n}${field}`];
    })
    .join("\n");
}

export interface AppearanceIssue {
  mode: StudioModeKey;
  critical: boolean;
  message: string;
  ratio?: number;
}

/** The API's publishing checks (critical), plus warnings, for the editor. */
export function appearanceIssues(a: Appearance): AppearanceIssue[] {
  const issues: AppearanceIssue[] = [];
  for (const mode of ["light", "dark"] as const) {
    const m = a[mode];
    if (!m || !Object.values(m).some((v) => v !== undefined && v !== "")) continue;
    if (!modeComplete(m)) {
      issues.push({ mode, critical: true, message: "Set every colour of the mode, so it can be checked." });
      continue;
    }
    const worst = (fg: string, backs: string[]) => Math.min(...backs.map((b) => contrast(fg, b)));
    const need = (ratio: number, message: string) => {
      if (ratio < 4.5) issues.push({ mode, critical: true, message, ratio });
    };
    const panels = [m.background, m.sidebar, m.surface, m.hover, ...(isHex(m.field) ? [m.field] : [])];
    need(worst(m.text, panels), "Headings and text on backgrounds, cards, hover and fields");
    need(worst(m.text_muted, panels), "Body text on backgrounds, cards, hover and fields");
    need(
      worst(m.accent_text, [m.background, m.sidebar, m.surface]),
      "Links and active labels on the page, sidebar and cards",
    );
    need(contrast(m.action_text, m.action), "Button text on buttons");
    for (const [key, label] of [
      ["success", "Success messages"],
      ["warning", "Warnings"],
      ["danger", "Errors"],
    ] as const)
      need(worst(m[key], [m.background, m.surface]), `${label} on the page and cards`);
    if (contrast(m.border, m.background) < 1.3)
      issues.push({
        mode,
        critical: false,
        message: "Borders are hard to see on the page",
        ratio: contrast(m.border, m.background),
      });
    if (contrast(m.hover, m.surface) < 1.05)
      issues.push({
        mode,
        critical: false,
        message: "Hover is hard to tell from cards",
        ratio: contrast(m.hover, m.surface),
      });
  }
  return issues;
}
