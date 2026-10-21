import "server-only";

import { type Locale, isLocale } from "@figbud/i18n";
import { notFound } from "next/navigation";

import { type Dictionary, getDictionary } from "@/i18n/get-dictionary";

/** Resolves and validates the `[locale]` param, returning its dictionary. */
export async function resolvePage(params: Promise<{ locale: string }>): Promise<{
  locale: Locale;
  dict: Dictionary;
}> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return { locale, dict: await getDictionary(locale) };
}
