import type { ListedSite } from "./brand";
import type { LiveCampaign } from "./campaigns";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Listed websites with their published brand, or `null` when the API can't be
 * reached (callers fall back to the built-in registry). Never throws. Wrap it
 * in a `"use cache"` function in the app.
 */
export async function fetchListedSites(apiBase: string): Promise<ListedSite[] | null> {
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/sites`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ListedSite[];
  } catch {
    return null;
  }
}

/**
 * A published brand file as PNG bytes, for generated images (Open Graph):
 * `social` gives the 1200 × 630 sharing image, a number a square icon of that
 * size. `null` if the API can't be reached or the file isn't published.
 * Wrap it in a `"use cache"` function in the app.
 */
export async function fetchBrandPng(
  apiBase: string,
  id: string,
  variant: "social" | 180 | 512,
): Promise<Uint8Array | null> {
  if (!UUID.test(id)) return null;
  const query = variant === "social" ? "social=1" : `icon=${variant}`;
  try {
    const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/brand/assets/${id}?${query}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || response.headers.get("content-type") !== "image/png") return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Route handler for `app/brand/assets/[id]/route.ts`: serves published logo
 * files from the website's own origin (no CSP or mixed-content exceptions),
 * passing through the API's immutable caching.
 */
export function brandAssetRoute(apiBase: string) {
  return assetProxyRoute(apiBase, "/v1/brand/assets/", true);
}

/**
 * Route handler for `app/media/[id]/route.ts`: media library images used on
 * published pages (the API decides what is public), from the website's origin.
 */
export function mediaRoute(apiBase: string) {
  return assetProxyRoute(apiBase, "/v1/media/", false);
}

function assetProxyRoute(apiBase: string, upstreamPath: string, icons: boolean) {
  const base = apiBase.replace(/\/$/, "");
  return async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const width = query.get("w");
    // A square PNG icon size (the API allows 16, 32, 48, 180, 192 and 512); logos only.
    const icon = icons ? query.get("icon") : null;
    if (
      !UUID.test(id) ||
      (width !== null && !/^\d{1,4}$/.test(width)) ||
      (icon !== null && !/^\d{2,3}$/.test(icon))
    ) {
      return new Response("Not found", { status: 404 });
    }
    const suffix = icon ? `?icon=${icon}` : width ? `?w=${width}` : "";
    let upstream: Response;
    try {
      upstream = await fetch(`${base}${upstreamPath}${id}${suffix}`, {
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return new Response("Unavailable", { status: 503, headers: { "cache-control": "no-store" } });
    }
    if (!upstream.ok) {
      return new Response("Not found", {
        status: upstream.status === 404 ? 404 : 502,
        headers: { "cache-control": "no-store" },
      });
    }
    const headers = new Headers({ "x-content-type-options": "nosniff" });
    for (const name of ["content-type", "cache-control", "content-security-policy"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: 200, headers });
  };
}

/**
 * A website's live campaigns (`GET /v1/sites/{slug}/campaigns`), highest
 * priority first; empty if the API can't be reached. Wrap it in a short
 * `"use cache"` function: campaigns carry their end, and websites hide them
 * on time whatever the cache.
 */
export async function fetchLiveCampaigns(apiBase: string, slug: string): Promise<LiveCampaign[]> {
  try {
    const response = await fetch(
      `${apiBase.replace(/\/$/, "")}/v1/sites/${encodeURIComponent(slug)}/campaigns`,
      {
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) return [];
    return ((await response.json()) as { campaigns: LiveCampaign[] }).campaigns;
  } catch {
    return [];
  }
}
