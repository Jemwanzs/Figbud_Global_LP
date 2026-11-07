/*
 * Alternating section themes on FigBud Global's home page (owner's brief,
 * 8 Nov 2026). The hero follows the visitor's global theme; Our Platforms
 * takes the opposite; each major section after it alternates, counting only
 * the sections actually on the page (proof sections show only once
 * something is published), so two neighbours never share a band. A section
 * set in the Studio keeps its theme, and the ones after it carry on
 * alternating from it. "Inverse" uses the existing theme engine
 * (`data-tone="inverse"`), so switching theme flips every band at once.
 */

export const HOME_SECTIONS = [
  { key: "platforms", label: "Our Platforms (with Trusted By)" },
  { key: "philosophy", label: "Our philosophy" },
  { key: "africa", label: "Built for Africa" },
  { key: "engineer", label: "What we engineer" },
  { key: "proof", label: "Customer proof (once published)" },
  { key: "company", label: "Company and insights" },
  { key: "closing", label: "Closing call to action" },
] as const;

export type HomeSection = (typeof HOME_SECTIONS)[number]["key"];
/** Follow the visitor's global theme, or take its opposite. */
export type BandTone = "follow" | "inverse";
/** Studio choices; a section left out alternates automatically. */
export type SectionThemes = Partial<Record<HomeSection, BandTone>>;

/** Each present section's tone, in page order, after a hero that follows the global theme. */
export function sectionTones(present: readonly HomeSection[], chosen: SectionThemes = {}) {
  const tones: Partial<Record<HomeSection, BandTone>> = {};
  let previous: BandTone = "follow";
  for (const key of present) {
    const tone: BandTone = chosen[key] ?? (previous === "follow" ? "inverse" : "follow");
    tones[key] = tone;
    previous = tone;
  }
  return tones;
}

/** Attributes for a section with that tone: its own background, so bands meet without gaps. */
export const bandProps = (tone: BandTone | undefined) => ({
  "data-tone": tone === "inverse" ? ("inverse" as const) : undefined,
  "data-band": tone ?? "follow",
});
