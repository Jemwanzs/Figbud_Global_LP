import { type ProductSlug, themeColorViewport } from "@figbud/brand";
import {
  CampaignOverlays,
  CampaignProvider,
  CampaignSlot,
  CookieConsent,
  ENGLISH_CONSENT_LABELS,
  brandIcons,
  enquiriesOpen,
  resolveNavPreviews,
  siteThemeCss,
  verificationMeta,
} from "@figbud/site-kit";
import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  allowIndexing,
  enquiryHref,
  figbudOrigin,
  getListedSites,
  getLiveCampaigns,
  getPages,
  siteLanguages,
  getPrivacySettings,
  getSite,
  pageHref,
  parseSiteParam,
  siteLinkHref,
  publicApiOrigin,
  rendererOrigin,
} from "@/lib/sites";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });
// Country flags for the enquiry form's country and phone selectors on systems
// without flag emoji (Windows), as on the corporate site. Only the
// regional-indicator range, fetched only when a flag shows. Twemoji, CC-BY 4.0.
const flags = localFont({
  src: "../../../../../node_modules/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2",
  variable: "--font-flags",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+1F1E6-1F1FF, U+1F3F4, U+E0062-E007F" }],
});

/** Products with a design-system accent; others use the FigBud accent plus their published colours. */
const KNOWN = ["zirahr", "jasiri", "expense_now", "ziwa"];
/** Placeholder so the route still prerenders before any website is listed. */
const PLACEHOLDER = "__none__";

const CTA_LABELS = {
  waitlist: "Join the waitlist",
  early_access: "Request early access",
  demo: "Request a demo",
};

export async function generateStaticParams() {
  const sites = (await getListedSites()).filter((s) => s.kind === "product");
  return (sites.length ? sites.map((s) => s.slug) : [PLACEHOLDER]).map((site) => ({ site }));
}

export const viewport: Viewport = {
  themeColor: themeColorViewport,
  colorScheme: "dark light",
};

export async function generateMetadata({ params }: LayoutProps<"/[site]">): Promise<Metadata> {
  const { slug, ownDomain } = parseSiteParam((await params).site);
  const site = await getSite(slug);
  if (!site) return { robots: { index: false, follow: false } };
  return {
    metadataBase: new URL(rendererOrigin),
    icons: brandIcons(site.brand),
    manifest: `/manifest.webmanifest?site=${site.slug}${ownDomain ? "&own=1" : ""}`,
    title: {
      default: site.tagline ? `${site.name} — ${site.tagline}` : site.name,
      // The website's own template (Studio → SEO & search visibility).
      template: site.seo?.title_template ?? `%s · ${site.name}`,
    },
    description: site.seo?.default_description ?? site.description ?? site.tagline ?? undefined,
    verification: verificationMeta(site.seo),
    applicationName: site.name,
    openGraph: { type: "website", siteName: site.name },
    twitter: { card: "summary_large_image" },
    robots: !allowIndexing
      ? { index: false, follow: false }
      : site.seo?.indexing === false
        ? { index: false, follow: true }
        : undefined,
  };
}

/** Every product website: its brand, its published pages in the navigation, its call to action. */
export default async function SiteLayout({ children, params }: LayoutProps<"/[site]">) {
  const { slug, ownDomain } = parseSiteParam((await params).site);
  const site = await getSite(slug);
  if (!site) notFound();
  const pages = await getPages(slug);
  const privacy = await getPrivacySettings();
  const campaigns = await getLiveCampaigns(slug);
  // The menu: the Studio's own links, or the published pages marked for navigation.
  const navigation = site.settings?.navigation;
  // Each website's own hover previews (UI-NAV2); none until it writes some.
  const previews = resolveNavPreviews(site.settings?.nav_previews);
  const links =
    navigation?.mode === "custom"
      ? navigation.items.map((l) => ({
          href: siteLinkHref(slug, ownDomain, l.href),
          label: l.label,
          preview: previews[l.href],
        }))
      : pages
          .filter((p) => p.path !== "" && p.show_in_nav !== false)
          .map((p) => ({
            href: pageHref(slug, ownDomain, p.path),
            label: p.title,
            preview: previews[`/${p.path}`],
            // Translated pages and titles, so the header can follow the page's language (P7-L2b).
            path: p.path,
          }));
  // Brand accents.
  const colours = (
    site.brand ? { "--product": site.brand.colors.primary, "--product-2": site.brand.colors.secondary } : {}
  ) as CSSProperties;
  // Its published Brand & Theme Studio colours and section bands, scoped to this website (validated hex only).
  const themeCss = siteThemeCss(slug, site.settings?.theme);

  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${outfit.variable} ${flags.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      {/* `data-site` lets a website have its own surfaces (ZiraHR's warm palette). */}
      <body data-site={slug} className="min-h-dvh">
        {themeCss && <style data-site-theme="">{themeCss}</style>}
        <div
          data-product={KNOWN.includes(slug) ? slug : "figbud"}
          style={colours}
          className="flex min-h-dvh flex-col"
        >
          <a
            href="#main"
            className="sr-only z-[100] rounded-full bg-accent px-5 py-3 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
          >
            Skip to content
          </a>
          <CampaignProvider
            campaigns={campaigns}
            apiOrigin={publicApiOrigin}
            enquiryUrl={enquiryHref(site, { ownDomain, pages })}
            pathPrefix={ownDomain ? "" : `/${slug}`}
            brand={site.brand}
            product={KNOWN.includes(slug) ? slug : "figbud"}
          >
            <CampaignSlot placement="announcement_bar" />
            <SiteHeader
              name={site.name}
              homeHref={pageHref(slug, ownDomain, "")}
              slug={KNOWN.includes(slug) ? (slug as ProductSlug) : undefined}
              brand={site.brand}
              links={links.slice(0, 6)}
              cta={
                enquiriesOpen(site)
                  ? { href: enquiryHref(site, { ownDomain, pages }), label: CTA_LABELS[site.cta] }
                  : null
              }
              languages={await siteLanguages(site)}
              site={{ slug, ownDomain }}
              translations={pages.map((p) => ({
                path: p.path,
                locales: p.locales ?? [],
                titles: p.titles ?? {},
              }))}
            />
            <CampaignSlot
              placement="below_nav"
              className="mx-auto block w-full max-w-[92rem] px-5 pt-4 sm:px-8 md:px-10 lg:px-16"
            />
            <main id="main" tabIndex={-1} className="flex-1 overflow-x-clip outline-none">
              {children}
            </main>
            <CampaignSlot
              placement="footer"
              className="mx-auto block w-full max-w-[92rem] px-5 pb-section-sm sm:px-8 md:px-10 lg:px-16"
            />
            <SiteFooter
              name={site.name}
              tagline={site.tagline}
              description={site.description}
              settings={site.settings?.footer}
              fallbackLinks={links}
              resolve={(href) => siteLinkHref(slug, ownDomain, href)}
              home={pageHref(slug, ownDomain, "")}
              slug={KNOWN.includes(slug) ? (slug as ProductSlug) : undefined}
              brand={site.brand}
            />
            {/* The policies are FigBud Global's, on the corporate site. */}
            <CookieConsent
              settings={privacy}
              labels={ENGLISH_CONSENT_LABELS}
              site={slug}
              apiOrigin={publicApiOrigin}
              linkBase={`${figbudOrigin}/en`}
            />
            <CampaignOverlays />
          </CampaignProvider>
        </div>
      </body>
    </html>
  );
}
