import type { AdminUser, StudioArea } from "@/lib/admin-client";

import type { AdminSite } from "./site-labels";

/*
 * The Studio's sidebar (owner's briefs, 8 Nov 2026): main tabs with nested
 * sub-tabs, each mapped to a page that already exists (no duplicate modules).
 * Each main tab has an area colour (`data-area`, tokens in @figbud/brand) used
 * in the sidebar, the top bar and the page's accent line. Hiding a tab here
 * never replaces the API's own permission checks.
 */

export type Area =
  "overview" | "websites" | "products" | "content" | "leads" | "pricing" | "publishing" | "settings";

export type NavSite = Pick<AdminSite, "slug" | "name" | "kind" | "status">;

export type NavLink = {
  href: string;
  label: string;
  /** Shown after the label (e.g. "Coming soon"), for people as well as screen readers. */
  note?: string;
  /** Nested links, shown while this link or one of them is the current page. */
  children?: NavLink[];
};

export type NavGroup = {
  id: Area;
  label: string;
  /** A group without sub-tabs is a plain link. */
  href?: string;
  links: NavLink[];
};

const ROLE_RANK: Record<AdminUser["role"], number> = { viewer: 0, editor: 1, reviewer: 2, owner: 3 };

/** A website's own tools, as on its overview page. */
export function siteTools(site: NavSite): NavLink[] {
  const base = `/admin/sites/${site.slug}`;
  return [
    { href: base, label: "Website overview" },
    { href: `${base}/pages`, label: "Page builder" },
    { href: `${base}/hero`, label: "Hero management" },
    { href: `${base}/website`, label: "Navigation & enquiries" },
    { href: `${base}/footer`, label: "Footer" },
    // Brand & Theme Studio (11 Nov 2026), for the product websites.
    ...(site.kind === "product" ? [{ href: `${base}/theme`, label: "Colours & themes" }] : []),
    ...(site.kind === "corporate" ? [{ href: `${base}/section-themes`, label: "Section themes" }] : []),
    { href: `${base}/seo`, label: "Website SEO" },
  ];
}

/**
 * The sidebar for this person. `context` is the website being worked on (the
 * one in the address, else the last one opened, else FigBud Global): brand,
 * media and pricing links follow it.
 */
export function studioNav(
  user: Pick<AdminUser, "role" | "modules">,
  sites: NavSite[],
  context: string | null,
): NavGroup[] {
  const owner = ROLE_RANK[user.role] >= ROLE_RANK.owner;
  const current =
    sites.find((s) => s.slug === context) ?? sites.find((s) => s.kind === "corporate") ?? sites[0];
  const products = sites.filter((s) => s.kind === "product");
  return [
    { id: "overview", label: "Overview", href: "/admin", links: [] },
    {
      id: "websites",
      label: "Websites",
      links: [
        { href: "/admin/sites", label: "All websites" },
        ...sites.map((site) => ({
          href: `/admin/sites/${site.slug}`,
          label: site.name,
          note: site.status === "coming_soon" ? "Coming soon" : undefined,
          children: siteTools(site),
        })),
        ...(owner ? [{ href: "/admin/sites/new", label: "New website" }] : []),
      ],
    },
    {
      id: "products",
      label: "Products & Branding",
      links: current
        ? [
            { href: `/admin/sites/${current.slug}/brand`, label: "Logos & brand colours" },
            ...(current.kind === "product"
              ? [{ href: `/admin/sites/${current.slug}/theme`, label: "Colours & themes" }]
              : []),
            { href: `/admin/sites/${current.slug}/media`, label: "Media library" },
            ...sites
              .filter((s) => s.kind === "corporate")
              .map((s) => ({ href: `/admin/sites/${s.slug}/platforms`, label: "Our Platforms showcase" })),
          ]
        : [],
    },
    {
      id: "content",
      label: "Content & Marketing",
      links: [
        { href: "/admin/content", label: "Content library" },
        { href: "/admin/marketing", label: "Campaigns & promotions" },
        { href: "/admin/insights", label: "Insights" },
        { href: "/admin/proof", label: "Customer proof" },
        { href: "/admin/seo", label: "SEO" },
      ],
    },
    {
      id: "leads",
      label: "Leads & Enquiries",
      links: [
        { href: "/admin/enquiries", label: "All enquiries" },
        { href: "/admin/enquiries?kind=demo_request", label: "Demo requests" },
        { href: "/admin/enquiries?kind=contact", label: "Contact enquiries" },
        { href: "/admin/enquiries?kind=referral", label: "Referrals" },
      ],
    },
    {
      id: "pricing",
      label: "Pricing Studio",
      links: products.flatMap((site) => [
        { href: `/admin/sites/${site.slug}/pricing`, label: `${site.name} pricing` },
        ...(site.slug === "zirahr"
          ? [{ href: `/admin/sites/${site.slug}/payroll-calculator`, label: "Payroll calculator" }]
          : []),
      ]),
    },
    {
      id: "publishing",
      label: "Publishing",
      links: [
        { href: "/admin/approvals", label: "Approvals" },
        { href: "/admin/activity", label: "Activity & history" },
      ],
    },
    {
      id: "settings",
      label: "Settings & Security",
      links: [
        { href: "/admin/settings", label: "General" },
        { href: "/admin/settings/team", label: "Users & access" },
        { href: "/admin/settings/security", label: "Security" },
        { href: "/admin/settings/privacy", label: "Privacy" },
        // The Studio's own colours (owner's brief, 12 Nov 2026).
        { href: "/admin/settings/appearance", label: "Appearance & themes" },
        // Which translations are published (P7-G2).
        { href: "/admin/settings/languages", label: "Languages" },
      ],
    },
  ]
    .map((group) => {
      const granted = user.modules;
      if (!granted) return group;
      return {
        ...group,
        links: withinAreas(group.links as NavLink[], (area) => Boolean(granted[area]?.length)),
      };
    })
    .filter((group) => group.href || group.links.length) as NavGroup[];
}

