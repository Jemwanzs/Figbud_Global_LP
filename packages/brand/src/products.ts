/**
 * The FigBud product registry — the single source of truth for which
 * products exist, their lifecycle status and where their websites live.
 *
 * Adding a future product means adding an entry here (plus its copy in each
 * site's dictionaries); listing pages, navigation and sitemaps pick it up.
 */

export type ProductSlug = "zirahr" | "jasiri" | "expense_now";

/**
 * - `active`: generally available; links to its product website.
 * - `coming_soon`: announced; offers a waitlist, never a live-product CTA.
 * - `planned`: internal roadmap only; not shown publicly.
 */
export type ProductStatus = "active" | "coming_soon" | "planned";

export interface Product {
  slug: ProductSlug;
  name: string;
  status: ProductStatus;
  /** Proposed production origin. Not yet provisioned — see docs/ROADMAP.md. */
  proposedOrigin: string;
  /** Local port of the product's own Next.js app (Phase 4). */
  devPort: number;
  /** Environment variable that overrides the product website origin. */
  originEnv: string;
}

export const products: readonly Product[] = [
  {
    slug: "zirahr",
    name: "ZiraHR",
    status: "active",
    proposedOrigin: "https://zirahr.figbudglobal.com",
    devPort: 3001,
    originEnv: "NEXT_PUBLIC_ZIRAHR_URL",
  },
  {
    slug: "jasiri",
    name: "Jasiri LMS",
    status: "active",
    proposedOrigin: "https://jasiri.figbudglobal.com",
    devPort: 3002,
    originEnv: "NEXT_PUBLIC_JASIRI_URL",
  },
  {
    slug: "expense_now",
    name: "Expense Now",
    status: "coming_soon",
    proposedOrigin: "https://expense.figbudglobal.com",
    devPort: 3003,
    originEnv: "NEXT_PUBLIC_EXPENSE_NOW_URL",
  },
];

export const publicProducts = products.filter((p) => p.status !== "planned");

export function getProduct(slug: ProductSlug): Product {
  const product = products.find((p) => p.slug === slug);
  if (!product) throw new Error(`Unknown product: ${slug}`);
  return product;
}
