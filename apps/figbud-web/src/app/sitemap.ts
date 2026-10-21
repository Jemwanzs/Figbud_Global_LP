import { indexableLocales, localeInfo, localizePath } from "@figbud/i18n";
import type { MetadataRoute } from "next";

import { allowIndexing, publishedPaths, siteOrigin } from "@/lib/site";

/** Only published pages in reviewed locales, each with its hreflang alternates. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (!allowIndexing) return [];
  return publishedPaths.flatMap((path) =>
    indexableLocales.map((locale) => ({
      url: `${siteOrigin}${localizePath(locale, path)}`,
      changeFrequency: path === "/" ? "weekly" : "monthly",
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          indexableLocales.map((alt) => [localeInfo[alt].tag, `${siteOrigin}${localizePath(alt, path)}`]),
        ),
      },
    })),
  );
}
