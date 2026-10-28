import type { ListedSite } from "./brand";

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
 * Route handler for `app/brand/assets/[id]/route.ts`: serves published logo
 * files from the website's own origin (no CSP or mixed-content exceptions),
 * passing through the API's immutable caching.
 */
export function brandAssetRoute(apiBase: string) {
  const base = apiBase.replace(/\/$/, "");
  return async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const query = new URL(request.url).searchParams;
    const width = query.get("w");
    // A square PNG icon size (the API allows 16, 32, 48, 180, 192 and 512).
    const icon = query.get("icon");
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
      upstream = await fetch(`${base}/v1/brand/assets/${id}${suffix}`, {
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
