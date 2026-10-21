/**
 * Shared localisation architecture for every FigBud ecosystem website.
 *
 * Locales are routed by sub-path (`/en`, `/sw`, `/ar` …). A locale is only
 * indexable — listed in sitemaps and `hreflang` — once its translations have
 * passed human review (`status: "published"`). Draft locales still render for
 * review, fall back to English for missing strings and carry `noindex`.
 */

export const locales = ["en", "sw", "fr", "ar", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** Remembers an explicit language choice across visits. */
export const LOCALE_COOKIE = "fb-locale";

export type LocaleStatus = "published" | "draft";

export interface LocaleInfo {
  code: Locale;
  /** BCP 47 tag used for `<html lang>` and `hreflang`. */
  tag: string;
  /** Endonym shown in the language switcher. */
  label: string;
  /** Short label for compact controls. */
  short: string;
  dir: "ltr" | "rtl";
  status: LocaleStatus;
}

export const localeInfo: Record<Locale, LocaleInfo> = {
  en: { code: "en", tag: "en", label: "English", short: "EN", dir: "ltr", status: "published" },
  sw: { code: "sw", tag: "sw", label: "Kiswahili", short: "SW", dir: "ltr", status: "draft" },
  fr: { code: "fr", tag: "fr", label: "Français", short: "FR", dir: "ltr", status: "draft" },
  ar: { code: "ar", tag: "ar", label: "العربية", short: "AR", dir: "rtl", status: "draft" },
  zh: { code: "zh", tag: "zh-Hans", label: "中文", short: "中文", dir: "ltr", status: "draft" },
};

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function isIndexable(locale: Locale): boolean {
  return localeInfo[locale].status === "published";
}

export const indexableLocales = locales.filter(isIndexable);

/** Prefixes a locale-agnostic path (`/about`) with a locale (`/sw/about`). */
export function localizePath(locale: Locale, path = "/"): string {
  const clean = path === "/" || path === "" ? "" : path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

/** Removes a leading locale segment: `/sw/about` → `/about`. */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (first && isLocale(first)) {
    const remainder = `/${rest.join("/")}`;
    return remainder === "/" ? "/" : remainder.replace(/\/$/, "");
  }
  return pathname || "/";
}

/**
 * Builds `alternates.languages` for Next.js metadata: only reviewed locales,
 * plus `x-default` pointing to the default locale.
 */
export function hreflangAlternates(origin: string, path = "/"): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of indexableLocales) {
    languages[localeInfo[locale].tag] = `${origin}${localizePath(locale, path)}`;
  }
  languages["x-default"] = `${origin}${localizePath(defaultLocale, path)}`;
  return languages;
}

/** Negotiates a locale from an `Accept-Language` header value. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [range = "", ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { range: range.toLowerCase(), q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((entry) => entry.range && entry.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { range } of ranked) {
    const base = range.split("-")[0] ?? "";
    if (isLocale(base) && isIndexable(base)) return base;
  }
  return defaultLocale;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Overlays a partial translation onto the complete source dictionary. */
export function mergeDictionary<T extends object>(base: T, overlay: DeepPartial<T> | undefined): T {
  if (!overlay) return base;
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    const current = result[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current !== null &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      result[key] = mergeDictionary(current as object, value as DeepPartial<object>);
    } else {
      result[key] = value;
    }
  }
  return result as T;
}
