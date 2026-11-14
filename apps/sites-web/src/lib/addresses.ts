import type { ListedSite } from "@figbud/site-kit";

/**
 * How the product-website renderer writes addresses: pure functions, so they
 * are unit-tested (addresses.test.ts) and shared by pages, sitemap and header.
 */

/** Where this app is served while websites share a domain (`/{site}/…` addresses). */
export const rendererOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200").replace(
  /\/$/,
  "",
);

/** The corporate site (enquiries, legal pages, "a FigBud Global platform"). */
export const figbudOrigin = (process.env.NEXT_PUBLIC_FIGBUD_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

export interface PublishedPageRef {
  path: string;
  title: string;
  published_at: string | null;
  /** Listed in the navigation; pages left out stay reachable by address. Absent means listed. */
  show_in_nav?: boolean;
  /** Kept out of search engines (and sitemaps) in the Studio. */
  noindex?: boolean;
  /** It shows the enquiry form (the website's calls to action can stay on it). */
  enquiry_form?: boolean;
  /** Languages it has a published translation in (P7-L2). */
  locales?: string[];
  /** Its title in those languages, where translated from the current English title. */
  titles?: Record<string, string>;
}

/**
 * The `[site]` segment: `ziwa` when served under a path prefix, `~ziwa` when
 * the proxy rewrote a request for the website's own domain (slugs never
 * contain `~`). Decides how links and canonical URLs are written.
 */
export function parseSiteParam(param: string): { slug: string; ownDomain: boolean } {
  const decoded = decodeURIComponent(param);
  return decoded.startsWith("~")
    ? { slug: decoded.slice(1), ownDomain: true }
    : { slug: decoded, ownDomain: false };
}

/**
 * The address of a page on the website: `/ziwa/platform`, or `/platform` on
 * its own domain; in another language, after the website: `/ziwa/sw/platform`
 * (P7-L2b). English, the language every page is written in, has no prefix.
 */
export const pageHref = (slug: string, ownDomain: boolean, path: string, locale?: string) =>
  `${ownDomain ? "" : `/${slug}`}${locale && locale !== "en" ? `/${locale}` : ""}/${path}`.replace(
    /\/$/,
    "",
  ) || "/";

/**
 * The language and page path of an address's segments after the website:
 * a leading language the website shows (other than English) is the language.
 */
export function splitLocale(
  segments: string[],
  languages: readonly string[],
): { locale: string; path: string } {
  const [first, ...rest] = segments;
  return first && first !== "en" && languages.includes(first)
    ? { locale: first, path: rest.join("/") }
    : { locale: "en", path: segments.join("/") };
}

/**
 * A page's addresses for the sitemap: its English address, then its published
 * translations in the languages the website shows (P7-L2b).
 */
export function pageUrls(
  site: Pick<ListedSite, "slug" | "primary_domain">,
  ownDomain: boolean,
  page: Pick<PublishedPageRef, "path" | "locales">,
  shown: readonly string[],
): string[] {
  return [
    canonicalUrl(site, ownDomain, page.path),
    ...(page.locales ?? [])
      .filter((l) => l !== "en" && shown.includes(l))
      .map((l) => canonicalUrl(site, ownDomain, page.path, l)),
  ];
}

/**
 * Where each language's version of a page is: the page itself where it's
 * translated, else that language's home page, else nothing (P7-L2b). English
 * is always the page itself.
 */
export function languageHref(
  slug: string,
  ownDomain: boolean,
  pages: Pick<PublishedPageRef, "path" | "locales">[],
  path: string,
  code: string,
): string | null {
  if (code === "en") return pageHref(slug, ownDomain, path);
  const has = (p: string) => pages.some((page) => page.path === p && page.locales?.includes(code));
  if (has(path)) return pageHref(slug, ownDomain, path, code);
  if (has("")) return pageHref(slug, ownDomain, "", code);
  return null;
}

/** Where a Studio navigation or footer link goes: a page path on this website, or an https:// address. */
export const siteLinkHref = (slug: string, ownDomain: boolean, href: string) =>
  href.startsWith("/") ? pageHref(slug, ownDomain, href.slice(1)) : href;

/** The canonical URL of a page. */
export function canonicalUrl(
  site: Pick<ListedSite, "slug" | "primary_domain">,
  ownDomain: boolean,
  path: string,
  locale?: string,
) {
  if (ownDomain && site.primary_domain)
    return `https://${site.primary_domain}${pageHref(site.slug, true, path, locale)}`.replace(/\/$/, "");
  return `${rendererOrigin}${pageHref(site.slug, false, path, locale)}`;
}

const ENQUIRY_KIND = { waitlist: "waitlist", early_access: "early_access", demo: "demo_request" } as const;
/** Products the corporate enquiry form knows (services/api/src/enquiry.rs). */
const ENQUIRY_PRODUCTS = ["zirahr", "jasiri", "expense_now", "ziwa"];

/**
 * Where this website's call to action goes: its own Contact page, when that page
 * has the enquiry form, so visitors stay on the website (owner, 6 Nov 2026);
 * otherwise the corporate enquiry form (decision D14).
 */
export function enquiryHref(
  site: Pick<ListedSite, "slug" | "cta">,
  local?: { ownDomain: boolean; pages: Pick<PublishedPageRef, "path" | "enquiry_form">[] },
) {
  const kind = ENQUIRY_KIND[site.cta];
  if (local?.pages.some((p) => p.path === "contact" && p.enquiry_form)) {
    return `${pageHref(site.slug, local.ownDomain, "contact")}?kind=${kind}#enquire`;
  }
  const product = ENQUIRY_PRODUCTS.includes(site.slug) ? `&product=${site.slug}` : "";
  return `${figbudOrigin}/en/contact?kind=${kind}${product}`;
}

/**
 * Block links on this website: published pages get the right prefix;
 * `/enquire` (the templates' calls to action) always goes to the corporate
 * enquiry form, and so does `/contact` when there is no contact page;
 * https links stay as they are.
 */
export function hrefResolver(
  site: Pick<ListedSite, "slug" | "cta">,
  ownDomain: boolean,
  pages: Pick<PublishedPageRef, "path" | "enquiry_form" | "locales">[],
  /** On a translated page: links go to pages translated into it, others stay English. */
  locale = "en",
) {
  const published = new Set(pages.map((p) => p.path));
  return (href: string) => {
    if (!href.startsWith("/")) return href;
    // Keep any ?query and #fragment as they are.
    const cut = href.search(/[?#]/);
    const rest = cut === -1 ? "" : href.slice(cut);
    const path = (cut === -1 ? href : href.slice(0, cut)).replace(/^\/+|\/+$/g, "");
    if (path === "enquire" || (path === "contact" && !published.has("contact")))
      return enquiryHref(site, { ownDomain, pages });
    const translated = pages.some((p) => p.path === path && p.locales?.includes(locale));
    return `${pageHref(site.slug, ownDomain, path, translated ? locale : undefined)}${rest}`;
  };
}
