import { localeProxy } from "@figbud/site-kit/server";

/** Locale-less URLs redirect to a locale; see `localeProxy`. */
export const proxy = localeProxy;

export const config = {
  // Skip Next.js internals, any path with a file extension (robots.txt, icons)
  // and brand logo files.
  matcher: ["/((?!_next|api|brand/assets|.*\\..*).*)"],
};
