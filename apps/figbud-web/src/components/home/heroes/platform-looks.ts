import type { HeroPaletteKey } from "@figbud/site-kit";

/*
 * FigBud Global's platform heroes (owner's brief, 13 Nov 2026): each
 * design's own look, used by the website and by the Hero Design Studio
 * (its colour controls show these as the defaults to reset to). Colours are
 * defaults, not fixed: an editor overrides any of them per variant, and with
 * "Follow the website's theme" they come from the site's own tokens instead.
 */

export type PlatformDesign = "emerald" | "digital" | "ecosystem_light" | "orbit" | "dark_enterprise";

export const PLATFORM_DESIGNS: PlatformDesign[] = [
  "emerald",
  "digital",
  "ecosystem_light",
  "orbit",
  "dark_enterprise",
];

export const isPlatformDesign = (design: string): design is PlatformDesign =>
  (PLATFORM_DESIGNS as string[]).includes(design);

export interface PlatformLook {
  /** The design's intended theme, kept when the hero keeps its own look. */
  scheme: "light" | "dark";
  /** The picture beside the words. */
  visual: "stack" | "hub" | "orbit";
  palette: Record<HeroPaletteKey, string>;
}

export const PLATFORM_LOOKS: Record<PlatformDesign, PlatformLook> = {
  emerald: {
    scheme: "dark",
    visual: "stack",
    palette: {
      background: "#032119",
      background_2: "#0b4330",
      heading: "#f2fff7",
      accent: "#a3e66a",
      text: "#cfe9dc",
      button: "#a3e66a",
      button_text: "#062016",
      card: "#0c3a2b",
      card_border: "#2e6f55",
      glow: "#74f0a0",
    },
  },
  digital: {
    scheme: "dark",
    visual: "hub",
    palette: {
      background: "#0a1033",
      background_2: "#2b1670",
      heading: "#f5f7ff",
      accent: "#5ff0e6",
      text: "#cdd2f2",
      button: "#5ff0e6",
      button_text: "#071233",
      card: "#191c52",
      card_border: "#40448f",
      glow: "#45d7ff",
    },
  },
  ecosystem_light: {
    scheme: "light",
    visual: "orbit",
    palette: {
      background: "#fbf8f1",
      background_2: "#e9f5ec",
      heading: "#0f1d17",
      accent: "#15803d",
      text: "#3f4d46",
      button: "#15803d",
      button_text: "#ffffff",
      card: "#ffffff",
      card_border: "#dbe5dd",
      glow: "#22c55e",
    },
  },
  orbit: {
    scheme: "light",
    visual: "orbit",
    palette: {
      background: "#fffaf5",
      background_2: "#ffeedd",
      heading: "#17110d",
      accent: "#c2570c",
      text: "#4f443c",
      button: "#f07a1a",
      button_text: "#17110d",
      card: "#ffffff",
      card_border: "#f0dfcf",
      glow: "#f7933a",
    },
  },
  dark_enterprise: {
    scheme: "dark",
    visual: "stack",
    palette: {
      background: "#0e0d0c",
      background_2: "#22160f",
      heading: "#f7f2ec",
      accent: "#f59a3c",
      text: "#cbc2b9",
      button: "#f28c28",
      button_text: "#140d07",
      card: "#1c1916",
      card_border: "#3d3027",
      glow: "#f28c28",
    },
  },
};

/** What each colour is called in the Studio. */
export const PALETTE_LABELS: Record<HeroPaletteKey, string> = {
  background: "Background",
  background_2: "Background, second colour",
  heading: "Headline",
  accent: "Headline accent",
  text: "Supporting text",
  button: "Main button",
  button_text: "Main button text",
  card: "Cards",
  card_border: "Card borders",
  glow: "Glow and connections",
};

/** The website's own tokens, used instead of the design's colours when following its theme. */
export const SITE_PALETTE: Record<HeroPaletteKey, string> = {
  background: "var(--bg)",
  background_2: "var(--surface-2)",
  heading: "var(--text)",
  accent: "var(--accent-strong)",
  text: "var(--text-muted)",
  // The corporate site leaves --action unset: its buttons use the accent.
  button: "var(--action, var(--accent))",
  button_text: "var(--action-ink, var(--accent-ink))",
  card: "var(--surface)",
  card_border: "var(--line)",
  glow: "var(--accent)",
};
