import { indexableLocales, localeInfo, localizePath } from "@figbud/i18n";
import type { MetadataRoute } from "next";

import { LEGAL_PATHS } from "@/components/legal-page";
import { getArticles, getPublishedSlugs } from "@/lib/cms";
import { getCorporatePage } from "@/lib/corporate-pages";
import { allowIndexing, publishedPaths, routes, siteOrigin } from "@/lib/site";

/**
 * Only published pages in reviewed locales, each with its hreflang alternates.
 * The blog joins once it has articles; each article is listed in its own
 * locale (translations are separate articles with their own slugs).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!allowIndexing) return [];

  // Legal pages join once their reviewed text is published from the Studio.
  const legal = await Promise.all(
    LEGAL_PATHS.map(async (path) => {
      const page = await getCorporatePage(path);
      return page && !page.seo_noindex ? `/${path}` : null;
    }),
  );
  const paths = [...publishedPaths, ...legal.filter((p): p is string => p !== null)];
  const pages = paths.flatMap((path) =>
    indexableLocales.map((locale) => ({
      url: `${siteOrigin}${localizePath(locale, path)}`,
      changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "/" ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(
          indexableLocales.map((alt) => [localeInfo[alt].tag, `${siteOrigin}${localizePath(alt, path)}`]),
        ),
      },
    })),
  );

  const blog = await Promise.all(
    indexableLocales.map(async (locale) => {
      const [latest, slugs] = await Promise.all([
        getArticles({ locale, perPage: 1 }),
        getPublishedSlugs(locale),
      ]);
      if (!latest.ok || latest.data.total === 0) return [];
      return [
        {
          url: `${siteOrigin}${localizePath(locale, routes.blog)}`,
          changeFrequency: "weekly" as const,
          priority: 0.6,
          lastModified: latest.data.items[0]?.published_at,
        },
        ...slugs.map((slug) => ({
          url: `${siteOrigin}${localizePath(locale, `${routes.blog}/${slug}`)}`,
          changeFrequency: "monthly" as const,
          priority: 0.5,
        })),
      ];
    }),
  );

  return [...pages, ...blog.flat()];
}
