import { themeColorViewport } from "@figbud/brand";
import {
  CookieConsent,
  ENGLISH_CONSENT_LABELS,
  brandIcons,
  enquiriesOpen,
  siteThemeStyle,
} from "@figbud/site-kit";
import { themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  allowIndexing,
  enquiryHref,
  figbudOrigin,
  getListedSites,
  getPages,
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
      template: `%s · ${site.name}`,
    },
    description: site.description ?? site.tagline ?? undefined,
    applicationName: site.name,
    openGraph: { type: "website", siteName: site.name },
    robots: allowIndexing ? undefined : { index: false, follow: false },
  };
}

/** Every product website: its brand, its published pages in the navigation, its call to action. */
export default async function SiteLayout({ children, params }: LayoutProps<"/[site]">) {
  const { slug, ownDomain } = parseSiteParam((await params).site);
  const site = await getSite(slug);
  if (!site) notFound();
  const pages = await getPages(slug);
  const privacy = await getPrivacySettings();
  // The menu: the Studio's own links, or the published pages marked for navigation.
  const navigation = site.settings?.navigation;
  const links =
    navigation?.mode === "custom"
      ? navigation.items.map((l) => ({ href: siteLinkHref(slug, ownDomain, l.href), label: l.label }))
      : pages
          .filter((p) => p.path !== "" && p.show_in_nav !== false)
          .map((p) => ({ href: pageHref(slug, ownDomain, p.path), label: p.title }));
  const footer = site.settings?.footer;
  const footerLinks = (footer?.links ?? []).map((l) => ({
    href: siteLinkHref(slug, ownDomain, l.href),
    label: l.label,
  }));
  // Brand accents, plus the section band colours from the website's theme (P7-E1).
  const colours = {
    ...(site.brand
      ? { "--product": site.brand.colors.primary, "--product-2": site.brand.colors.secondary }
      : {}),
    ...siteThemeStyle(site.settings?.theme),
  } as CSSProperties;

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={outfit.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
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
          <SiteHeader
            name={site.name}
            homeHref={pageHref(slug, ownDomain, "")}
            logo={site.brand?.logos.horizontal}
            links={links.slice(0, 6)}
            cta={enquiriesOpen(site) ? { href: enquiryHref(site), label: CTA_LABELS[site.cta] } : null}
          />
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter
            name={site.name}
            tagline={footer?.note ?? site.tagline}
            links={footerLinks.length ? footerLinks : links}
          />
          {/* The policies are FigBud Global's, on the corporate site. */}
          <CookieConsent
            settings={privacy}
            labels={ENGLISH_CONSENT_LABELS}
            site={slug}
            apiOrigin={publicApiOrigin}
            linkBase={`${figbudOrigin}/en`}
          />
        </div>
      </body>
    </html>
  );
}
