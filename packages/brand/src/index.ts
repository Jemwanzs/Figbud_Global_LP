export * from "./products";

export const company = {
  name: "FigBud Global",
  // The official slogan (owner, 30 Oct 2026).
  tagline: "One Vision. Endless Solutions.",
  /** Proposed production origin of the corporate site. Not yet provisioned. */
  proposedOrigin: "https://figbudglobal.com",
  foundingCountry: "Kenya",
} as const;

/**
 * Page background per theme (mirrors `--bg` in tokens.css), for places CSS
 * can't reach: browser `theme-color`, web app manifests, generated images.
 */
export const themeBackground = { dark: "#020617", light: "#f8fafc" } as const;

/**
 * `viewport.themeColor` for Next.js layouts: the dark background, because
 * dark is every first-time visitor's theme whatever their device prefers.
 */
export const themeColorViewport = themeBackground.dark;
