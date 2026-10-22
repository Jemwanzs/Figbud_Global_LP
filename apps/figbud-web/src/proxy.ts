import { localeProxy } from "@figbud/site-kit/server";

/** Locale-less URLs redirect to a locale; see `localeProxy`. */
export const proxy = localeProxy;

export const config = {
  // Skip Next.js internals, API routes, the (English-only) admin area and any
  // path with a file extension (robots.txt, sitemap.xml, icons, images).
  matcher: ["/((?!_next|api|admin|.*\\..*).*)"],
};
