import type { PlatformEntry } from "@figbud/i18n";

/** One built-in entry of the Platform menu (owner's brief, 14 Nov 2026). */
export interface PlatformMenuEntry {
  entry: PlatformEntry;
  href: string;
  /** The website page it's on, for its translations. */
  path?: string;
  /** A place on that page ("modules"). */
  hash?: string;
}

/**
 * The Platform submenu, from what a website actually publishes, so nothing
 * hidden or switched off appears: the Platform page and its module tour, the
 * payroll calculator while it's on, pricing while the Studio shows it on the
 * website (Pricing Studio → Publishing; never a draft), and an Integrations
 * page while it's published and shown in navigation. Empty without a
 * published Platform page.
 */
export function platformMenu({
  pages,
  platformSections,
  payrollOn,
  pricingShown,
  href,
}: {
  /** The website's published pages. */
  pages: { path: string; show_in_nav?: boolean }[];
  /** The Platform page's sections, as published. */
  platformSections: { type: string; hidden?: boolean }[];
  payrollOn: boolean;
  pricingShown: boolean;
  /** A page's address on this website. */
  href: (path: string) => string;
}): PlatformMenuEntry[] {
  if (!pages.some((p) => p.path === "platform")) return [];
  const overview = href("platform");
  const entries: PlatformMenuEntry[] = [{ entry: "overview", href: overview, path: "platform" }];
  if (platformSections.some((s) => s.type === "modules" && !s.hidden))
    entries.push({ entry: "modules", href: `${overview}#modules`, path: "platform", hash: "modules" });
  if (payrollOn) entries.push({ entry: "payroll", href: href("payroll-calculator") });
  if (pricingShown) entries.push({ entry: "pricing", href: href("pricing") });
  // Only while it's shown in navigation: a page hidden from the menu stays hidden here too.
  if (pages.some((p) => p.path === "integrations" && p.show_in_nav !== false))
    entries.push({ entry: "integrations", href: href("integrations"), path: "integrations" });
  return entries;
}
