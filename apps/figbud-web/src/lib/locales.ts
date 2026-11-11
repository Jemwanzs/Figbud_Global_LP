import "server-only";

import { type Locale, defaultLocale, indexableLocales, isLocale, pageLocales } from "@figbud/i18n";
import { cacheLife, cacheTag } from "next/cache";

import { type PageMetadataInput, apiOrigin, pageMetadata } from "./site";

const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");

/**
 * The languages published in Settings & Security → Languages (P7-G2): English
 * always, plus each translation an owner published with a recorded review.
 * They alone are indexed, in sitemaps and in `hreflang`. Without the API, only
 * the languages published in code (English).
 */
export async function publishedLocales(): Promise<Locale[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("locales");
  try {
    const response = await fetch(`${base}/v1/locales`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [...indexableLocales];
    const data = (await response.json()) as { published?: unknown };
    return pageLocales([
      defaultLocale,
      ...(Array.isArray(data.published)
        ? data.published.filter((c): c is string => typeof c === "string" && isLocale(c))
        : []),
    ]);
  } catch {
    return [...indexableLocales];
  }
}

/** `pageMetadata` with the published languages. */
export async function localizedMetadata(input: Omit<PageMetadataInput, "languages">) {
  return pageMetadata({ ...input, languages: await publishedLocales() });
}
