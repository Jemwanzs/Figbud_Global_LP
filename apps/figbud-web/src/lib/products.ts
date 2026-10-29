import "server-only";

import { type Product, type ProductStatus, publicProducts } from "@figbud/brand";
import { type BrandProfile, type ListedSite, enquiriesOpen } from "@figbud/site-kit";
import { fetchBrandPng, fetchListedSites } from "@figbud/site-kit/server";
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
