import "server-only";

import { type Product, type ProductStatus, publicProducts } from "@figbud/brand";
import {
  type BrandProfile,
  type ListedSite,
  type LiveCampaign,
  type NavPreviewContent,
  type PublicProof,
  type PublishedHero,
  type SectionThemes,
  type ShowcaseSettings,
  type SiteFooterSettings,
  type SiteSeo,
  type SiteTheme,
  enquiriesOpen,
  resolveNavPreviews,
  showcaseSettings,
} from "@figbud/site-kit";
import {
  fetchBrandPng,
  fetchHero,
  fetchListedSites,
  fetchLiveCampaigns,
  fetchProof,
} from "@figbud/site-kit/server";
import { cacheLife, cacheTag } from "next/cache";

import { apiOrigin } from "./site";

export const apiBase = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");

/** The website registry (`GET /v1/sites`), cached for minutes; `null` if the API is unreachable. */
async function getListedSites(): Promise<ListedSite[] | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  return fetchListedSites(apiBase);
}

/**
 * Today's public products, with their name and marketing status from the
 * website registry (managed in Admin → Websites). Products the registry
 * doesn't list (draft, retired, archived) are left out. Products without copy in the
 * dictionaries are skipped. If the API can't be reached, the code registry in
 * @figbud/brand is used unchanged.
 *
 * Beta is shown as "coming soon" (waitlist) until the corporate site has
 * reviewed early-access copy in every language.
 */
export async function getPublicProducts(): Promise<Product[]> {
  const sites = await getListedSites();
  if (!sites) return [...publicProducts];
  const listed = new Map(sites.map((s) => [s.slug, s]));
  return publicProducts.flatMap((product) => {
    const site = listed.get(product.slug);
    if (!site) return [];
    const status: ProductStatus = site.status === "active" ? "active" : "coming_soon";
    return [{ ...product, name: site.name, status }];
  });
}

/** Products shown on the Africa expansion map: listed, and not switched off in Admin → Websites. */
export async function getMapProducts(): Promise<Product[]> {
  const [products, sites] = await Promise.all([getPublicProducts(), getListedSites()]);
  const hidden = new Set((sites ?? []).filter((s) => s.show_on_map === false).map((s) => s.slug));
  return products.filter((p) => !hidden.has(p.slug));
}

/** Published brand profiles by website slug (empty when none are published or the API is down). */
export async function getBrands(): Promise<Record<string, BrandProfile | null>> {
  const sites = await getListedSites();
  return Object.fromEntries((sites ?? []).map((s) => [s.slug, s.brand]));
}

/**
 * Products whose websites aren't taking enquiries (Admin Studio → Websites →
 * Navigation, footer & forms), with the message to show instead ("" for the
 * default). The API refuses them too; this keeps the form honest.
 */
export async function getClosedEnquiries(): Promise<Record<string, string>> {
  const sites = (await getListedSites()) ?? [];
  return Object.fromEntries(
    sites.filter((s) => !enquiriesOpen(s)).map((s) => [s.slug, s.settings?.enquiries.closed_message ?? ""]),
  );
}

/**
 * The social sharing image uploaded in Admin → Websites → FigBud Global →
 * Branding, as a 1200 × 630 PNG, or `null` (the generated image is used).
 */
export async function getSocialImage(): Promise<Uint8Array | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  const asset = (await getBrands()).figbud?.social_image;
  return asset ? fetchBrandPng(apiBase, asset.id, "social") : null;
}

/**
 * The website's live campaigns, cached for 30 seconds. Campaigns carry their
 * end, so they disappear on time in the browser whatever the cache.
 */
export async function getLiveCampaigns(slug: string): Promise<LiveCampaign[]> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 300 });
  cacheTag("campaigns", `campaigns:${slug}`);
  return fetchLiveCampaigns(apiBase, slug);
}

/** The corporate website's search identity (Studio → FigBud Global → SEO & search visibility). */
export async function getCorporateSeo(): Promise<SiteSeo | null> {
  const sites = await getListedSites();
  return sites?.find((s) => s.slug === "figbud")?.seo ?? null;
}

/**
 * Seconds per product when the home page's product showcase rotates on its
 * own, or `null` when it doesn't (Studio → FigBud Global → Our Platforms;
 * off by default).
 */
export async function getProductRotation(): Promise<number | null> {
  const motion = (await getListedSites())?.find((s) => s.slug === "figbud")?.settings?.motion;
  return motion?.product_rotation ? motion.rotation_seconds : null;
}

/**
 * The corporate menu's hover previews for a language (UI-NAV2): the reviewed
 * wording for that language, with the Studio's published edits on English
 * pages (other languages keep their own wording until they're translated).
 */
export async function getNavPreviews(
  locale: string,
  defaults: Record<string, NavPreviewContent>,
): Promise<Record<string, NavPreviewContent>> {
  const settings = (await getListedSites())?.find((s) => s.slug === "figbud")?.settings;
  return resolveNavPreviews(settings?.nav_previews, defaults, locale === "en");
}

/** The home page's section themes as published in the Studio (Studio → FigBud Global → Section themes). */
export async function getSectionThemes(): Promise<SectionThemes> {
  const themes = (await getListedSites())?.find((s) => s.slug === "figbud")?.settings?.section_themes;
  return (themes ?? {}) as SectionThemes;
}

/** FigBud Global's published colours (Studio → FigBud Global → Colours & themes, UI-BT3). */
export async function getCorporateTheme(): Promise<SiteTheme | undefined> {
  return (await getListedSites())?.find((s) => s.slug === "figbud")?.settings?.theme ?? undefined;
}

/** The corporate footer as published in the Studio (Studio → FigBud Global → Footer). */
export async function getFooterSettings(): Promise<SiteFooterSettings | undefined> {
  return (await getListedSites())?.find((s) => s.slug === "figbud")?.settings?.footer;
}

/**
 * How Our Platforms behaves (Studio → FigBud Global → Our Platforms, UI-MO5):
 * scroll-driven by default, with the Studio's product order.
 */
export async function getShowcase(): Promise<ShowcaseSettings> {
  const settings = (await getListedSites())?.find((s) => s.slug === "figbud")?.settings;
  return showcaseSettings(settings?.showcase);
}

/**
 * The corporate website's published Trusted By organisations, testimonials
 * and verified metrics (Studio → Content & Marketing). Studio changes
 * refresh the `proof` tag at once (admin proxy).
 */
export async function getProof(): Promise<PublicProof> {
  "use cache";
  cacheLife("minutes");
  cacheTag("proof");
  return fetchProof(apiBase, "figbud");
}

/**
 * The corporate home page's published hero (Studio → FigBud Global → Hero
 * Design Studio), or `null` for Hero 01 as approved. Publishing refreshes the
 * `hero` tag at once (admin proxy).
 */
export async function getHero(): Promise<PublishedHero | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("hero");
  return fetchHero(apiBase, "figbud");
}
