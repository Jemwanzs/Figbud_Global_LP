import type { MetadataRoute } from "next";

import { allowIndexing, siteOrigin } from "@/lib/site";

/** Closed to crawlers until production indexing is enabled. */
export default function robots(): MetadataRoute.Robots {
  return allowIndexing
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${siteOrigin}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
