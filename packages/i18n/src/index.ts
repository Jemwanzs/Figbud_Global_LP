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

/** Known locales from a list, once each, in the usual order. */
export function pageLocales(codes: readonly string[]): Locale[] {
  return locales.filter((l) => codes.includes(l));
}

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
export function hreflangAlternates(
  origin: string,
  path = "/",
  published: readonly Locale[] = indexableLocales,
): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const locale of published) {
    languages[localeInfo[locale].tag] = `${origin}${localizePath(locale, path)}`;
  }
  languages["x-default"] = `${origin}${localizePath(defaultLocale, path)}`;
  return languages;
}

/** Negotiates a locale from an `Accept-Language` header value. */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
  /** Languages a visitor may be sent to without choosing (default: reviewed ones). */
  allowed: readonly Locale[] = indexableLocales,
  /** Where visitors go when nothing matches (a website's default language). */
  otherwise: Locale = defaultLocale,
): Locale {
  if (!acceptLanguage) return otherwise;
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
    if (isLocale(base) && allowed.includes(base)) return base;
  }
  return otherwise;
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

/**
 * A website's languages (Studio → a website → Languages, P7-L1, owner's
 * brief, 14 Nov 2026): the ones it offers, the one it opens in and the one
 * that fills in text not translated yet (then English, the language every
 * page is written in). Stored in its settings; unset means `builtInLanguages`.
 */
export interface SiteLanguages {
  enabled: Locale[];
  default: Locale;
  fallback: Locale;
}

export type SiteKind = "corporate" | "product";

/** What a website offers before anyone sets its languages: FigBud Global its five, a product website English. */
export function builtInLanguages(kind: SiteKind): SiteLanguages {
  return {
    enabled: kind === "corporate" ? [...locales] : [defaultLocale],
    default: defaultLocale,
    fallback: defaultLocale,
  };
}

/**
 * The languages a website shows visitors now. `reviewed` are those published
 * with a recorded review (P7-G2). FigBud Global lists its unreviewed ones as
 * "In review" (decision D9); a product website shows only reviewed ones
 * (owner, 14 Nov 2026). A website opens only in English or a reviewed
 * language, and falls back only to one it shows.
 */
export function liveLanguages(
  config: Partial<SiteLanguages> | null | undefined,
  kind: SiteKind,
  reviewed: readonly string[],
): SiteLanguages {
  const chosen = pageLocales([defaultLocale, ...(config?.enabled ?? builtInLanguages(kind).enabled)]);
  const isReviewed = (l: Locale) => l === defaultLocale || reviewed.includes(l);
  const enabled = kind === "corporate" ? chosen : chosen.filter(isReviewed);
  const pick = (l: unknown, also: (l: Locale) => boolean) =>
    typeof l === "string" && isLocale(l) && enabled.includes(l) && also(l) ? l : defaultLocale;
  return {
    enabled,
    default: pick(config?.default, isReviewed),
    fallback: pick(config?.fallback, () => true),
  };
}

/** Where a text is looked for: the language itself, the website's fallback, then English. */
export function fallbackChain(locale: Locale, fallback: Locale): Locale[] {
  return [...new Set<Locale>([locale, fallback, defaultLocale])];
}
