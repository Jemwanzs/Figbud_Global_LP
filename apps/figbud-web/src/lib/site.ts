import { type ProductSlug, getProduct, type ProductStatus } from "@figbud/brand";
import { type Locale, hreflangAlternates, isIndexable, localizePath } from "@figbud/i18n";
import type { Metadata } from "next";

/**
 * Deployment-specific values come from the environment. Defaults target
 * local development; nothing here assumes a provisioned production domain.
 *
 * `NEXT_PUBLIC_*` variables must be referenced literally so Next.js can
 * inline them at build time.
 */
export const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const apiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(/\/$/, "");

/** Search engines may index only when explicitly enabled (production). */
export const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

const productOrigins: Record<ProductSlug, string | undefined> = {
  zirahr: process.env.NEXT_PUBLIC_ZIRAHR_URL,
  jasiri: process.env.NEXT_PUBLIC_JASIRI_URL,
  expense_now: process.env.NEXT_PUBLIC_EXPENSE_NOW_URL,
  ziwa: process.env.NEXT_PUBLIC_ZIWA_URL,
};

/**
 * Where a website is served today (its Railway or custom URL), if anywhere:
 * the corporate site's own origin, or a product site's configured origin.
 */
export function websiteOrigin(slug: string): string | undefined {
  if (slug === "figbud") return siteOrigin;
  return (productOrigins as Record<string, string | undefined>)[slug]?.replace(/\/$/, "");
}

export interface ProductLink {
  href: string;
  /** External product websites open in a new tab. */
  external: boolean;
}

/**
 * Where a product's primary CTA leads.
 * - Coming-soon products: the waitlist form.
 * - Active products with a configured website: that site, in a new tab.
 * - Otherwise (product site not yet deployed): the product's section on the
 *   corporate Products page, so no link is ever dead.
 */
/** Where a product links to; pass the registry status when the page has it (lib/products). */
export function productLink(
  slug: ProductSlug,
  locale: Locale,
  status: ProductStatus = getProduct(slug).status,
): ProductLink {
  if (status === "coming_soon") {
    return {
      href: `${localizePath(locale, "/contact")}?kind=waitlist&product=${slug}`,
      external: false,
    };
  }
  const origin = productOrigins[slug];
  if (origin) return { href: `${origin.replace(/\/$/, "")}/${locale}`, external: true };
  return { href: `${localizePath(locale, "/products")}#${slug}`, external: false };
}

export const routes = {
  home: "/",
  products: "/products",
  about: "/about",
  blog: "/blog",
  contact: "/contact",
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  cookies: "/legal/cookies",
} as const;

/** Paths listed in the sitemap. Pages still in progress stay out until published. */
export const publishedPaths: string[] = [routes.home, routes.products, routes.contact];

/**
 * Canonical, hreflang and robots metadata for a locale-agnostic path.
 * Draft locales and unpublished pages are rendered but never indexed.
 */
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
  const indexable = allowIndexing && published && isIndexable(locale);
  const url = `${siteOrigin}${localizePath(locale, path)}`;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: {
      canonical: url,
      languages: published ? hreflangAlternates(siteOrigin, path) : undefined,
    },
    openGraph: {
      url,
      ...(title ? { title } : {}),
      description,
    },
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}
