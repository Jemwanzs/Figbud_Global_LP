"use client";

import { type Locale, consentCopy, interfaceCopy } from "@figbud/i18n";
import { CookieConsent, type PrivacySettings } from "@figbud/site-kit";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { pageSegments, splitLocale } from "@/lib/addresses";

/**
 * The page's language, from its address (`/zirahr/sw/platform`, P7-L2b), for
 * the parts the website's layout draws around every page (P7-L3).
 */
export function usePageLocale(
  site: { slug: string; ownDomain: boolean },
  languages: readonly Locale[],
): Locale {
  const pathname = usePathname();
  return splitLocale(pageSegments(pathname, site.slug, site.ownDomain), languages).locale as Locale;
}

/** "Skip to content" in the page's language. */
export function SkipLink({
  site,
  languages,
}: {
  site: { slug: string; ownDomain: boolean };
  languages: Locale[];
}) {
  const locale = usePageLocale(site, languages);
  return (
    <a
      href="#main"
      className="sr-only z-[100] rounded-full bg-accent px-5 py-3 font-medium text-accent-ink focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
    >
      {interfaceCopy[locale].skipToContent}
    </a>
  );
}

/**
 * The cookie banner in the page's language. English pages show the Studio's
 * own wording (Settings → Privacy & Cookies); other languages show the shared
 * translation, as on FigBud Global.
 */
export function SiteConsent({
  website,
  languages,
  settings,
  ...rest
}: Omit<ComponentProps<typeof CookieConsent>, "labels" | "settings" | "site"> & {
  website: { slug: string; ownDomain: boolean };
  languages: Locale[];
  settings: PrivacySettings;
}) {
  const locale = usePageLocale(website, languages);
  const copy = consentCopy[locale];
  const localized =
    locale === "en" ? settings : { ...settings, banner: copy.banner, categories: copy.categories };
  return <CookieConsent {...rest} site={website.slug} settings={localized} labels={copy.labels} />;
}
