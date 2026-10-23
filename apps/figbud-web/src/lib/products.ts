import "server-only";

import { type Product, type ProductStatus, publicProducts } from "@figbud/brand";
import { cacheLife, cacheTag } from "next/cache";

import { apiOrigin } from "./site";

const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");

interface ListedSite {
  slug: string;
  status: "coming_soon" | "beta" | "active";
}

/**
 * Today's public products, with their marketing status from the website
 * registry (`GET /v1/sites`, managed in Admin → Websites). Products the
 * registry doesn't list (draft, retired, archived) are left out. Products
 * without copy in the dictionaries are skipped. If the API can't be reached,
 * the code registry in @figbud/brand is used unchanged.
 *
 * Beta is shown as "coming soon" (waitlist) until the corporate site has
 * reviewed early-access copy in every language.
 */
export async function getPublicProducts(): Promise<Product[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites");
  try {
    const response = await fetch(`${base}/v1/sites`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [...publicProducts];
    const listed = new Map(((await response.json()) as ListedSite[]).map((s) => [s.slug, s.status]));
    return publicProducts.flatMap((product) => {
      const status = listed.get(product.slug);
      if (!status) return [];
      const shown: ProductStatus = status === "active" ? "active" : "coming_soon";
      return [{ ...product, status: shown }];
    });
  } catch {
    return [...publicProducts];
  }
}
