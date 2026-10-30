import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

import { apiOrigin } from "@/lib/site";

/**
 * Same-origin proxy from the admin UI to the API's `/v1/admin/*` endpoints.
 * Keeping admin traffic on the website's own origin lets the session cookie be
 * `SameSite=Strict` and host-only on any domain (including Railway's), and
 * keeps the API's admin surface off the browser's cross-origin path.
 * The browser's `Origin` is forwarded so the API can enforce CSRF checks.
 */
const base = (process.env.API_INTERNAL_URL ?? apiOrigin).replace(/\/$/, "");
const SAFE_PATH = /^[a-z0-9_-]+(\/[a-z0-9_-]+)*$/;
const FORWARDED = ["content-type", "cookie", "origin", "user-agent", "x-forwarded-for"];

async function forward(request: NextRequest, { params }: RouteContext<"/admin/api/[...path]">) {
  const path = (await params).path.join("/");
  if (!SAFE_PATH.test(path)) {
    return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  }
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/admin/${path}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      // Raw bytes, so logo uploads pass through unchanged.
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      { error: { code: "unavailable", message: "The admin service is unavailable. Please try again." } },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  // Campaign changes (approval, pause, archive) show on this website at once;
  // product websites pick them up within their 30-second cache.
  if (hasBody && upstream.ok && path.startsWith("campaigns")) revalidateTag("campaigns", { expire: 0 });

  // Admin images (brand files) may be cached privately; everything else is never cached.
  const image = upstream.headers.get("content-type")?.startsWith("image/");
  const response = new Headers({ "cache-control": image ? "private, max-age=86400" : "no-store" });
  for (const name of ["content-type", "content-disposition", "content-security-policy"]) {
    const value = upstream.headers.get(name);
    if (value) response.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) response.append("set-cookie", cookie);
  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: response,
  });
}

export const GET = forward;
export const POST = forward;
