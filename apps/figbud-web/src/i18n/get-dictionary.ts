import "server-only";

import { type DeepPartial, type Locale, defaultLocale, fallbackChain, mergeDictionary } from "@figbud/i18n";

import { getProduct } from "@figbud/brand";

import { figbudLanguages } from "@/lib/locales";
import { getPublicProducts } from "@/lib/products";

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
  if (locale === defaultLocale) return withLiveNames(en);
  const { fallback } = await figbudLanguages();
  let dict = en;
  for (const code of fallbackChain(locale, fallback).reverse()) {
    if (code !== defaultLocale) dict = mergeDictionary(dict, await overlays[code]());
  }
  return withLiveNames(dict);
}

/**
 * Product names as published (owner's brief, 20 Nov 2026, Master Lender):
 * the copy names products as the registry does; a website renamed in the
 * Studio (Websites → Manage sites) is called by its published name in every
 * language, with no code change. Brand names are never translated.
 */
async function withLiveNames(dict: Dictionary): Promise<Dictionary> {
  const pairs = (await getPublicProducts())
    .map((p) => [getProduct(p.slug).name, p.name] as const)
    .filter(([registry, live]) => live && registry !== live);
  if (!pairs.length) return dict;
  const rename = (value: unknown): unknown => {
    if (typeof value === "string") return pairs.reduce((s, [from, to]) => s.split(from).join(to), value);
    if (Array.isArray(value)) return value.map(rename);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v)]));
    return value;
  };
  return rename(dict) as Dictionary;
}

export type { Dictionary };
