import type { MetadataRoute } from "next";

import { allowIndexing, siteOrigin } from "@/lib/site";

/** Staging, previews and local builds are never indexable. */
export default function robots(): MetadataRoute.Robots {
  if (!allowIndexing) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteOrigin}/sitemap.xml`,
    host: siteOrigin,
  };
}
