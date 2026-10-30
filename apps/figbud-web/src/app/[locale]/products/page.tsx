import type { Product, ProductSlug } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import { Container, Eyebrow, Reveal, StatusBadge, buttonClasses } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import {
  BrandLogo,
  JsonLd,
  ProductIdentity,
  ProductMark,
  hasLogo,
  organizationLd,
  softwareApplicationLd,
} from "@figbud/site-kit";
import { fill } from "@/lib/format";
import { getBrands, getPublicProducts } from "@/lib/products";
import { resolvePage } from "@/lib/page";
import { pageMetadata, productLink, routes, siteOrigin } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.products;
  return pageMetadata({ locale, path: routes.products, title: page.title, description: page.description });
}

export default async function ProductsPage({ params }: PageProps<"/[locale]/products">) {
  const { locale, dict } = await resolvePage(params);
  const { common } = dict;
  const page = dict.pages.products;
  const [products, brands] = await Promise.all([getPublicProducts(), getBrands()]);
  const statusOf = (slug: ProductSlug) => products.find((p) => p.slug === slug)!.status;

  // Each product as a web application, from what this page shows (no offers or ratings).
  const structured = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((product, i) => {
      const link = productLink(product.slug, locale, product.status);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: softwareApplicationLd({
          name: product.name,
          description: dict.products[product.slug].summary,
          url: link.external ? link.href : `${siteOrigin}${link.href}`,
          publisher: organizationLd(siteOrigin),
        }),
      };
    }),
  };

  return (
    <>
      <JsonLd data={structured} />
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            locale={locale}
            label={common.breadcrumb}
            items={[
              { label: common.nav.home, path: routes.home },
              { label: common.nav.products, path: routes.products },
            ]}
          />
        }
        eyebrow={common.productsMenu.title}
        title={dict.pages.products.title}
        lead={dict.pages.products.lead}
      />
      <Container size="wide" className="py-section-sm">
        <ul className="space-y-6 lg:space-y-8">
          {products.map((product, i) => {
            const copy = dict.products[product.slug];
            const link = productLink(product.slug, locale, product.status);
            const comingSoon = product.status === "coming_soon";
            const enquiry = enquiryHref(locale, product);
            return (
              <li key={product.slug} id={product.slug} data-product={product.slug} className="scroll-mt-28">
                <Reveal
                  delay={i * 0.05}
                  className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-10 lg:p-12"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute end-[-8%] -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
                  />
                  <div className="relative grid gap-10 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                      <div className="flex flex-wrap items-center gap-4">
                        {!hasLogo(brands[product.slug]?.logos.horizontal) && (
                          <ProductMark slug={product.slug} brand={brands[product.slug]} size="lg" />
                        )}
                        <div>
                          <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
                            <BrandLogo
                              pair={brands[product.slug]?.logos.horizontal}
                              height={52}
                              maxWidth={220}
                              alt={product.name}
                              fallback={product.name}
                            />
                          </h2>
                          <p className="text-sm text-product-text">{copy.category}</p>
                        </div>
                        <StatusBadge
                          status={product.status}
                          label={common.status[product.status]}
                          className="ms-auto self-start"
                        />
                      </div>
                      <p className="mt-8 font-display text-title font-medium text-text">{copy.tagline}</p>
                      <p className="mt-4 max-w-xl leading-relaxed text-muted">{copy.summary}</p>
                    </div>
                    <div className="flex flex-col lg:col-span-6 lg:ps-8">
                      <ul className="space-y-3.5 lg:pt-2">
                        {copy.highlights.map((item) => (
                          <li key={item} className="flex items-start gap-3 text-text">
                            <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-product-soft text-product-text">
                              <Check aria-hidden className="size-3" strokeWidth={3} />
                            </span>
                            {item}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:mt-auto lg:pt-10">
                        <Link
                          href={enquiry}
                          className={buttonClasses(comingSoon ? "secondary" : "product", "lg")}
                        >
                          {comingSoon ? common.cta.joinWaitlist : common.cta.requestDemo}
                          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                        </Link>
                        {link.external && (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener"
                            className={buttonClasses("secondary", "lg")}
                          >
                            {fill(common.cta.visitSite, { product: product.name })}
                            <ArrowUpRight aria-hidden className="size-4" />
                            <span className="sr-only">({common.opensInNewTab})</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </Container>

      <Container size="wide" className="pb-section">
        <Reveal>
          <h2 className="font-display text-title font-semibold text-text">{page.compare.title}</h2>
          <p className="mt-3 max-w-2xl text-muted">{page.compare.lead}</p>
          {/* Phones: one card per product. Wider screens: a side-by-side table. */}
          <ul className="mt-8 space-y-4 md:hidden">
            {products.map((product) => {
              const copy = dict.products[product.slug];
              const comingSoon = product.status === "coming_soon";
              return (
                <li
                  key={product.slug}
                  data-product={product.slug}
                  className="rounded-[var(--radius-panel)] border border-line bg-surface p-5"
                >
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-text">
                      <ProductIdentity slug={product.slug} brand={brands[product.slug]} name={product.name} />
                    </h3>
                    <StatusBadge
                      status={product.status}
                      label={common.status[product.status]}
                      className="ms-auto"
                    />
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-subtle">{page.compare.rows.category}</dt>
                      <dd className="mt-0.5 text-text">{copy.category}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">{page.compare.rows.summary}</dt>
                      <dd className="mt-0.5 leading-relaxed text-muted">{copy.summary}</dd>
                    </div>
                  </dl>
                  <Link
                    href={enquiryHref(locale, product)}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                  >
                    {comingSoon ? common.cta.joinWaitlist : common.cta.requestDemo}
                    <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div
            className="mt-8 hidden overflow-x-auto rounded-[var(--radius-panel)] border border-line bg-surface md:block"
            tabIndex={0}
            role="region"
            aria-label={page.compare.caption}
          >
            <table className="w-full border-collapse text-start text-sm sm:text-[0.95rem]">
              <caption className="sr-only">{page.compare.caption}</caption>
              <thead>
                <tr className="border-b border-line">
                  <td className="w-40 p-4 sm:p-5" />
                  {products.map((product) => (
                    <th
                      key={product.slug}
                      scope="col"
                      data-product={product.slug}
                      className="p-4 text-start font-semibold text-text sm:p-5"
                    >
                      <ProductIdentity slug={product.slug} brand={brands[product.slug]} name={product.name} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow products={products} label={page.compare.rows.category}>
                  {(slug) => dict.products[slug].category}
                </CompareRow>
                <CompareRow products={products} label={page.compare.rows.summary}>
                  {(slug) => <span className="text-muted">{dict.products[slug].summary}</span>}
                </CompareRow>
                <CompareRow products={products} label={page.compare.rows.status}>
                  {(slug) => {
                    const status = statusOf(slug);
                    return <StatusBadge status={status} label={common.status[status]} />;
                  }}
                </CompareRow>
                <CompareRow products={products} label={page.compare.rows.next}>
                  {(slug) => {
                    const comingSoon = statusOf(slug) === "coming_soon";
                    return (
                      <Link
                        href={enquiryHref(locale, { slug, status: statusOf(slug) })}
                        className="inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline"
                      >
                        {comingSoon ? common.cta.joinWaitlist : common.cta.requestDemo}
                        <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
                      </Link>
                    );
                  }}
                </CompareRow>
              </tbody>
            </table>
          </div>
        </Reveal>

        <Reveal className="mt-12 rounded-[var(--radius-panel)] border border-dashed border-line-strong p-6 sm:mt-16 sm:p-10 lg:p-12">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-8">
              <Eyebrow>{page.future.eyebrow}</Eyebrow>
              <h2 className="mt-4 font-display text-title font-semibold text-text">{page.future.title}</h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-muted">{page.future.body}</p>
            </div>
            <div className="lg:col-span-4 lg:text-end">
              <Link
                href={`${localizePath(locale, routes.contact)}?kind=partnership`}
                className={buttonClasses("secondary", "lg")}
              >
                {page.future.cta}
                <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </Reveal>
      </Container>
    </>
  );
}

/** The pre-filled enquiry form: a waitlist for coming-soon products, otherwise a demo request. */
function enquiryHref(locale: Locale, { slug, status }: Pick<Product, "slug" | "status">): string {
  const kind = status === "coming_soon" ? "waitlist" : "demo_request";
  return `${localizePath(locale, routes.contact)}?kind=${kind}&product=${slug}`;
}

function CompareRow({
  products,
  label,
  children,
}: {
  products: Product[];
  label: string;
  children: (slug: ProductSlug) => ReactNode;
}) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <th scope="row" className="p-4 text-start align-top font-medium text-subtle sm:p-5">
        {label}
      </th>
      {products.map((product) => (
        <td key={product.slug} data-product={product.slug} className="p-4 align-top text-text sm:p-5">
          {children(product.slug)}
        </td>
      ))}
    </tr>
  );
}
