import { headers } from "next/headers";

import {
  allowIndexing,
  canonicalUrl,
  getListedSites,
  getPages,
  getPayrollCalculator,
  pageUrls,
  siteLanguages,
} from "@/lib/sites";

/**
 * Published pages of listed product websites. On a website's own domain,
 * only that website's pages; on the shared domain, every website's.
 */
export async function GET() {
  const host = ((await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  const sites = (await getListedSites()).filter((s) => s.kind === "product");
  const own = sites.find((s) => s.primary_domain?.toLowerCase() === host);
  const urls: { loc: string; lastmod: string | null }[] = [];
  if (allowIndexing) {
    // Websites with indexing switched off in the Studio aren't listed.
    for (const site of (own ? [own] : sites).filter((s) => s.seo?.indexing !== false)) {
      // Pages kept out of search engines in the Studio aren't listed; their
      // published translations are, in the languages the website shows (P7-L2b).
      const shown: string[] = await siteLanguages(site);
      for (const page of (await getPages(site.slug)).filter((p) => !p.noindex)) {
        for (const loc of pageUrls(site, Boolean(own), page, shown))
          urls.push({ loc, lastmod: page.published_at });
      }
      // The built-in calculator page, only while it's switched on.
      if (await getPayrollCalculator(site.slug)) {
        urls.push({ loc: canonicalUrl(site, Boolean(own), "payroll-calculator"), lastmod: null });
      }
    }
  }
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
  return new Response(body, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
