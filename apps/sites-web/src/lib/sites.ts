import "server-only";

import {
  DEFAULT_PRIVACY,
  type ListedSite,
  type LiveCampaign,
  type PageDocument,
  type PrivacySettings,
} from "@figbud/site-kit";
import {
  fetchBrandPng,
  fetchListedSites,
  fetchLiveCampaigns,
  fetchPrivacySettings,
} from "@figbud/site-kit/server";
import { cacheLife, cacheTag } from "next/cache";

import type { PublishedPageRef } from "./addresses";

export * from "./addresses";

/**
 * Data for the product-website renderer (decision D16): the website registry,
 * published pages and published brands, all from the FigBud API. Drafts never
 * reach this app; the API only serves published pages of listed websites.
 */

export const apiBase = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"
).replace(/\/$/, "");

/** The API as the browser reaches it (cookie consent records). */
export const publicApiOrigin = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);

/** Search engines may index only when explicitly enabled (production). */
export const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === "true";

const TIMEOUT_MS = 5000;

export async function getListedSites(): Promise<ListedSite[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  return (await fetchListedSites(apiBase)) ?? [];
}

/** The cookie banner's settings, shared by every FigBud website (Admin Studio → Settings → Privacy & Cookies). */
export async function getPrivacySettings(): Promise<PrivacySettings> {
  "use cache";
  cacheLife("minutes");
  cacheTag("privacy");
  return (await fetchPrivacySettings(apiBase)) ?? DEFAULT_PRIVACY;
}

/** A listed product website, or `null` (draft, retired, archived, unknown or the corporate site). */
export async function getSite(slug: string): Promise<ListedSite | null> {
  const site = (await getListedSites()).find((s) => s.slug === slug);
  return site && site.kind === "product" ? site : null;
}

export interface PublishedPage extends PageDocument {
  title: string;
  published_at: string | null;
}

export async function getPages(slug: string): Promise<PublishedPageRef[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites", `site:${slug}`);
  try {
    const response = await fetch(`${apiBase}/v1/sites/${encodeURIComponent(slug)}/pages`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? ((await response.json()) as PublishedPageRef[]) : [];
  } catch {
    return [];
  }
}

/** A published page, or `null` when the website has no published page at this address. */
export async function getPage(slug: string, path: string): Promise<PublishedPage | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites", `site:${slug}`);
  try {
    const response = await fetch(
      `${apiBase}/v1/sites/${encodeURIComponent(slug)}/page?path=${encodeURIComponent(path)}`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    return response.ok ? ((await response.json()) as PublishedPage) : null;
  } catch {
    return null;
  }
}

/** A published brand file as PNG bytes (sharing images), cached like the registry. */
export async function getBrandPng(id: string, variant: "social" | 512): Promise<Uint8Array | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  return fetchBrandPng(apiBase, id, variant);
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
