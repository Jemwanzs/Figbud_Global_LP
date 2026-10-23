import "server-only";

import type { BrandProfile } from "@figbud/site-kit";
import { fetchListedSites } from "@figbud/site-kit/server";
import { cacheLife, cacheTag } from "next/cache";

/** The FigBud API; `API_INTERNAL_URL` (server-only) reaches it over a private network. */
export const apiBase = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"
).replace(/\/$/, "");

/** ZiraHR's published brand profile (Admin → Websites → Branding), or `null` (built-in look). */
export async function getBrand(): Promise<BrandProfile | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  const sites = await fetchListedSites(apiBase);
  return sites?.find((s) => s.slug === "zirahr")?.brand ?? null;
}