/**
 * The Studio area a page belongs to (P13-B3), as the API classifies its
 * requests (admin/modules.rs); `null` for pages everyone may open.
 */
export function areaOf(href: string): StudioArea | null {
  const path = href.split("?")[0]!;
  const site = /^\/admin\/sites\/[^/]+\/([^/]+)/.exec(path)?.[1];
  if (site) {
    const map: Record<string, StudioArea> = {
      hero: "hero",
      pages: "pages",
      website: "website_settings",
      footer: "website_settings",
      theme: "website_settings",
      "section-themes": "website_settings",
      platforms: "website_settings",
      brand: "branding",
      media: "branding",
      pricing: "pricing",
      "payroll-calculator": "pricing",
      seo: "seo",
    };
    return map[site] ?? null;
  }
  if (path === "/admin/sites/new") return "websites";
  if (path.startsWith("/admin/content")) return "content";
  if (path.startsWith("/admin/insights")) return "content";
  if (path.startsWith("/admin/marketing")) return "campaigns";
  if (path.startsWith("/admin/proof")) return "proof";
  if (path.startsWith("/admin/seo")) return "seo";
  if (path.startsWith("/admin/enquiries")) return "enquiries";
  if (path.startsWith("/admin/approvals")) return "publishing";
  return null;
}

/** Leaves out links to areas someone can't open (the API refuses them anyway). */
function withinAreas(links: NavLink[], allowed: (area: StudioArea) => boolean): NavLink[] {
  return links
    .filter((link) => {
      const area = areaOf(link.href);
      return area === null || allowed(area);
    })
    .map((link) => (link.children ? { ...link, children: withinAreas(link.children, allowed) } : link));
}

function flatten(links: NavLink[]): NavLink[] {
  return links.flatMap((link) => [link, ...flatten(link.children ?? [])]);
}

/**
 * The current page's link: the longest path that contains the address (so a
 * page deep inside a website keeps its tool highlighted). A link with a query
 * matches only that query; without one, it matches any.
 */
export function activeLink(groups: NavGroup[], pathname: string, search: string) {
  const params = new URLSearchParams(search);
  let best: { group: NavGroup; link: NavLink | null; score: number } | null = null;
  for (const group of groups) {
    const candidates: { href: string; link: NavLink | null }[] = group.href
      ? [{ href: group.href, link: null }]
      : flatten(group.links).map((link) => ({ href: link.href, link }));
    for (const { href, link } of candidates) {
      const [path, query] = href.split("?");
      const within = pathname === path || (path !== "/admin" && pathname.startsWith(`${path}/`));
      if (!within) continue;
      const wanted = new URLSearchParams(query ?? "");
      if ([...wanted].some(([key, value]) => params.get(key) !== value)) continue;
      // Longer paths win; a matching query beats the same path without one.
      const score = path!.length * 10 + [...wanted].length;
      if (!best || score > best.score) best = { group, link, score };
    }
  }
  return best;
}

/** The website slug in a Studio address, if any. */
export function siteInPath(pathname: string): string | null {
  const match = /^\/admin\/sites\/([a-z0-9]+(?:[_-][a-z0-9]+)*)(?:\/|$)/.exec(pathname);
  return match && match[1] !== "new" ? match[1]! : null;
}
