import { LOCALE_COOKIE, type SiteLanguages, isLocale, negotiateLocale } from "@figbud/i18n";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Redirects locale-less URLs (`/`, `/about`) to a locale-prefixed URL.
 * An explicit choice from the language switcher (cookie) wins over the
 * browser's `Accept-Language`, then the website's default language. With
 * `languages` (the website's own, P7-L1), a language it has switched off
 * sends visitors to the same page in its default language. Each app exports
 * it from `src/proxy.ts` with its own literal `config.matcher`.
 */
export function localeProxy(request: NextRequest) {
  return websiteLocaleProxy(request, null);
}

/**
 * `localeProxy` for a website with its own languages (P7-L1). A separate
 * name: Next.js calls a proxy with a second argument (its event), so the
 * plain proxy must never read one.
 */
export function websiteLocaleProxy(request: NextRequest, languages: SiteLanguages | null) {
  const { pathname } = request.nextUrl;
  const [, first = "", ...rest] = pathname.split("/");
  const url = request.nextUrl.clone();
  if (isLocale(first)) {
    if (!languages || languages.enabled.includes(first)) return;
    url.pathname = `/${languages.default}${rest.length && rest.join("/") ? `/${rest.join("/")}` : ""}`;
    return NextResponse.redirect(url, 307);
  }

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const offered = (l: string) => isLocale(l) && (!languages || languages.enabled.includes(l));
  const locale =
    saved && isLocale(saved) && offered(saved)
      ? saved
      : negotiateLocale(request.headers.get("accept-language"), undefined, languages?.default);

  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, 307);
}
