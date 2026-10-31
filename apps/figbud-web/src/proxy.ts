import { localeProxy } from "@figbud/site-kit/server";

/** Locale-less URLs redirect to a locale; see `localeProxy`. */
export const proxy = localeProxy;

export const config = {
  // Skip Next.js internals, API routes, the (English-only) admin area and any
  // path with a file extension (robots.txt, sitemap.xml, icons, images), and
  // brand logo files, and customer quotation links (/quote, P11).
  matcher: ["/((?!_next|api|admin|quote|brand/assets|media/|.*\\..*).*)"],
};
