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

/** The address of a page on the website: `/ziwa/platform`, or `/platform` on its own domain. */
export const pageHref = (slug: string, ownDomain: boolean, path: string) =>
  `${ownDomain ? "" : `/${slug}`}/${path}`.replace(/\/$/, "") || "/";

/** Where a Studio navigation or footer link goes: a page path on this website, or an https:// address. */
export const siteLinkHref = (slug: string, ownDomain: boolean, href: string) =>
  href.startsWith("/") ? pageHref(slug, ownDomain, href.slice(1)) : href;

/** The canonical URL of a page. */
export function canonicalUrl(
  site: Pick<ListedSite, "slug" | "primary_domain">,
  ownDomain: boolean,
  path: string,
) {
  if (ownDomain && site.primary_domain) return `https://${site.primary_domain}/${path}`.replace(/\/$/, "");
  return `${rendererOrigin}${pageHref(site.slug, false, path)}`;
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
  pages: Pick<PublishedPageRef, "path" | "enquiry_form">[],
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
    return `${pageHref(site.slug, ownDomain, path)}${rest}`;
  };
}
