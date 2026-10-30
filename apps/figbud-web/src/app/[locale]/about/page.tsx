import type { ProductSlug } from "@figbud/brand";
import { localizePath } from "@figbud/i18n";
import { BrandLogo, PageBlocks, ProductMark, hasLogo } from "@figbud/site-kit";
import { Container, Eyebrow, Reveal, StatusBadge } from "@figbud/ui";
import { ArrowRight, Calculator, Cable, ChartSpline, MapPin, ShieldCheck, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { FinalCtaSection } from "@/components/home/sections";
import { PageHeader } from "@/components/page-header";
import { getCorporatePage, localizedHrefs } from "@/lib/corporate-pages";
import { fill } from "@/lib/format";
import { resolvePage } from "@/lib/page";
import { getBrands, getPublicProducts } from "@/lib/products";
import { pageMetadata, productLink, routes } from "@/lib/site";

const ENGINEER_ICONS = {
  workflow: Workflow,
  finance: Calculator,
  integrations: Cable,
  security: ShieldCheck,
  analytics: ChartSpline,
} as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const { locale, dict } = await resolvePage(params);
  const page = dict.pages.about;
  const studio = await getCorporatePage("about");
  return pageMetadata({
    locale,
    path: routes.about,
    title: studio?.seo_title || page.title,
    description: studio?.seo_description || page.description,
    published: !studio?.seo_noindex,
  });
}

/**
 * About Us. A version published in the Studio (Websites → FigBud Global →
 * Pages → About Us) replaces the built-in page, which is composed only of
 * approved copy: the company statement, philosophy, engineering, products
 * from the registry and the Nairobi starting point.
 */
