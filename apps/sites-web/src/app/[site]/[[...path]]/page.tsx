import { PageBlocks } from "@figbud/site-kit";
import { buttonClasses } from "@figbud/ui";
import { ArrowRight } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";

import {
  canonicalUrl,
  enquiryHref,
  getPage,
  getPages,
  getSite,
  hrefResolver,
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
  if (!page) return path === "" ? { robots: { index: false, follow: true } } : {};
  const canonical = canonicalUrl(site, ownDomain, path);
  const description = page.seo_description || site.description || site.tagline || undefined;
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
    // Kept out of search engines in the Studio.
    ...(page.seo_noindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function SitePage({ params }: PageProps<"/[site]/[[...path]]">) {
  const { site, ownDomain, path, page } = await load(params);
  if (!site) notFound();

  if (!page) {
    // Old addresses of moved pages are forwarded earlier, by the proxy.
    if (path !== "") notFound();
    // Listed but nothing published yet: an honest holding page from the registry.
    return (
      <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section sm:px-8 md:px-10 lg:px-16">
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

  const pages = await getPages(site.slug);
  return (
    <div className="mx-auto max-w-[92rem] px-5 py-section-sm sm:px-8 md:px-10 lg:px-16">
      <PageBlocks document={page} resolveHref={hrefResolver(site, ownDomain, pages)} />
    </div>
  );
}
