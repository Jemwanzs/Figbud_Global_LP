import { type SiteLanguages, liveLanguages } from "@figbud/i18n";
import { websiteLocaleProxy } from "@figbud/site-kit/server";
import type { NextRequest } from "next/server";

const apiBase = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"
).replace(/\/$/, "");

let cached: { languages: SiteLanguages | null; at: number } = { languages: null, at: 0 };

/**
 * FigBud Global's languages (Websites → FigBud Global → Languages, P7-L1),
 * refreshed at most once a minute. Without the API, the last known ones, or
 * none (every language routes, as before).
 */
async function languages(): Promise<SiteLanguages | null> {
  if (Date.now() - cached.at < 60_000) return cached.languages;
  try {
    const [sites, locales] = await Promise.all(
      ["/v1/sites", "/v1/locales"].map((path) =>
        fetch(`${apiBase}${path}`, { signal: AbortSignal.timeout(3000) }).then((r) =>
          r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
        ),
      ),
    );
    const config = (sites as { slug: string; settings?: { languages?: SiteLanguages | null } }[]).find(
      (s) => s.slug === "figbud",
    )?.settings?.languages;
    const reviewed = (locales as { published?: string[] }).published ?? ["en"];
    cached = { languages: liveLanguages(config, "corporate", reviewed), at: Date.now() };
  } catch {
    cached = { ...cached, at: Date.now() };
  }
  return cached.languages;
}

/** Locale-less URLs redirect to a locale; switched-off languages to the default one. See `websiteLocaleProxy`. */
export async function proxy(request: NextRequest) {
  return websiteLocaleProxy(request, await languages());
}

export const config = {
  // Skip Next.js internals, API routes, the (English-only) admin area and any
  // path with a file extension (robots.txt, sitemap.xml, icons, images), and
  // brand logo files, and customer quotation links (/quote, P11).
  matcher: ["/((?!_next|api|admin|quote|brand/assets|media/|.*\\..*).*)"],
};
