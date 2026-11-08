import type { Product } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";

import type { Dictionary } from "@/i18n/get-dictionary";

import { productLink, routes } from "./site";

/*
 * Site search (P3-12): the corporate website's pages and products, from the
 * same dictionaries and registry the pages are built from, so results always
 * match what's on the page in the visitor's language. Articles come from the
 * API's full-text search, as on the blog. Pages still in progress (privacy
 * and terms, until counsel's text is published) are left out.
 */

export type SearchEntry = {
  title: string;
  description: string;
  href: string;
  external?: boolean;
  /** Further words the page is about, searched but not shown. */
  text: string;
};

/** Lower case without accents, so "équipe" finds "equipe" and the reverse. */
export function normalise(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * Entries containing every word of the query, best first: a word in the title
 * counts most, then the description, then the rest of the page's words.
 */
export function searchEntries(entries: SearchEntry[], query: string): SearchEntry[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return entries
    .map((entry) => {
      const title = normalise(entry.title);
      const description = normalise(entry.description);
      const text = normalise(entry.text);
      let score = 0;
      for (const word of words) {
        const points =
          (title.includes(word) ? 3 : 0) +
          (description.includes(word) ? 2 : 0) +
          (text.includes(word) ? 1 : 0);
        if (!points) return null;
        score += points;
      }
      return { entry, score };
    })
    .filter((hit): hit is { entry: SearchEntry; score: number } => !!hit)
    .sort((a, b) => b.score - a.score)
    .map((hit) => hit.entry);
}

/** The corporate website's searchable pages and products, in this locale. */
export function siteEntries(locale: Locale, dict: Dictionary, products: Product[]): SearchEntry[] {
  const pages = dict.pages;
  const home = dict.home;
  const page = (path: string, title: string, description: string, ...text: string[]): SearchEntry => ({
    title,
    description,
    href: localizePath(locale, path),
    text: text.join(" "),
  });
  return [
    page(
      routes.home,
      dict.common.nav.home,
      dict.meta.description,
      home.hero.titleLead,
      home.hero.titleAccent,
      home.hero.lead,
      home.philosophy.title,
      ...home.philosophy.items.flatMap((i) => [i.title, i.body]),
      home.africa.title,
      home.africa.lead,
      home.engineer.title,
      home.engineer.lead,
    ),
    page(routes.products, pages.products.title, pages.products.description, pages.products.lead),
    page(routes.about, pages.about.title, pages.about.description, pages.about.lead),
    page(routes.blog, pages.blog.title, pages.blog.description, pages.blog.lead),
    page(routes.contact, pages.contact.title, pages.contact.description, pages.contact.lead),
    page(routes.cookies, pages.cookies.title, pages.cookies.description),
    ...products.map((product) => {
      const copy = dict.products[product.slug];
      const link = productLink(product.slug, locale, product.status);
      return {
        title: product.name,
        description: copy.summary,
        href: link.href,
        external: link.external,
        text: [copy.category, copy.tagline, ...copy.highlights].join(" "),
      };
    }),
  ];
}
