import { headers } from "next/headers";

import { allowIndexing } from "@/lib/sites";

/** Indexing only when explicitly enabled (production); the sitemap is on the requested host. */
export async function GET() {
  const host = (await headers()).get("host") ?? "";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const body = allowIndexing
    ? `User-agent: *\nAllow: /\n\nSitemap: ${proto}://${host}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
