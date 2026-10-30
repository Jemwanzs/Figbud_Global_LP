import { company, publicProducts, themeColorViewport } from "@figbud/brand";
import { isLocale, localeInfo, locales, localizePath } from "@figbud/i18n";
import {
  CampaignOverlays,
  CampaignProvider,
  CampaignSlot,
  CookieConsent,
  brandIcons,
  verificationMeta,
} from "@figbud/site-kit";
import { MotionProvider, themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, Outfit } from "next/font/google";
import localFont from "next/font/local";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getDictionary } from "@/i18n/get-dictionary";
import { getPrivacySettings } from "@/lib/privacy";
import { getBrands, getCorporateSeo, getLiveCampaigns } from "@/lib/products";
import { allowIndexing, apiOrigin, siteOrigin } from "@/lib/site";

import "../globals.css";

const outfit = Outfit({
  subsets: ["latin", "latin-ext"],
  variable: "--font-outfit",
  display: "swap",
});

// Outfit has no Arabic glyphs; this face is only downloaded on Arabic pages.
// Country flags for the contact form's country and phone selectors, for
// systems without flag emoji (Windows). Only the regional-indicator range,
// not preloaded: browsers fetch it only when a flag is shown.
// Twemoji artwork, CC-BY 4.0 (docs/UI_STANDARDS.md).
const flags = localFont({
  src: "../../../../../node_modules/country-flag-emoji-polyfill/dist/TwemojiCountryFlags.woff2",
  variable: "--font-flags",
  display: "swap",
  preload: false,
  declarations: [{ prop: "unicode-range", value: "U+1F1E6-1F1FF, U+1F3F4, U+E0062-E007F" }],
});

const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600"],
  variable: "--font-arabic",
  display: "swap",
  preload: false,
});

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: themeColorViewport,
  colorScheme: "dark light",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = await getDictionary(locale);
  return {
    metadataBase: new URL(siteOrigin),
    icons: brandIcons((await getBrands()).figbud),
    // Search Console and Bing verification tags from the Studio.
    verification: verificationMeta(await getCorporateSeo()),
    title: { default: dict.meta.title, template: `%s · ${dict.meta.siteName}` },
    description: dict.meta.description,
    applicationName: dict.meta.siteName,
    openGraph: {
      type: "website",
      siteName: dict.meta.siteName,
      locale: localeInfo[locale].tag,
    },
    twitter: { card: "summary_large_image" },
    robots: allowIndexing ? undefined : { index: false, follow: false },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = await getDictionary(locale);
  const info = localeInfo[locale];
  const brands = await getBrands();
  const campaigns = await getLiveCampaigns("figbud");
  const seo = await getCorporateSeo();
  const studio = await getPrivacySettings();
  // English pages show the Studio's wording; the other languages their translation.
  const privacy =
    locale === "en"
      ? studio
      : { ...studio, banner: dict.consent.banner, categories: dict.consent.categories };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    url: siteOrigin,
    logo: `${siteOrigin}/apple-icon.png`,
    slogan: company.tagline,
    brand: publicProducts.map((p) => ({ "@type": "Brand", name: p.name })),
    // Verified official profiles from the Studio.
    ...(seo?.same_as?.length ? { sameAs: seo.same_as } : {}),
  };

  return (
    <html
      lang={info.tag}
      dir={info.dir}
      data-theme="dark"
      suppressHydrationWarning
      className={`${outfit.variable} ${flags.variable} ${locale === "ar" ? arabic.variable : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-accent px-5 py-3 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {dict.common.skipToContent}
        </a>
        <MotionProvider>
          <CampaignProvider
            campaigns={campaigns}
            apiOrigin={apiOrigin}
            enquiryUrl={`${localizePath(locale, "/contact")}?product=figbud`}
            pathPrefix={localizePath(locale)}
            brand={brands.figbud}
            product="figbud"
          >
            <CampaignSlot placement="announcement_bar" />
            <SiteHeader locale={locale} common={dict.common} products={dict.products} brands={brands} />
            <CampaignSlot
              placement="below_nav"
              className="mx-auto block w-full max-w-[92rem] px-5 pt-4 sm:px-8 md:px-10 lg:px-16"
            />
            {info.status === "draft" && (
              <section aria-labelledby="draft-notice" className="border-b border-line bg-surface">
                <p id="draft-notice" className="px-5 py-2.5 text-center text-sm text-muted">
                  {dict.common.draftNotice}
                </p>
              </section>
            )}
            <main id="main" tabIndex={-1} className="outline-none">
              {children}
            </main>
            <CampaignSlot
              placement="footer"
              className="mx-auto block w-full max-w-[92rem] px-5 pb-section-sm sm:px-8 md:px-10 lg:px-16"
            />
            <SiteFooter locale={locale} dict={dict} brand={brands.figbud} />
            <CookieConsent
              settings={privacy}
              labels={dict.consent.labels}
              site="figbud"
              apiOrigin={apiOrigin}
              linkBase={localizePath(locale)}
            />
            <CampaignOverlays />
          </CampaignProvider>
        </MotionProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
