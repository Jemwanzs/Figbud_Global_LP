import "server-only";

import type { Locale } from "@figbud/i18n";

import ar from "@/i18n/dictionaries/ar";
import en from "@/i18n/dictionaries/en";
import fr from "@/i18n/dictionaries/fr";
import sw from "@/i18n/dictionaries/sw";
import zh from "@/i18n/dictionaries/zh";

const OVERLAYS: Record<Exclude<Locale, "en">, unknown> = { sw, fr, ar, zh };

/** Every text in a dictionary, by its path ("home.hero.title"). */
function leaves(value: unknown, path = "", out = new Map<string, string>()) {
  if (typeof value === "string") out.set(path, value);
  else if (Array.isArray(value)) value.forEach((v, i) => leaves(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) leaves(v, path ? `${path}.${k}` : k, out);
  return out;
}

export interface Coverage {
  translated: number;
  total: number;
  /** A few texts still shown in English, by path. */
  missing: string[];
}

/** How much of the English text each draft language translates (P7-G2). */
export function translationCoverage(): Record<Exclude<Locale, "en">, Coverage> {
  const english = leaves(en);
  return Object.fromEntries(
    Object.entries(OVERLAYS).map(([code, overlay]) => {
      const own = leaves(overlay);
      const missing = [...english.keys()].filter((k) => !own.get(k)?.trim());
      return [
        code,
        { translated: english.size - missing.length, total: english.size, missing: missing.slice(0, 6) },
      ];
    }),
  ) as Record<Exclude<Locale, "en">, Coverage>;
}
