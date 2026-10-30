import { type ProductSlug, getProduct, productSites, publicProducts } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import { FigBudWordmark } from "@figbud/ui";
import { cacheLife } from "next/cache";
import Link from "next/link";

import { figbudLink, linkProps, productSiteLink } from "./cross-site";
import type { BrandProfile } from "./brand";
import { ProductIdentity } from "./brand-logo";

export interface ProductFooterLabels {
  nav: Record<string, string>;
  tagline: string;
  explore: string;
  ecosystem: string;
  company: string;
  about: string;
  contact: string;
  privacy: string;
  terms: string;
  /** e.g. "{product} is a FigBud Global platform." */
  partOf: string;
  opensInNewTab: string;
}

/** The current year, cached so footers stay part of the static shell. */
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/** Footer shared by every product website: its pages, sibling products, the parent company. */
export async function ProductFooter({
  slug,
  locale,
  labels,
  brand,
}: {
  slug: ProductSlug;
  locale: Locale;
  labels: ProductFooterLabels;
  brand?: BrandProfile | null;
}) {
  const product = getProduct(slug);
  const year = await currentYear();
  const external = (path: string) => linkProps(figbudLink(locale, path));
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[92rem] gap-10 px-5 py-section-sm sm:px-8 md:px-10 lg:grid-cols-12 lg:px-16">
        <div className="lg:col-span-4">
          <ProductIdentity
            slug={slug}
            brand={brand}
            name={product.name}
            maxWidth={140}
            nameClassName="text-lg font-semibold text-text"
          />
          <p className="mt-4 max-w-sm leading-relaxed text-muted">{labels.tagline}</p>
        </div>
        <nav aria-label={labels.explore} className="lg:col-span-3">
          <h2 className="text-sm font-medium text-text">{labels.explore}</h2>
          <ul className="mt-4 space-y-1">
            {productSites[slug].nav.map((item) => (
              <li key={item.key}>
                <Link
                  href={localizePath(locale, item.path)}
                  className="inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-text"
                >
                  {labels.nav[item.key]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={labels.ecosystem} className="lg:col-span-2">
          <h2 className="text-sm font-medium text-text">{labels.ecosystem}</h2>
          <ul className="mt-4 space-y-1">
            {publicProducts
              .filter((p) => p.slug !== slug)
              .map((p) => (
                <li key={p.slug}>
                  <a
                    {...linkProps(productSiteLink(p.slug, locale))}
                    className="inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-text"
                  >
                    {p.name}
                    <span className="sr-only"> ({labels.opensInNewTab})</span>
                  </a>
                </li>
              ))}
          </ul>
        </nav>
        <nav aria-label={labels.company} className="lg:col-span-3">
          <h2 className="text-sm font-medium text-text">{labels.company}</h2>
          <ul className="mt-4 space-y-1">
            {[
              [labels.about, "/about"],
              [labels.contact, "/contact"],
              [labels.privacy, "/legal/privacy"],
              [labels.terms, "/legal/terms"],
            ].map(([label, path]) => (
              <li key={path}>
                <a
                  {...external(path!)}
                  className="inline-flex min-h-10 items-center text-sm text-muted transition-colors hover:text-text"
                >
                  {label}
                  <span className="sr-only"> ({labels.opensInNewTab})</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[92rem] flex-col gap-4 px-5 py-6 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:px-8 md:px-10 lg:px-16">
          <a {...external("/")} className="inline-flex items-center gap-3 rounded-lg">
            <FigBudWordmark />
            <span className="sr-only">({labels.opensInNewTab})</span>
          </a>
          <p>
            {labels.partOf.replace("{product}", product.name)} © {year}
          </p>
        </div>
      </div>
    </footer>
  );
}
