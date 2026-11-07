import { publicProducts } from "@figbud/brand";
import { type Locale, localizePath } from "@figbud/i18n";
import { FigBudWordmark } from "@figbud/ui";
import {
  BrandLogo,
  type BrandProfile,
  CookieSettingsButton,
  type FooterColumnSpec,
  FooterLayout,
  type SiteFooterSettings,
} from "@figbud/site-kit";
import { cacheLife } from "next/cache";
import Link from "next/link";

import type { Dictionary } from "@/i18n/get-dictionary";
import { productLink, routes } from "@/lib/site";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/**
 * FigBud Global's footer (owner's brief, 7 Nov 2026), on the shared
 * `FooterLayout`. The wording comes from the dictionary in every language;
 * text set in the Studio replaces it on English pages (other languages keep
 * their reviewed wording), while contact details, profiles and visibility
 * apply everywhere.
 */
export async function SiteFooter({
  locale,
  dict,
  brand,
  settings,
}: {
  locale: Locale;
  dict: Dictionary;
  /** The published FigBud Global brand profile, if any. */
  brand?: BrandProfile | null;
  /** Studio → FigBud Global → Footer, as published. */
  settings?: SiteFooterSettings | null;
}) {
  const { footer, common } = dict;
  const year = await currentYear();
  const english = locale === "en";
  const own = (text?: string | null) => (english && text?.trim()) || null;
  const href = (path: string) => (path.startsWith("/") ? localizePath(locale, path) : path);

  const navigate: FooterColumnSpec = {
    title: footer.navigateTitle,
    links: [
      { label: common.nav.home, href: localizePath(locale) },
      { label: common.nav.about, href: localizePath(locale, routes.about) },
      { label: common.nav.products, href: localizePath(locale, routes.products) },
      { label: common.nav.blog, href: localizePath(locale, routes.blog) },
      { label: common.nav.contact, href: localizePath(locale, routes.contact) },
    ],
  };
  // Groups set in the Studio replace Navigate on English pages.
  const custom: FooterColumnSpec[] = english
    ? (settings?.groups ?? []).map((group) => ({
        title: group.title,
        links: group.links.map((l) => ({
          label: l.label,
          href: href(l.href),
          external: l.href.startsWith("https://"),
        })),
      }))
    : [];
  const products: FooterColumnSpec = {
    title: footer.productsTitle,
    links: publicProducts.map((product) => {
      const link = productLink(product.slug, locale);
      return {
        label: product.name,
        href: link.href,
        external: link.external,
        product: product.slug,
        badge: product.status === "coming_soon" ? common.status.coming_soon : undefined,
      };
    }),
  };
  const legal: FooterColumnSpec = {
    title: footer.legalTitle,
    links: [
      { label: footer.privacy, href: localizePath(locale, routes.privacy) },
      { label: footer.terms, href: localizePath(locale, routes.terms) },
      { label: footer.cookies, href: localizePath(locale, routes.cookies) },
    ],
    extra: (
      <CookieSettingsButton
        label={footer.cookieSettings}
        className="inline-flex min-h-10 cursor-pointer items-center rounded-md text-start text-sm text-muted transition-colors duration-200 hover:text-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
      />
    ),
  };

  const cta = settings?.cta;
  return (
    <FooterLayout
      identity={
        <Link href={localizePath(locale)} className="inline-block rounded-lg" aria-label="FigBud Global">
          <BrandLogo
            pair={brand?.logos.horizontal}
            height={brand?.logo_height ?? 28}
            maxWidth={190}
            alt="FigBud Global"
            fallback={<FigBudWordmark />}
          />
        </Link>
      }
      tagline={own(settings?.tagline) ?? footer.tagline}
      description={own(settings?.note) ?? dict.home.company.body}
      cta={
        cta?.show === false
          ? null
          : {
              heading: own(cta?.heading) ?? footer.cta.heading,
              body: own(cta?.body) ?? footer.cta.body,
              label: own(cta?.label) ?? footer.cta.label,
              href: href((english && cta?.href) || routes.products),
              external: Boolean(english && cta?.href?.startsWith("https://")),
            }
      }
      columns={[...(custom.length ? custom : [navigate]), products]}
      legal={legal}
      contact={settings?.contact}
      social={settings?.social}
      hidden={settings?.hidden}
      copyright={`© ${year} FigBud Global. ${footer.rights}`}
      note={footer.origin}
      labels={{
        opensInNewTab: common.opensInNewTab,
        contact: footer.contactTitle,
        social: footer.socialTitle,
        links: footer.linksLabel,
      }}
    />
  );
}
