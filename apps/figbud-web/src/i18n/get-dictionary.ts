import "server-only";

import { type DeepPartial, type Locale, defaultLocale, mergeDictionary } from "@figbud/i18n";

import en, { type Dictionary } from "./dictionaries/en";

const overlays: Record<Locale, () => Promise<DeepPartial<Dictionary> | undefined>> = {
  en: async () => undefined,
  sw: () => import("./dictionaries/sw").then((m) => m.default),
  fr: () => import("./dictionaries/fr").then((m) => m.default),
  ar: () => import("./dictionaries/ar").then((m) => m.default),
  zh: () => import("./dictionaries/zh").then((m) => m.default),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  if (locale === defaultLocale) return en;
  return mergeDictionary(en, await overlays[locale]());
}

export type { Dictionary };
