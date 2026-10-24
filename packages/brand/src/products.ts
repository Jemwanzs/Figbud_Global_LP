/**
 * The FigBud product registry — the single source of truth for which
 * products exist, their lifecycle status and where their websites live.
 *
 * Adding a future product means adding an entry here (plus its copy in each
 * site's dictionaries); listing pages, navigation and sitemaps pick it up.
 */

export type ProductSlug = "zirahr" | "jasiri" | "expense_now" | "ziwa";

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
  {
    // Second lending product on the shared lending website foundation (docs/PRODUCT_REGISTRY.md).
    slug: "ziwa",
    name: "Ziwa LMS",
    status: "coming_soon",
    proposedOrigin: "https://ziwa.figbudglobal.com",
    devPort: 3004,
    originEnv: "NEXT_PUBLIC_ZIWA_URL",
  },
];

export const publicProducts = products.filter((p) => p.status !== "planned");

export function getProduct(slug: ProductSlug): Product {
  const product = products.find((p) => p.slug === slug);
  if (!product) throw new Error(`Unknown product: ${slug}`);
  return product;
}

/** One entry in a product website's navigation; labels live in each site's dictionary. */
export interface ProductNavItem {
  key: string;
  path: string;
  /** Shown in the header; the rest appear in the footer and mobile menu. */
  primary?: boolean;
}

/**
 * Information architecture of each product website (brief §3.3–3.5). The
 * primary call to action is derived from the product status: active products
 * offer a demo, coming-soon products a waitlist.
 */
export const productSites: Record<ProductSlug, { nav: ProductNavItem[] }> = {
  zirahr: {
    nav: [
      { key: "platform", path: "/platform", primary: true },
      { key: "modules", path: "/modules", primary: true },
      { key: "solutions", path: "/solutions", primary: true },
      { key: "payrollCalculator", path: "/payroll-calculator", primary: true },
      { key: "resources", path: "/resources" },
      { key: "pricing", path: "/pricing", primary: true },
      { key: "company", path: "/company" },
    ],
  },
  jasiri: {
    nav: [
      { key: "platform", path: "/platform", primary: true },
      { key: "lendingSolutions", path: "/lending-solutions", primary: true },
      { key: "loanOrigination", path: "/loan-origination" },
      { key: "creditRisk", path: "/credit-risk" },
      { key: "loanServicing", path: "/loan-servicing" },
      { key: "collections", path: "/collections", primary: true },
      { key: "analytics", path: "/analytics", primary: true },
      { key: "integrations", path: "/integrations" },
      { key: "security", path: "/security" },
      { key: "resources", path: "/resources" },
    ],
  },
  expense_now: {
    nav: [
      { key: "overview", path: "/", primary: true },
      { key: "capabilities", path: "/capabilities", primary: true },
    ],
  },
  ziwa: {
    nav: [
      { key: "platform", path: "/platform", primary: true },
      { key: "lendingSolutions", path: "/lending-solutions", primary: true },
      { key: "features", path: "/features", primary: true },
      { key: "integrations", path: "/integrations", primary: true },
      { key: "resources", path: "/resources" },
      { key: "contact", path: "/contact" },
    ],
  },
};
