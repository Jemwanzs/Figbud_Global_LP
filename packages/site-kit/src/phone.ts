/**
 * Country and phone data for forms (UI-F1), usable on the server, in tests
 * and in the browser. Country and calling-code data come from libphonenumber
 * metadata (bundled and versioned with the package, no network calls);
 * names from `Intl.DisplayNames`, so they follow the page language. The API
 * validates the same way (Rust `phonenumber`) and stores numbers in E.164.
 */

import {
  type CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
} from "libphonenumber-js";

export type { CountryCode };

export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: CountryCode;
  name: string;
  /** International calling code without "+"; several countries can share one (+1, +7, +44…). */
  dial: string;
  flag: string;
}

/** Shown first, in this order: FigBud's first markets. */
export const SUGGESTED: CountryCode[] = ["KE", "UG", "TZ", "RW", "ET", "NG", "GH", "ZA"];

/** A flag emoji from regional-indicator letters. */
export const flagOf = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const cache = new Map<string, Country[]>();

/** Every country with a telephone numbering plan, named in `locale`, sorted by name. */
export function countries(locale = "en"): Country[] {
  const cached = cache.get(locale);
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale, "en"], { type: "region" });
  } catch {
    names = null;
  }
  const list = getCountries()
    .map((code) => ({
      code,
      name: names?.of(code) ?? code,
      dial: getCountryCallingCode(code),
      flag: flagOf(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
  cache.set(locale, list);
  return list;
}

export const isCountryCode = (code: string | null | undefined): code is CountryCode =>
  Boolean(code && (getCountries() as string[]).includes(code.toUpperCase()));

export interface PhoneEntry {
  country: CountryCode;
  /** As typed (national, or international with "+"). */
  number: string;
}

/** The number in E.164 if it's valid for its country (or the "+" prefix), else null. */
export function phoneE164(entry: PhoneEntry): string | null {
  const raw = entry.number.trim();
  if (!raw) return null;
  const parsed = raw.startsWith("+")
    ? parsePhoneNumberFromString(raw)
    : parsePhoneNumberFromString(raw, entry.country);
  return parsed?.isValid() ? parsed.number : null;
}
