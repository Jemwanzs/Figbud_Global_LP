import { type Locale, isIndexable, localizePath } from "@figbud/i18n";
import type { Metadata } from "next";

import en, { type Dictionary } from "@/i18n/en";

export const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** Search engines may index only when explicitly enabled (production). */
export const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

/** Reviewed translations join this table (Q6); until then other locales render English, marked `lang="en"`. */
const dictionaries: Partial<Record<Locale, Dictionary>> = { en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? en;
}

/** Canonical and robots metadata. Only reviewed English, published pages are indexed. */
export function pageMetadata({
  locale,
  path,
  title,
  description,
  published = true,
}: {
  locale: Locale;
  path: string;
  title?: string;
  description: string;
  published?: boolean;
}): Metadata {
  const url = `${siteOrigin}${localizePath(locale, path)}`;
  const indexable = allowIndexing && published && isIndexable(locale);
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: url },
    openGraph: { url, ...(title ? { title } : {}), description },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}
