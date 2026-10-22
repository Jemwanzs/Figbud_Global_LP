import { LOCALE_COOKIE, isLocale, negotiateLocale } from "@figbud/i18n";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Redirects locale-less URLs (`/`, `/about`) to a locale-prefixed URL.
 * An explicit choice from the language switcher (cookie) wins over the
 * browser's `Accept-Language`. Each app exports it from `src/proxy.ts`
 * with its own literal `config.matcher`.
 */
export function localeProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return;

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = saved && isLocale(saved) ? saved : negotiateLocale(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}
