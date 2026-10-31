import {
  CampaignSlot,
  JsonLd,
  PageBlocks,
  ProofMetrics,
  PublicPricing,
  Testimonials,
  TrustedBy,
  breadcrumbLd,
  faqLd,
  organizationLd,
  softwareApplicationLd,
  websiteLd,
} from "@figbud/site-kit";
import { buttonClasses } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";

import {
  canonicalUrl,
  enquiryHref,
  figbudOrigin,
  getPage,
  getPages,
  getProof,
  getPublicPricing,
  getSite,
  hrefResolver,
  pageHref,
  parseSiteParam,
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
  const book = await getPublicPricing(site.slug);
  return (
    <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:px-16">
      <h1 className="font-display text-page font-semibold tracking-tight text-text">{`${site.name} pricing`}</h1>
      {book ? (
        <>
          <p className="mt-4 max-w-2xl text-lead text-muted">
            Choose modules and your number of employees for an estimate. Implementation, integrations and
            support are quoted for your organisation.
          </p>
          <div className="mt-stack">
            <PublicPricing
              book={book}
              endpoint={pageHref(site.slug, ownDomain, "pricing-calculate")}
              quoteHref={enquiryHref(site)}
            />
          </div>
        </>
      ) : (
        <div className="mt-6 max-w-2xl">
          <p className="text-lead text-muted">
            {`Pricing for ${site.name} depends on your modules, number of employees and implementation needs. Tell us about your organisation and we'll prepare a quotation.`}
          </p>
          <a href={enquiryHref(site)} className={buttonClasses("product", "lg", "mt-8")}>
            Request a quote
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </a>
        </div>
      )}
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
    // Old addresses of moved pages are forwarded earlier, by the proxy.
    if (path !== "") notFound();
    // Listed but nothing published yet: an honest holding page from the registry.
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

  const [pages, proof] = await Promise.all([getPages(site.slug), path === "" ? getProof(site.slug) : null]);
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
    <div className="mx-auto max-w-[92rem] px-5 py-section-sm sm:px-8 md:px-10 lg:px-16">
      <JsonLd data={structured} />
      {path === "" && <CampaignSlot placement="home_hero" className="mb-block block" />}
      <PageBlocks document={page} resolveHref={hrefResolver(site, ownDomain, pages)} />
      {/* Approved customer proof for this website (home page); nothing renders without it. */}
      {proof && proof.organizations.length + proof.metrics.length + proof.testimonials.length > 0 && (
        <div className="space-y-section pt-section">
          <TrustedBy organizations={proof.organizations} labels={PROOF_LABELS.trustedBy} />
          <ProofMetrics metrics={proof.metrics} locale="en" labels={PROOF_LABELS.metrics} />
          <Testimonials testimonials={proof.testimonials} labels={PROOF_LABELS.testimonials} />
        </div>
      )}
    </div>
  );
}
