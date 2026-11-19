import { type ProductSlug, themeColorViewport } from "@figbud/brand";
import {
  CampaignOverlays,
  CampaignProvider,
  CampaignSlot,
  CtaActions,
  brandIcons,
  enquiriesOpen,
  resolveNavPreviews,
  siteThemeCss,
  verificationMeta,
} from "@figbud/site-kit";
import type { EnquiryProduct } from "@figbud/site-kit/enquiry";
import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { type Locale, ctaCopy, locales } from "@figbud/i18n";

import { SiteConsent, SkipLink } from "@/components/site-chrome";
import { SiteFooter } from "@/components/site-footer";
import { type NavLink, SiteHeader } from "@/components/site-header";
import { type PlatformMenuEntry, platformMenu } from "@/lib/platform-menu";
import {
  allowIndexing,
  actionCta,
  enquiryHref,
  figbudOrigin,
  getListedSites,
  getLiveCampaigns,
  getPage,
  getPages,
  getPayrollCalculator,
  getPublicPricing,
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

// Preloads the Latin face only (P2-18); Latin Extended letters still use Outfit, fetched when a page has them.
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
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

/** The main button's label in every language: its chosen action, else the website's stage. */
function ctaLabels(site: NonNullable<Awaited<ReturnType<typeof getSite>>>): Record<Locale, string> {
  const action = site.settings?.enquiries.action;
  const key = action === "start_now" || action === "book_demo" ? action : site.cta;
  return Object.fromEntries(locales.map((l) => [l, ctaCopy[l][key]])) as Record<Locale, string>;
}

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
  const platformMenu = await platformEntries(slug, ownDomain, pages);
  const links: NavLink[] = (
    navigation?.mode === "custom"
      ? navigation.items.map((l) => ({
          href: siteLinkHref(slug, ownDomain, l.href),
          label: l.label,
          preview: previews[l.href],
          path: l.href === "/platform" ? "platform" : undefined,
        }))
      : pages
          .filter((p) => p.path !== "" && p.show_in_nav !== false)
          .map((p) => ({
            href: pageHref(slug, ownDomain, p.path),
            label: p.title,
            preview: previews[`/${p.path}`],
            // Translated pages and titles, so the header can follow the page's language (P7-L2b).
            path: p.path,
          }))
  )
    // An Integrations page moves under Platform, rather than appearing twice.
    .filter((link) => !(link.path === "integrations" && platformMenu.some((e) => e.entry === "integrations")))
    .map((link) =>
      // The Platform entry opens a submenu of what's published (owner's brief, 14 Nov 2026).
      link.path === "platform" && platformMenu.length > 1 ? { ...link, menu: platformMenu } : link,
    );
  // Brand accents.
  const colours = (
    site.brand ? { "--product": site.brand.colors.primary, "--product-2": site.brand.colors.secondary } : {}
  ) as CSSProperties;
  // Its published Brand & Theme Studio colours and section bands, scoped to this website (validated hex only).
  const themeCss = siteThemeCss(slug, site.settings?.theme);
  const languages = await siteLanguages(site);

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
          <SkipLink site={{ slug, ownDomain }} languages={languages} />
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
                  ? {
                      ...(actionCta(site) ?? {
                        href: enquiryHref(site, { ownDomain, pages }),
                        label: CTA_LABELS[site.cta],
                      }),
                      // Its label in each language, for translated pages (P7-L3).
                      labels: ctaLabels(site),
                    }
                  : null
              }
              languages={languages}
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
            <SiteConsent
              settings={privacy}
              languages={languages}
              website={{ slug, ownDomain }}
              apiOrigin={publicApiOrigin}
              linkBase={`${figbudOrigin}/en`}
            />
            <CampaignOverlays />
            {/* Start Now and demo booking, opened by any button set to them (P8-M8). */}
            {enquiriesOpen(site) && (
              <CtaActions
                apiOrigin={publicApiOrigin}
                product={(KNOWN.includes(slug) ? slug : "figbud") as EnquiryProduct}
                productName={site.name}
                privacyHref={`${figbudOrigin}/en/legal/privacy`}
                demoFallbackHref={enquiryHref({ ...site, cta: "demo" }, { ownDomain, pages })}
              />
            )}
          </CampaignProvider>
        </div>
      </body>
    </html>
  );
}

/** The Platform submenu from the same cached data as the pages it links to, so menu and pages agree. */
async function platformEntries(
  slug: string,
  ownDomain: boolean,
  pages: Awaited<ReturnType<typeof getPages>>,
): Promise<PlatformMenuEntry[]> {
  if (!pages.some((p) => p.path === "platform")) return [];
  const [platform, payroll, pricing] = await Promise.all([
    getPage(slug, "platform"),
    getPayrollCalculator(slug),
    getPublicPricing(slug),
  ]);
  return platformMenu({
    pages,
    platformSections: platform?.sections ?? [],
    payrollOn: Boolean(payroll),
    pricingShown: Boolean(pricing),
    href: (path) => pageHref(slug, ownDomain, path),
  });
}
