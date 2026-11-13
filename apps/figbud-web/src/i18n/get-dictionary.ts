import "server-only";

import { type DeepPartial, type Locale, defaultLocale, fallbackChain, mergeDictionary } from "@figbud/i18n";

import { figbudLanguages } from "@/lib/locales";

import en, { type Dictionary } from "./dictionaries/en";

const overlays: Record<Locale, () => Promise<DeepPartial<Dictionary> | undefined>> = {
  en: async () => undefined,
  sw: () => import("./dictionaries/sw").then((m) => m.default),
  fr: () => import("./dictionaries/fr").then((m) => m.default),
  ar: () => import("./dictionaries/ar").then((m) => m.default),
  zh: () => import("./dictionaries/zh").then((m) => m.default),
};

/**
 * The text for a language: its translation over the website's fallback
 * language (Websites → FigBud Global → Languages, P7-L1) over English, so a
 * text not translated yet is never blank and never a raw key.
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === defaultLocale) return en;
  const { fallback } = await figbudLanguages();
  let dict = en;
  for (const code of fallbackChain(locale, fallback).reverse()) {
    if (code !== defaultLocale) dict = mergeDictionary(dict, await overlays[code]());
  }
  return dict;
}

export type { Dictionary };
