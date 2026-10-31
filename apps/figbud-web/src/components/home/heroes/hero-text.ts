import type { Locale } from "@figbud/i18n";
import type { HeroConfig } from "@figbud/site-kit";

/**
 * A hero's text: Studio overrides are written in English, so they apply to
 * English pages; other languages keep their (reviewed) dictionary copy.
 */
export function heroText(
  locale: Locale,
  config: HeroConfig,
  fallback: { eyebrow: string; headline: string; accent: string; lead: string },
) {
  const own = locale === "en";
  return {
    eyebrow: (own && config.eyebrow) || fallback.eyebrow,
    headline: (own && config.headline) || fallback.headline,
    accent: (own && config.headline_accent) || fallback.accent,
    lead: (own && config.lead) || fallback.lead,
  };
}