export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  const { locale, dict } = await resolvePage(params);
  const { common } = dict;
  const page = dict.pages.about;
  const home = dict.home;
  const [studio, products, brands] = await Promise.all([
    getCorporatePage("about"),
    getPublicProducts(),
    getBrands(),
  ]);
  const header = (
    <PageHeader
      breadcrumbs={
        <Breadcrumbs
          locale={locale}
          label={common.breadcrumb}
          items={[
            { label: common.nav.home, path: routes.home },
            { label: page.title, path: routes.about },
          ]}
        />
      }
      eyebrow={page.slogan}
      title={studio?.title ?? page.title}
      lead={studio ? undefined : page.lead}
    />
  );

  if (studio)
    return (
      <>
        {header}
        <Container size="wide" className="py-section-sm">
          <PageBlocks document={studio} firstHeading={2} resolveHref={localizedHrefs(locale)} />
        </Container>
        <FinalCtaSection locale={locale} dict={dict} />
      </>
    );

  return (
    <>
      {header}

      {/* Who we are */}
      <section aria-labelledby="about-who" className="py-section">
        <Container size="wide" className="grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-16">
          <Reveal className="lg:col-span-7">
            <Eyebrow>{page.whoEyebrow}</Eyebrow>
            <h2
              id="about-who"
              className="mt-4 font-display text-headline font-semibold text-balance text-text"
            >
              {home.company.title}
            </h2>
            <p className="mt-5 max-w-2xl text-lead text-muted">{home.company.body}</p>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-5">
            <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8">
              <div
                aria-hidden
                className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(closest-side,var(--glow),transparent)]"
              />
              <p className="relative flex items-center gap-2 text-sm text-muted">
                <MapPin aria-hidden className="size-4 text-accent" />
                {home.africa.startingPointLabel}
              </p>
              <p className="relative mt-2 font-display text-title font-semibold text-text">
                {home.africa.startingPoint}
              </p>
              <p className="relative mt-1 text-muted">{home.africa.originTagline}</p>
              <dl className="relative mt-6 divide-y divide-line border-t border-line">
                {home.africa.facts.map((fact) => (
                  <div key={fact.label} className="grid gap-1 py-3 sm:grid-cols-[7rem_1fr] sm:gap-4">
                    <dt className="text-sm text-subtle">{fact.label}</dt>
                    <dd className="text-sm text-text">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </Container>
      </section>

      {/* What we believe */}
      <section aria-labelledby="about-belief" className="border-y border-line bg-bg-elevated/50 py-section">
        <Container size="wide">
          <Reveal>
            <Eyebrow>{page.beliefEyebrow}</Eyebrow>
            <h2
              id="about-belief"
              className="mt-4 max-w-3xl font-display text-headline font-semibold text-balance text-text"
            >
              {home.philosophy.title}
            </h2>
          </Reveal>
          <ol className="mt-stack grid gap-4 md:grid-cols-3 md:gap-5">
            {home.philosophy.items.map((item, i) => (
              <li key={item.title}>
                <Reveal
                  delay={i * 0.06}
                  className="h-full rounded-[var(--radius-card)] border border-line bg-surface p-6 sm:p-7"
                >
                  <span className="font-mono text-sm text-accent">0{i + 1}</span>
                  <h3 className="mt-3 font-display text-title font-medium text-text">{item.title}</h3>
                  <p className="mt-3 leading-7 text-muted">{item.body}</p>
                </Reveal>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* What we build */}
      <section aria-labelledby="about-build" className="py-section">
        <Container size="wide">
          <Reveal>
            <Eyebrow>{page.buildEyebrow}</Eyebrow>
            <h2
              id="about-build"
              className="mt-4 max-w-3xl font-display text-headline font-semibold text-balance text-text"
            >
              {page.buildTitle}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-muted">{page.buildLead}</p>
          </Reveal>
          <ul className="mt-stack grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {products.map((product, i) => {
              const slug = product.slug as ProductSlug;
              const brand = brands[slug];
              const copy = dict.products[slug];
              const link = productLink(slug, locale, product.status);
              return (
                <li key={slug} data-product={slug}>
                  <Reveal delay={i * 0.05} className="h-full">
                    <Link
                      href={link.href}
                      className="group flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface p-6 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        {hasLogo(brand?.logos.horizontal) ? (
                          <BrandLogo
                            pair={brand?.logos.horizontal}
                            height={36}
                            maxWidth={150}
                            alt={product.name}
                            fallback={product.name}
                          />
                        ) : (
                          <span className="flex items-center gap-3">
                            <ProductMark slug={slug} brand={brand} />
                            <span className="font-semibold text-text">{product.name}</span>
                          </span>
                        )}
                        <StatusBadge status={product.status} label={common.status[product.status]} />
                      </div>
                      <p className="mt-4 text-sm text-product-text">{copy.category}</p>
                      <p className="mt-2 leading-7 text-muted">{copy.summary}</p>
                      <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-text">
                        {fill(page.productLink, { product: product.name })}
                        <ArrowRight
                          aria-hidden
                          className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                        />
                      </span>
                    </Link>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* How we engineer */}
      <section aria-labelledby="about-engineer" className="border-t border-line py-section">
        <Container size="wide">
          <Reveal>
            <Eyebrow>{home.engineer.eyebrow}</Eyebrow>
            <h2
              id="about-engineer"
              className="mt-4 max-w-3xl font-display text-headline font-semibold text-balance text-text"
            >
              {home.engineer.title}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-muted">{home.engineer.lead}</p>
          </Reveal>
          <ul className="mt-stack grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {home.engineer.items.map((item, i) => {
              const Icon = ENGINEER_ICONS[item.key as keyof typeof ENGINEER_ICONS];
              return (
                <li key={item.key}>
                  <Reveal
                    delay={i * 0.05}
                    className="h-full rounded-[var(--radius-card)] border border-line bg-surface p-5"
                  >
                    <span className="inline-flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                      <Icon aria-hidden className="size-5" />
                    </span>
                    <h3 className="mt-4 font-semibold text-text">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                  </Reveal>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* Where we are going */}
      <section aria-labelledby="about-markets" className="border-t border-line py-section">
        <Container size="wide" className="grid gap-8 lg:grid-cols-12 lg:items-end">
          <Reveal className="lg:col-span-8">
            <Eyebrow>{home.africa.eyebrow}</Eyebrow>
            <h2
              id="about-markets"
              className="mt-4 font-display text-headline font-semibold text-balance text-text"
            >
              {home.africa.title}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-muted">{home.africa.lead}</p>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-4 lg:text-end">
            <Link
              href={`${localizePath(locale, routes.home)}#platforms`}
              className="inline-flex min-h-11 items-center gap-2 font-medium text-accent"
            >
              {common.cta.exploreProducts}
              <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
            </Link>
          </Reveal>
        </Container>
      </section>

      <FinalCtaSection locale={locale} dict={dict} />
    </>
  );
}
