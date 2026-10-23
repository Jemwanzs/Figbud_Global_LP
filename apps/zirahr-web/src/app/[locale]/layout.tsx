import { getProduct } from "@figbud/brand";
import { isLocale, locales } from "@figbud/i18n";
import { ProductHeader } from "@figbud/site-kit";
import { ProductFooter } from "@figbud/site-kit/footer";
import { MotionProvider, themeInitScript } from "@figbud/ui";
import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { notFound } from "next/navigation";

import { allowIndexing, getDictionary, siteOrigin } from "@/lib/site";

import "../globals.css";

const outfit = Outfit({ subsets: ["latin", "latin-ext"], variable: "--font-outfit", display: "swap" });

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#120f0d" },
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
  ],
  colorScheme: "dark light",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    metadataBase: new URL(siteOrigin),
    title: { default: dict.meta.title, template: `%s · ${dict.meta.siteName}` },
    description: dict.meta.description,
    applicationName: dict.meta.siteName,
    openGraph: { type: "website", siteName: dict.meta.siteName },
    robots: allowIndexing ? undefined : { index: false, follow: false },
  };
}

export default async function ProductLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const product = getProduct("zirahr");

  const software = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: product.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${siteOrigin}/${locale}`,
    publisher: { "@type": "Organization", name: "FigBud Global" },
  };

  return (
    <html
      lang="en"
      data-theme="dark"
      data-product="zirahr"
      suppressHydrationWarning
      className={outfit.variable}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-accent px-5 py-3 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {dict.skipToContent}
        </a>
        <MotionProvider>
          <ProductHeader slug="zirahr" locale={locale} labels={dict.header} />
          <main id="main" tabIndex={-1} className="outline-none">
            {children}
          </main>
          <ProductFooter
            slug="zirahr"
            locale={locale}
            labels={{ ...dict.footer, nav: dict.header.nav, opensInNewTab: dict.header.opensInNewTab }}
          />
        </MotionProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(software).replace(/</g, "\\u003c") }}
        />
      </body>
    </html>
  );
}
