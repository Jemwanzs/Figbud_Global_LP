export * from "./products";

export const company = {
  name: "FigBud Global",
  tagline: "From vision to value, we deliver.",
  /** Proposed production origin of the corporate site. Not yet provisioned. */
  proposedOrigin: "https://figbudglobal.com",
  foundingCountry: "Kenya",
} as const;

/**
 * Page background per theme (mirrors `--bg` in tokens.css), for places CSS
 * can't reach: browser `theme-color`, web app manifests, generated images.
 */
export const themeBackground = { dark: "#020617", light: "#f8fafc" } as const;

/** `viewport.themeColor` for Next.js layouts. */
export const themeColorViewport = [
  { media: "(prefers-color-scheme: dark)", color: themeBackground.dark },
  { media: "(prefers-color-scheme: light)", color: themeBackground.light },
];
