import { LOCALE_COOKIE, isLocale, negotiateLocale } from "@figbud/i18n";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Redirects locale-less URLs (`/`, `/about`) to a locale-prefixed URL.
 * An explicit choice from the language switcher (cookie) wins over the
 * browser's `Accept-Language`.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return;

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = saved && isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}

export const config = {
  // Skip Next.js internals, API routes, the (English-only) admin area and any
  // path with a file extension (robots.txt, sitemap.xml, icons, images).
  matcher: ["/((?!_next|api|admin|.*\\..*).*)"],
};
