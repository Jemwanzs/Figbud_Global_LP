import { brandManifestIcons } from "@figbud/site-kit";

import { getSite, pageHref } from "@/lib/sites";

/**
 * A website's web app manifest: its name and its published app icon at 192
 * and 512 px. `?site=` names the website and `own=1` means it is served from
 * its own domain (the layout links here with both).
 */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const slug = query.get("site") ?? "";
  const site = /^[a-z0-9_-]{1,40}$/.test(slug) ? await getSite(slug) : null;
  if (!site) return new Response("Not found", { status: 404 });
  const manifest = {
    name: site.name,
    short_name: site.name,
    description: site.tagline ?? undefined,
    start_url: pageHref(site.slug, query.get("own") === "1", ""),
    display: "standalone",
    background_color: "#120f0d",
    theme_color: site.brand?.colors.primary ?? "#120f0d",
    icons: brandManifestIcons(site.brand) ?? [{ src: "/icon.png", type: "image/png", sizes: "64x64" }],
  };
  return Response.json(manifest, {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=300" },
  });
}
