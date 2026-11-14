import type { ProductSlug } from "@figbud/brand";
import {
  BrandLogo,
  CampaignSlot,
  LazyComingSoon,
  JsonLd,
  PageBlocks,
  ProductLogo,
  LazyProductHero as ProductHero,
  ProofMetrics,
  LazyPublicPricing,
  Testimonials,
  TrustedBy,
  breadcrumbLd,
  enquiriesOpen,
  faqLd,
  organizationLd,
  softwareApplicationLd,
  websiteLd,
} from "@figbud/site-kit";
import { isEnquiryProduct } from "@figbud/site-kit/enquiry";
import { PayrollSources } from "@figbud/site-kit/payroll-calculator";

/** Products the brand registry knows, whose official marks the pages can show. */
const KNOWN_PRODUCTS: string[] = ["zirahr", "jasiri", "expense_now", "ziwa"];
import { buttonClasses } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";

import { LazyPayrollCalculator as WebsitePayrollCalculator } from "@/components/lazy-payroll-calculator";
import {
  canonicalUrl,
  enquiryHref,
  figbudOrigin,
  getPage,
  getPages,
  getHero,
  getProof,
  getPayrollCalculator,
  getPublicPricing,
  getSite,
  hrefResolver,
  pageHref,
  parseSiteParam,
  publicApiOrigin,
} from "@/lib/sites";

/**
 * Unknown addresses wait for the complete render instead of streaming a
 * generic shell, so a missing page answers with a real 404 status.
 */
export const ensureStatic = "navigation";

/** Placeholder so the route still prerenders before any page is published. */
const PLACEHOLDER = "__none__";
const CTA_LABELS = {
  waitlist: "Join the waitlist",
  early_access: "Request early access",
  demo: "Request a demo",
};

export async function generateStaticParams({ params }: { params: { site: string } }) {
  const paths = (await getPages(params.site)).map((p) => p.path).filter(Boolean);
  return (paths.length ? paths : [PLACEHOLDER]).map((path) => ({ path: path.split("/") }));
}

async function load(params: PageProps<"/[site]/[[...path]]">["params"]) {
  const { site: param, path: segments = [] } = await params;
  const { slug, ownDomain } = parseSiteParam(param);
  const path = segments.join("/");
  const site = await getSite(slug);
  if (!site || path === PLACEHOLDER) return { site, ownDomain, path, page: null };
  return { site, ownDomain, path, page: await getPage(slug, path) };
}

