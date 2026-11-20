import { publicSegment, segmentSite } from "@figbud/brand";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Picks the website for a request (decision D16):
 * - a website's own domain (its `primary_domain` in the registry) is served
 *   from the root: `ziwa.example.com/platform` renders Ziwa's /platform;
 * - otherwise websites share this app's domain under a prefix: `/ziwa/platform`.
 * Own-domain requests are rewritten to the internal `/~{slug}` segment, which
 * can't be requested directly.
 */
const apiBase = (
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8080"
).replace(/\/$/, "");
const figbudOrigin = (process.env.NEXT_PUBLIC_FIGBUD_URL ?? "http://localhost:3000").replace(/\/$/, "");

let hosts: { map: Map<string, string>; at: number } = { map: new Map(), at: 0 };

/** Domain → website slug, refreshed at most once a minute. */
async function hostMap(): Promise<Map<string, string>> {
  if (Date.now() - hosts.at < 60_000) return hosts.map;
  try {
    const response = await fetch(`${apiBase}/v1/sites`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const sites = (await response.json()) as {
        slug: string;
        kind: string;
        primary_domain?: string | null;
      }[];
      const map = new Map(
        sites
          .filter((s) => s.kind === "product" && s.primary_domain)
          .map((s) => [s.primary_domain!.toLowerCase(), s.slug] as const),
      );
      hosts = { map, at: Date.now() };
    }
  } catch {
    // Keep the last known map; prefixed addresses keep working regardless.
  }
  return hosts.map;
}

let moved: { map: Map<string, string>; at: number } = { map: new Map(), at: 0 };

/** Old addresses of moved pages ("slug:/old" → "/new", P7-G1), refreshed at most once a minute. */
async function redirectMap(): Promise<Map<string, string>> {
  if (Date.now() - moved.at < 60_000) return moved.map;
  try {
    const response = await fetch(`${apiBase}/v1/redirects`, { signal: AbortSignal.timeout(3000) });
    if (response.ok) {
      const list = (await response.json()) as { site: string; from: string; to: string }[];
      moved = { map: new Map(list.map((r) => [`${r.site}:${r.from}`, r.to] as const)), at: Date.now() };
    }
  } catch {
    // Keep the last known list; pages themselves are unaffected.
  }
  return moved.map;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  const slug = (await hostMap()).get(host);

  const [, first = "", ...rest] = pathname.split("/");
  // A renamed website (Master Lender, formerly Ziwa LMS: owner's brief, 20 Nov
  // 2026): its old address forwards permanently (308) to the new one, the
  // same page and query, so links and bookmarks keep working.
  const segment = slug ? null : segmentSite(first);
  if (segment?.legacy) {
    const url = request.nextUrl.clone();
    url.pathname = `/${publicSegment(segment.slug)}${rest.length ? `/${rest.join("/")}` : ""}`;
    return NextResponse.redirect(url, 308);
  }
  // A moved page's old address forwards permanently (308) to where it lives now.
  const site = slug ?? segment!.slug;
  const path = slug ? pathname.replace(/\/$/, "") || "/" : `/${rest.join("/")}`.replace(/\/$/, "") || "/";
  const to = path !== "/" ? (await redirectMap()).get(`${site}:${path}`) : undefined;
  if (to) {
    const url = request.nextUrl.clone();
    url.pathname = slug ? to : `/${publicSegment(site)}${to === "/" ? "" : to}`;
    return NextResponse.redirect(url, 308);
  }
  // The new address serves the website under its internal slug.
  if (segment && segment.slug !== first) {
    const url = request.nextUrl.clone();
    url.pathname = `/${segment.slug}${rest.length ? `/${rest.join("/")}` : ""}`;
    return NextResponse.rewrite(url);
  }

  if (slug) {
    const url = request.nextUrl.clone();
    url.pathname = `/~${slug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }
  if (pathname.startsWith("/~") || pathname.startsWith("/%7E")) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (pathname === "/") {
    // The shared domain has no home of its own: visitors want FigBud Global.
    return NextResponse.redirect(`${figbudOrigin}/`, 307);
  }
  return NextResponse.next();
}

export const config = {
  // Skip Next.js internals, logo files, media images and any path with a file extension.
  matcher: ["/((?!_next|brand/assets|media/|.*\\..*).*)"],
};
