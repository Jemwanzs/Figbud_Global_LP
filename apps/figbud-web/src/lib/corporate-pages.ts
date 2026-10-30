import "server-only";

import { type Locale, localizePath } from "@figbud/i18n";
import type { HrefResolver, PageDocument } from "@figbud/site-kit";
import { cacheLife, cacheTag } from "next/cache";

import { apiBase } from "./products";

/** A corporate page published from the Studio (the `figbud` website). */
export interface CorporatePage extends PageDocument {
  title: string;
  published_at: string | null;
}

/**
 * The Studio's published version of a corporate page, or `null` when there
 * is none (the page then shows its built-in content or holding notice).
 * Cached for minutes, like the rest of the registry.
 */
export async function getCorporatePage(path: string): Promise<CorporatePage | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("sites", "site:figbud");
  try {
    const response = await fetch(`${apiBase}/v1/sites/figbud/page?path=${encodeURIComponent(path)}`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok ? ((await response.json()) as CorporatePage) : null;
  } catch {
    return null;
  }
}

/** Site paths in Studio content (`/contact`) as this locale's addresses (`/sw/contact`). */
export function localizedHrefs(locale: Locale): HrefResolver {
  return (href) => (href.startsWith("/") ? localizePath(locale, href) : href);
}
