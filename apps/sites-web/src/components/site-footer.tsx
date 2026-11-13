import type { ProductSlug } from "@figbud/brand";
import {
  type BrandProfile,
  CookieSettingsButton,
  type FooterColumnSpec,
  FooterLayout,
  type FooterSocialNetwork,
  ProductIdentity,
  type SiteFooterSettings,
} from "@figbud/site-kit";
import { cacheLife } from "next/cache";

import { figbudOrigin } from "@/lib/sites";

import type { NavLink } from "./site-header";

/** Shown unlinked while a website lists no profiles (app stores only when added). */
const DEFAULT_SOCIAL: FooterSocialNetwork[] = ["facebook", "instagram", "x", "linkedin"];

/** The current year, cached so the footer stays part of the static shell. */
async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/**
 * A product website's footer (owner's brief, 7 Nov 2026), on the shared
 * `FooterLayout`: its call to action, identity and link groups from the
 * Studio, and a fixed Legal & Support column with FigBud Global's policies
 * and the cookie settings. The product stays the brand; FigBud Global is
 * named as its maker in words only.
 */
export async function SiteFooter({
  name,
  tagline,
  description,
  settings,
  fallbackLinks,
  resolve,
  home,
  slug,
  brand,
}: {
  name: string;
  /** The website's own tagline and description, used when the Studio sets none. */
  tagline?: string | null;
  description?: string | null;
  settings?: SiteFooterSettings | null;
  /** The menu's links, for a website without footer groups or links yet. */
  fallbackLinks: NavLink[];
  /** Turns a Studio link ("/platform") into this website's address. */
  resolve: (href: string) => string;
  home: string;
  /** The product, when the brand registry knows it: its official logo or symbol shows. */
  slug?: ProductSlug;
  brand?: BrandProfile | null;
}) {
  const year = await currentYear();
  const corporate = (path: string) => `${figbudOrigin}/en${path}`;
  const toLink = (l: { label: string; href: string }) => ({
    label: l.label,
    href: resolve(l.href),
    external: l.href.startsWith("https://"),
    // The footer's main action (booking a demo) gets a little more weight.
    emphasis: /kind=demo_request/.test(l.href),
  });
  // With no profiles listed, the common networks show without links until
  // their addresses are added in the Studio (owner's brief, 13 Nov 2026).
  const social = settings?.hide_social_icons
    ? []
    : settings?.social?.length
      ? settings.social
      : DEFAULT_SOCIAL.map((network) => ({ network, href: "" }));

  const groups = settings?.groups ?? [];
  const legacy = settings?.links ?? [];
  const columns: FooterColumnSpec[] = groups.length
    ? groups.map((g) => ({ title: g.title, links: g.links.map(toLink) }))
    : [
        {
          title: "Explore",
          links: legacy.length
            ? legacy.map(toLink)
            : fallbackLinks.map((l) => ({ label: l.label, href: l.href })),
        },
      ].filter((c) => c.links.length > 0);
  const legal: FooterColumnSpec = {
    title: "Legal & Support",
    links: [
      { label: "Privacy", href: corporate("/legal/privacy") },
      { label: "Terms", href: corporate("/legal/terms") },
      { label: "Cookies", href: corporate("/legal/cookies") },
    ],
    extra: (
      <CookieSettingsButton
        label="Cookie settings"
        className="inline-flex min-h-10 cursor-pointer items-center rounded-md text-start text-sm text-muted transition-colors duration-200 hover:text-product-text focus-visible:text-product-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
      />
    ),
  };

  const cta = settings?.cta;
  const showCta = cta?.show !== false && cta?.heading && cta.label && cta.href;
  return (
    <FooterLayout
      identity={
        <a href={home} className="inline-block rounded-lg" aria-label={`${name} home`}>
          {slug ? (
            <ProductIdentity
              slug={slug}
              brand={brand}
              name={name}
              maxWidth={160}
              nameClassName="text-lg font-semibold text-text"
            />
          ) : (
            <span className="text-lg font-semibold text-text">{name}</span>
          )}
        </a>
      }
      tagline={settings?.tagline?.trim() || tagline}
      description={settings?.note?.trim() || description}
      cta={
        showCta
          ? {
              heading: cta.heading!,
              body: cta.body,
              label: cta.label!,
              href: resolve(cta.href!),
              external: cta.href!.startsWith("https://"),
            }
          : null
      }
      columns={columns}
      legal={legal}
      contact={settings?.contact}
      social={social}
      hidden={settings?.hidden}
      copyright={`© ${year} FigBud Global. All rights reserved.`}
      note={
        <>
          {name} is a product of{" "}
          <a
            href={corporate("")}
            className="rounded text-muted underline underline-offset-4 transition-colors duration-200 hover:text-product-text focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
          >
            FigBud Global
          </a>
          .
        </>
      }
      labels={{
        opensInNewTab: "opens in a new tab",
        contact: `Contact ${name}`,
        social: `${name} on social media`,
        links: "Footer links",
      }}
    />
  );
}
