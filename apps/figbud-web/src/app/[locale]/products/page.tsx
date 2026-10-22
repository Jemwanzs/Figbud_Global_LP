import { publicProducts } from "@figbud/brand";
import { localizePath } from "@figbud/i18n";
import { Container, Reveal, StatusBadge, buttonClasses } from "@figbud/ui";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { PageHeader } from "@/components/page-header";
import { ProductGlyph } from "@/components/product-glyph";
import { fill } from "@/lib/format";
import { resolvePage } from "@/lib/page";
import { pageMetadata, productLink, routes } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.products;
  return pageMetadata({ locale, path: routes.products, title: page.title, description: page.description });
}

export default async function ProductsPage({ params }: PageProps<"/[locale]/products">) {
  const { locale, dict } = await resolvePage(params);
  const { common } = dict;

  return (
    <>
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
      <Container size="wide" className="py-16 sm:py-20 lg:py-24">
        <ul className="space-y-6 lg:space-y-8">
          {publicProducts.map((product, i) => {
            const copy = dict.products[product.slug];
            const link = productLink(product.slug, locale);
            const comingSoon = product.status === "coming_soon";
            const enquiry = `${localizePath(locale, routes.contact)}?kind=${comingSoon ? "waitlist" : "demo_request"}&product=${product.slug}`;
            return (
              <li key={product.slug} id={product.slug} data-product={product.slug} className="scroll-mt-28">
                <Reveal
                  delay={i * 0.05}
                  className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-10 lg:p-12"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute end-[-8%] -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)] blur-2xl"
                  />
                  <div className="relative grid gap-10 lg:grid-cols-12">
                    <div className="lg:col-span-6">
                      <div className="flex flex-wrap items-center gap-4">
                        <ProductGlyph slug={product.slug} size="lg" />
                        <div>
                          <h2 className="text-2xl font-semibold tracking-tight text-text sm:text-3xl">
                            {product.name}
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
    </>
  );
}
