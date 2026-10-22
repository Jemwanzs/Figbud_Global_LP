import { type ProductSlug, getProduct } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";

/**
 * Links between the FigBud corporate site and the product websites (P4-02).
 * Origins come from the environment, so nothing assumes a provisioned domain.
 * `NEXT_PUBLIC_*` variables are referenced literally so Next.js inlines them.
 */
const strip = (origin: string) => origin.replace(/\/$/, "");

/** The corporate site: "Back to FigBud Global", enquiries, legal pages. */
export const figbudOrigin = strip(process.env.NEXT_PUBLIC_FIGBUD_URL ?? "http://localhost:3000");

const productOrigins: Record<ProductSlug, string | undefined> = {
  zirahr: process.env.NEXT_PUBLIC_ZIRAHR_URL,
  jasiri: process.env.NEXT_PUBLIC_JASIRI_URL,
  expense_now: process.env.NEXT_PUBLIC_EXPENSE_NOW_URL,
};

export interface CrossLink {
  href: string;
  /** Another website: opens in a new tab with `rel="noopener"`. */
  external: boolean;
}

/** A page on the corporate site, in the visitor's language. */
export function figbudLink(locale: Locale, path = "/"): CrossLink {
  return { href: `${figbudOrigin}${localizePath(locale, path)}`, external: true };
}

/**
 * A product's website when deployed; otherwise its section on the corporate
 * Products page, so a link is never dead.
 */
export function productSiteLink(slug: ProductSlug, locale: Locale): CrossLink {
  const origin = productOrigins[slug];
  if (origin) return { href: `${strip(origin)}/${locale}`, external: true };
  return { href: `${figbudOrigin}${localizePath(locale, "/products")}#${slug}`, external: true };
}

/**
 * The corporate enquiry form, prefilled: a demo request for active products,
 * the waitlist for coming-soon ones. One form, one API, one inbox.
 */
export function enquiryLink(slug: ProductSlug, locale: Locale): CrossLink {
  const kind = getProduct(slug).status === "coming_soon" ? "waitlist" : "demo_request";
  return {
    href: `${figbudOrigin}${localizePath(locale, "/contact")}?kind=${kind}&product=${slug}`,
    external: true,
  };
}

/** Anchor attributes for a cross-site link. */
export function linkProps(link: CrossLink): { href: string; target?: string; rel?: string } {
  return link.external ? { href: link.href, target: "_blank", rel: "noopener" } : { href: link.href };
}
