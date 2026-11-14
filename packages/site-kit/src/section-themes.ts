/*
 * Alternating section themes on FigBud Global's home page (owner's briefs,
 * 8 and 14 Nov 2026). The hero follows the visitor's global theme; Our
 * Platforms takes the opposite; each major section after it alternates,
 * counting only the sections actually on the page (Trusted By and customer
 * proof show only once something is published), so two neighbours never
 * share a band. A section set in the Studio keeps its style, and the ones
 * after it carry on alternating from it.
 *
 * Every style uses the one theme engine (tokens.css), so switching theme
 * flips the page at once and nothing waits for JavaScript:
 *   - follow: the visitor's theme;
 *   - inverse: the other theme (`data-tone="inverse"`);
 *   - light / dark: that theme whatever the visitor's, by inverting in the
 *     other theme only (`data-tone-dark` / `data-tone-light`), so content
 *     inside (demonstrations, product colours) resolves as usual;
 *   - brand: the website's brand band (Colours & themes → Section bands),
 *     a dark band in either theme;
 *   - soft: the website's soft band for the visitor's theme.
 */

import type { ThemeMode } from "./site-theme";

export const HOME_SECTIONS = [
  { key: "platforms", label: "Our Platforms" },
  { key: "trusted", label: "Trusted By (once published)" },
  { key: "philosophy", label: "Our philosophy" },
  { key: "africa", label: "Built for Africa" },
  { key: "engineer", label: "What we engineer" },
  { key: "proof", label: "Customer proof (once published)" },
  { key: "company", label: "Company and insights" },
  { key: "closing", label: "Closing call to action" },
] as const;

export type HomeSection = (typeof HOME_SECTIONS)[number]["key"];
/** A Studio choice for a section (none: alternate automatically). */
export type BandTone = "follow" | "inverse" | "light" | "dark" | "brand" | "soft";
/** Studio choices; a section left out alternates automatically. */
export type SectionThemes = Partial<Record<HomeSection, BandTone>>;
/** How a section looks for a visitor on one theme. */
export type BandLook = "light" | "dark" | "brand" | "soft";

const opposite = (mode: ThemeMode): ThemeMode => (mode === "light" ? "dark" : "light");

/** The light or dark base of a choice, for a visitor on `mode`, after a section on `previous`. */
function base(choice: BandTone | undefined, mode: ThemeMode, previous: ThemeMode): ThemeMode {
  switch (choice) {
    case undefined:
      return opposite(previous);
    case "follow":
    case "soft":
      return mode;
    case "inverse":
      return opposite(mode);
    case "light":
      return "light";
    case "dark":
    case "brand":
      return "dark";
  }
}

/** Each present section's look for visitors on one theme, in page order. */
export function sectionLooks(
  present: readonly HomeSection[],
  chosen: SectionThemes,
  mode: ThemeMode,
): Partial<Record<HomeSection, BandLook>> {
  const looks: Partial<Record<HomeSection, BandLook>> = {};
  let previous: ThemeMode = mode; // the hero follows the visitor's theme
  for (const key of present) {
    const choice = chosen[key];
    previous = base(choice, mode, previous);
    looks[key] = choice === "brand" || choice === "soft" ? choice : previous;
  }
  return looks;
}

/**
 * Each present section's style, worked out for both themes at once (the
 * visitor's theme is only known in the browser): light on one theme and dark
 * on the other is `follow` or `inverse`; the same on both is `light` or
 * `dark`.
 */
export function sectionTones(
  present: readonly HomeSection[],
  chosen: SectionThemes = {},
): Partial<Record<HomeSection, BandTone>> {
  const onLight = sectionLooks(present, chosen, "light");
  const onDark = sectionLooks(present, chosen, "dark");
  const tones: Partial<Record<HomeSection, BandTone>> = {};
  for (const key of present) {
    const light = onLight[key];
    const dark = onDark[key];
    if (light === "brand" || light === "soft") tones[key] = light;
    else if (light === "light") tones[key] = dark === "dark" ? "follow" : "light";
    else tones[key] = dark === "light" ? "inverse" : "dark";
  }
  return tones;
}

/** Attributes for a section with that style: its own background, so bands meet without gaps. */
export const bandProps = (tone: BandTone | undefined) => ({
  "data-tone": tone === "inverse" ? ("inverse" as const) : undefined,
  // Inverted on the light theme only (dark whatever the theme), or on the dark theme only.
  "data-tone-light": tone === "dark" || tone === "brand" ? ("inverse" as const) : undefined,
  "data-tone-dark": tone === "light" ? ("inverse" as const) : undefined,
  "data-band": tone ?? "follow",
});