export async function generateMetadata(
  { params }: PageProps<"/[site]/[[...path]]">,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { site, ownDomain, path, page } = await load(params);
  if (!site) return {};
  if (!page && path === "pricing") {
    // Built-in pricing page (no Studio page at /pricing): indexed only while prices are shown.
    const book = await getPublicPricing(site.slug);
    return {
      title: "Pricing",
      description: `${site.name} pricing.`,
      alternates: { canonical: canonicalUrl(site, ownDomain, path) },
      ...(book ? {} : { robots: { index: false, follow: true } }),
    };
  }
  if (!page && path === "payroll-calculator") {
    // Built-in calculator page: only exists while it's switched on in the Studio.
    const calculator = await getPayrollCalculator(site.slug);
    if (!calculator) return {};
    return {
      title: "Kenya payroll calculator: gross to net and net to gross",
      description: `Estimate Kenyan take-home pay in either direction with ${site.name}, with NSSF, SHIF, the Housing Levy and PAYE shown step by step.`,
      alternates: { canonical: canonicalUrl(site, ownDomain, path) },
    };
  }
  if (!page) return path === "" ? { robots: { index: false, follow: true } } : {};
  const canonical = canonicalUrl(site, ownDomain, path);
  const description =
    page.seo_description || site.seo?.default_description || site.description || site.tagline || undefined;
  return {
    title:
      path === ""
        ? { absolute: page.seo_title || `${site.name}${site.tagline ? ` — ${site.tagline}` : ""}` }
        : page.seo_title || page.title,
    description,
    alternates: { canonical },
    // The page's own sharing image from the media library, else the
    // website's (opengraph-image.tsx), which the page's Open Graph details
    // would otherwise replace.
    openGraph: {
      url: canonical,
      title: page.seo_title || page.title,
      description,
      images: page.seo_image
        ? [{ url: `/media/${page.seo_image.id}?w=1440`, alt: page.seo_image.alt }]
        : (await parent).openGraph?.images,
    },
    ...(page.seo_image
      ? { twitter: { card: "summary_large_image", images: [`/media/${page.seo_image.id}?w=1440`] } }
      : {}),
    // Kept out of search engines in the Studio (the page, or the whole website).
    ...(page.seo_noindex || site.seo?.indexing === false ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * The built-in pricing page (P11): published public prices while the website
 * shows them (Studio → Pricing → Publishing; off by default), otherwise a
 * request-a-quote call to action.
 */
async function PricingPage({
  site,
  ownDomain,
}: {
  site: NonNullable<Awaited<ReturnType<typeof getSite>>>;
  ownDomain: boolean;
}) {
  const [book, pages] = await Promise.all([getPublicPricing(site.slug), getPages(site.slug)]);
  const enquire = enquiryHref(site, { ownDomain, pages });
  return (
    <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:px-16">
      <h1 className="font-display text-page font-semibold tracking-tight text-text">{`${site.name} pricing`}</h1>
      {book ? (
        <>
          <p className="mt-4 max-w-2xl text-lead text-muted">
            Three steps to an estimate: choose your modules, set your headcount and billing, and add the
            services you need. Your quotation confirms the figures.
          </p>
          <div className="mt-stack">
            <LazyPublicPricing
              book={book}
              endpoint={pageHref(site.slug, ownDomain, "pricing-calculate")}
              quoteHref={enquire}
              demoHref={enquiryHref({ ...site, cta: "demo" }, { ownDomain, pages })}
            />
          </div>
        </>
      ) : (
        <div className="mt-6 max-w-2xl">
          <p className="text-lead text-muted">
            {`Pricing for ${site.name} depends on your modules, number of employees and implementation needs. Tell us about your organisation and we'll prepare a quotation.`}
          </p>
          <a href={enquire} className={buttonClasses("product", "lg", "mt-8")}>
            Request a quote
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </a>
        </div>
      )}
    </div>
  );
}

async function PayrollCalculatorPage({
  site,
  ownDomain,
}: {
  site: NonNullable<Awaited<ReturnType<typeof getSite>>>;
  ownDomain: boolean;
}) {
  const [calculator, pages] = await Promise.all([getPayrollCalculator(site.slug), getPages(site.slug)]);
  if (!calculator) notFound();
  const enquire = enquiryHref(site, { ownDomain, pages });
  return (
    <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:px-16">
      <JsonLd
        data={breadcrumbLd([
          { name: site.name, url: canonicalUrl(site, ownDomain, "") },
          { name: "Payroll calculator", url: canonicalUrl(site, ownDomain, "payroll-calculator") },
        ])}
      />
      <h1 className="max-w-3xl font-display text-page font-semibold tracking-tight text-text">
        Know the numbers before payday.
      </h1>
      <p className="mt-4 max-w-2xl text-lead text-muted">{calculator.intro}</p>
      <div className="mt-stack">
        <WebsitePayrollCalculator
          calculator={calculator}
          endpoint={pageHref(site.slug, ownDomain, "payroll-calculate")}
        />
      </div>
      <div className="mt-6 max-w-3xl">
        <PayrollSources calculator={calculator} />
      </div>
      <div className="mt-stack flex flex-wrap items-center gap-4">
        <a href={enquire} className={buttonClasses("product", "lg")}>
          {CTA_LABELS[site.cta]}
          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
        </a>
      </div>
    </div>
  );
}

/** Section headings for customer proof on product websites (English, like their pages). */
const PROOF_LABELS = {
  trustedBy: {
    eyebrow: "Trusted by",
    title: "Trusted by teams building what comes next.",
    lead: "Growing alongside ambitious businesses and technology partners.",
    list: "Organisations that work with us",
    pause: "Pause logos",
    play: "Play logos",
  },
  metrics: { eyebrow: "Results", title: "Measured, not estimated.", source: "Source:" },
  testimonials: { eyebrow: "Customers", title: "In our customers' words.", list: "Customer testimonials" },
};

export default async function SitePage({ params }: PageProps<"/[site]/[[...path]]">) {
  const { site, ownDomain, path, page } = await load(params);
  if (!site) notFound();

  if (!page) {
    if (path === "pricing") return <PricingPage site={site} ownDomain={ownDomain} />;
    if (path === "payroll-calculator") return <PayrollCalculatorPage site={site} ownDomain={ownDomain} />;
    // Old addresses of moved pages are forwarded earlier, by the proxy.
    if (path !== "") notFound();
    // Not launched yet: a branded Coming Soon page with a waitlist (owner's instruction, 5 Nov 2026).
    if (site.status !== "active") {
      return (
        <>
          <CampaignSlot placement="home_hero" className="block" />
          <LazyComingSoon
            name={site.name}
            tagline={site.tagline}
            description={site.description}
            status={site.status}
            endpoint={enquiriesOpen(site) ? pageHref(site.slug, ownDomain, "waitlist-submit") : undefined}
            closedMessage={site.settings?.enquiries.closed_message}
            corporateHref={`${figbudOrigin}/en/products`}
            mark={
              <BrandLogo
                pair={site.brand?.logos.symbol}
                height={72}
                maxWidth={140}
                alt=""
                fallback={
                  <span className="font-display text-5xl font-semibold text-product">
                    {site.name.charAt(0)}
                  </span>
                }
              />
            }
          />
        </>
      );
    }
    // Listed and launched, with nothing published yet: an honest holding page from the registry.
    return (
      <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:px-16">
        <CampaignSlot placement="home_hero" className="mb-section-sm block" />
        <div className="max-w-3xl">
          <h1 className="font-display text-display font-semibold tracking-tight text-text">{site.name}</h1>
          {site.tagline && <p className="mt-6 font-display text-title text-text">{site.tagline}</p>}
          {site.description && <p className="mt-4 text-lead text-muted">{site.description}</p>}
          <a href={enquiryHref(site)} className={buttonClasses("product", "lg", "mt-10")}>
            {CTA_LABELS[site.cta]}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </a>
        </div>
      </div>
    );
  }

  const [pages, proof, hero] = await Promise.all([
    getPages(site.slug),
    path === "" ? getProof(site.slug) : null,
    path === "" ? getHero(site.slug) : null,
  ]);
  // A published hero design (Hero Design Studio) replaces the home page's
  // leading hero section; without one, the page renders as built.
  const designed = hero && page.sections[0]?.type === "hero" ? hero : null;
  const blocks = designed ? { ...page, sections: page.sections.slice(1) } : page;
  // Structured data from what the page shows: the product on its home page,
  // breadcrumbs on inner pages, and its questions and answers.
  const home = canonicalUrl(site, ownDomain, "");
  const sameAs = site.seo?.same_as ?? [];
  const structured = [
    ...(path === ""
      ? [
          softwareApplicationLd({
            name: site.name,
            description: page.seo_description || site.description || site.tagline,
            url: home,
            publisher: organizationLd(figbudOrigin),
            sameAs,
          }),
          websiteLd(site.name, home, site.seo?.languages?.[0] ?? "en"),
        ]
      : [
          breadcrumbLd([
            { name: site.name, url: home },
            { name: page.title, url: canonicalUrl(site, ownDomain, path) },
          ]),
        ]),
    faqLd(page),
  ].filter((d) => d !== null);
  return (
    <>
      {designed && (
        <ProductHero
          design={designed.design}
          slug={site.slug}
          name={site.name}
          brand={site.brand ?? null}
          config={designed.config}
          demoHref={enquiryHref(site, { ownDomain, pages })}
          featuresHref={
            pages.some((p) => p.path === "platform")
              ? pageHref(site.slug, ownDomain, "platform")
              : enquiryHref(site, { ownDomain, pages })
          }
        />
      )}
      <div
        data-page-content=""
        className="mx-auto max-w-[92rem] px-5 py-section-sm sm:px-8 md:px-10 lg:px-16"
      >
        <JsonLd data={structured} />
        {path === "" && <CampaignSlot placement="home_hero" className="mb-block block" />}
        <PageBlocks
          document={blocks}
          resolveHref={hrefResolver(site, ownDomain, pages)}
          mark={
            KNOWN_PRODUCTS.includes(site.slug) ? (
              <ProductLogo slug={site.slug as ProductSlug} brand={site.brand} name={site.name} size="sm" />
            ) : undefined
          }
          enquiry={{
            apiOrigin: publicApiOrigin,
            product: isEnquiryProduct(site.slug) ? site.slug : undefined,
            privacyHref: `${figbudOrigin}/en/legal/privacy`,
            config: site.settings?.enquiry_form,
            form: site.slug,
          }}
        />
        {/* Approved customer proof for this website (home page); nothing renders without it. */}
        {proof && proof.organizations.length + proof.metrics.length + proof.testimonials.length > 0 && (
          <div className="space-y-section pt-section">
            <TrustedBy organizations={proof.organizations} labels={PROOF_LABELS.trustedBy} />
            <ProofMetrics metrics={proof.metrics} locale="en" labels={PROOF_LABELS.metrics} />
            <Testimonials testimonials={proof.testimonials} labels={PROOF_LABELS.testimonials} />
          </div>
        )}
      </div>
    </>
  );
}
