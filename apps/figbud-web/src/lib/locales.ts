import "server-only";

import {
  type Locale,
  type SiteLanguages,
  defaultLocale,
  indexableLocales,
  isLocale,
  liveLanguages,
  pageLocales,
} from "@figbud/i18n";
import { fetchListedSites } from "@figbud/site-kit/server";
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

/**
 * FigBud Global's languages as visitors get them (Websites → FigBud Global →
 * Languages, P7-L1): the ones switched on, the one it opens in and the
 * fallback for text not translated yet. All five until someone changes them.
 */
export async function figbudLanguages(): Promise<SiteLanguages> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  cacheTag("locales");
  const sites = await fetchListedSites(base);
  const config = sites?.find((s) => s.slug === "figbud")?.settings?.languages;
  return liveLanguages(config, "corporate", await publishedLocales());
}

/** Languages in search results, sitemaps and `hreflang`: reviewed, and switched on. */
export async function indexedLocales(): Promise<Locale[]> {
  const [published, { enabled }] = await Promise.all([publishedLocales(), figbudLanguages()]);
  return published.filter((l) => enabled.includes(l));
}

/** `pageMetadata` with the languages that are indexed. */
export async function localizedMetadata(input: Omit<PageMetadataInput, "languages">) {
  return pageMetadata({ ...input, languages: await indexedLocales() });
}
