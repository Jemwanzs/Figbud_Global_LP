/**
 * Published brand profiles from the website registry (`GET /v1/sites`,
 * managed in Admin → Websites → Branding). Logos are served by each website
 * itself at `/brand/assets/{id}` (see `brandAssetRoute` in ./server).
 */

import type { SiteSeo } from "./seo";

export interface BrandAsset {
  id: string;
  alt: string;
  content_type: string;
  width: number;
  height: number;
  /** Widths of the downscaled WebP copies (rasters only). */
  widths: number[];
}

/** One logo slot: the file for dark backgrounds and the one for light backgrounds. */
export interface BrandPair {
  on_dark: BrandAsset | null;
  on_light: BrandAsset | null;
}

export interface BrandProfile {
  logos: { horizontal: BrandPair; stacked: BrandPair; symbol: BrandPair; wordmark: BrandPair };
  favicon: BrandAsset | null;
  app_icon: BrandAsset | null;
  social_image: BrandAsset | null;
  colors: { primary: string; secondary: string; accent: string };
  logo_height: number;
}

/** A navigation or footer link: a page path on the website ("/platform") or an https:// address. */
export interface SiteLink {
  label: string;
  href: string;
}

/**
 * Per-website settings (Admin Studio → Websites → Navigation, footer & forms).
 * Missing means the defaults: the website's pages in the menu, enquiries open.
 */
export interface WebsiteSettings {
  navigation: { mode: "pages" | "custom"; items: SiteLink[] };
  footer: { note?: string | null; links: SiteLink[] };
  enquiries: { open: boolean; closed_message?: string | null };
  /** Section band colours (P7-E1); unset means the design system's neutral bands. */
  theme?: SiteTheme;
  /** Home page motion (UI-MO2): optional, slow product rotation. */
  motion?: { product_rotation: boolean; rotation_seconds: number };
  /** Our Platforms on the corporate home page (UI-MO5). */
  showcase?: Partial<ShowcaseSettings>;
  /** Hover previews on the menu (UI-NAV2), as published. */
  nav_previews?: NavPreviewSettings;
  /** Saved in the Studio, not published; only the Studio ever receives it. */
  nav_previews_draft?: NavPreviewSettings | null;
}

/** Must match `NAV_PREVIEW_ICONS` in `services/api/src/site_settings.rs`. */
export const NAV_PREVIEW_ICONS = [
  "sparkles",
  "compass",
  "book-open",
  "message-circle",
  "building",
  "users",
  "layers",
  "rocket",
  "shield",
  "chart",
  "globe",
  "wallet",
  "calendar",
  "briefcase",
  "phone",
  "lightbulb",
] as const;
export type NavPreviewIcon = (typeof NAV_PREVIEW_ICONS)[number];

export interface NavPreviewItem {
  /** A corporate menu key ("about") or a page path ("/platform"). */
  key: string;
  enabled?: boolean;
  icon?: string | null;
  headline?: string | null;
  description?: string | null;
}

export interface NavPreviewSettings {
  /** The website-wide switch; on unless switched off. */
  enabled?: boolean;
  items?: NavPreviewItem[];
}

/** What one preview shows. */
export interface NavPreviewContent {
  icon: string;
  headline: string;
  description: string;
}

const hasIcon = (icon?: string | null): icon is NavPreviewIcon =>
  (NAV_PREVIEW_ICONS as readonly string[]).includes(icon ?? "");

/**
 * The previews a website's menu shows, by menu key. `defaults` is the
 * website's own approved wording (FigBud Global has some; product websites
 * start with none, so nothing is copied between them). The Studio's wording
 * replaces it where `useEdits` allows; a link with no headline shows nothing.
 */
export function resolveNavPreviews(
  settings: NavPreviewSettings | null | undefined,
  defaults: Record<string, NavPreviewContent> = {},
  useEdits = true,
): Record<string, NavPreviewContent> {
  if (settings?.enabled === false) return {};
  const items = new Map((settings?.items ?? []).map((item) => [item.key, item]));
  const out: Record<string, NavPreviewContent> = {};
  for (const key of new Set([...Object.keys(defaults), ...items.keys()])) {
    const item = items.get(key);
    if (item?.enabled === false) continue;
    const base = defaults[key];
    const headline = (useEdits ? item?.headline : null) || base?.headline;
    if (!headline) continue;
    out[key] = {
      icon: hasIcon(item?.icon) ? item.icon : (base?.icon ?? "sparkles"),
      headline,
      description: (useEdits ? item?.description : null) || base?.description || "",
    };
  }
  return out;
}

/**
 * Our Platforms (Studio → FigBud Global → Our Platforms). Scroll-driven:
 * vertical scrolling moves through the products while the showcase stays in
 * view, then the page scrolls on. It pins only where the whole showcase fits
 * the screen, and never for reduced motion; otherwise it's the carousel.
 */
export interface ShowcaseSettings {
  scroll_driven: boolean;
  sticky: boolean;
  intensity: "subtle" | "standard" | "bold";
  smoothness: "direct" | "smooth" | "gentle";
  mobile: "swipe" | "scroll_where_comfortable";
  show_arrows: boolean;
  show_progress: boolean;
  /** Product slugs in display order; products not listed follow in their usual order. */
  order: string[];
}

export const DEFAULT_SHOWCASE: ShowcaseSettings = {
  scroll_driven: true,
  sticky: true,
  intensity: "standard",
  smoothness: "smooth",
  mobile: "swipe",
  show_arrows: true,
  show_progress: true,
  order: [],
};

/** Stored settings with the defaults filled in. */
export const showcaseSettings = (s?: Partial<ShowcaseSettings> | null): ShowcaseSettings => ({
  ...DEFAULT_SHOWCASE,
  ...s,
  order: s?.order ?? [],
});

/** Items in the configured order; the rest follow in their usual order. */
export function orderBySlug<T extends { slug: string }>(items: T[], order: string[]): T[] {
  const rank = (slug: string) => {
    const i = order.indexOf(slug);
    return i === -1 ? order.length : i;
  };
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.slug) - rank(b.item.slug) || a.i - b.i)
    .map(({ item }) => item);
}

export interface SiteTheme {
  /** Behind "brand" sections, with white text on it. */
  brand_section?: string | null;
  /** Behind "soft" sections in light mode; dark mode uses a deep tint of the brand band. */
  soft_section?: string | null;
}

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * CSS custom properties for a website's section bands, set on the element
 * that wraps its pages (the renderer, Studio previews). Only valid hex
 * colours pass, so nothing else reaches a style attribute.
 */
export function siteThemeStyle(theme?: SiteTheme | null): Record<string, string> {
  const style: Record<string, string> = {};
  if (theme?.brand_section && HEX.test(theme.brand_section)) style["--section-brand"] = theme.brand_section;
  if (theme?.soft_section && HEX.test(theme.soft_section)) style["--section-soft"] = theme.soft_section;
  return style;
}

/** Whether the website takes enquiries (open unless the Studio closed them). */
export const enquiriesOpen = (site?: Pick<ListedSite, "settings"> | null) =>
  site?.settings?.enquiries.open !== false;

export interface ListedSite {
  slug: string;
  kind: "corporate" | "product";
  name: string;
  tagline?: string | null;
  description?: string | null;
  category?: string;
  primary_domain?: string | null;
  status: "coming_soon" | "beta" | "active";
  cta: "waitlist" | "early_access" | "demo";
  brand: BrandProfile | null;
  /** Shown on the corporate Africa expansion map (Admin → Websites → settings). */
  show_on_map?: boolean;
  settings?: WebsiteSettings;
  /** Search identity (Studio → SEO & search visibility). */
  seo?: SiteSeo;
}

export const BRAND_ASSET_PATH = "/brand/assets/";

export const hasLogo = (pair?: BrandPair | null): pair is BrandPair =>
  Boolean(pair?.on_dark || pair?.on_light);

/** `src` and `srcSet` for showing `asset` at `cssWidth` pixels: the smallest copy that stays sharp. */
export function brandImageSources(
  asset: BrandAsset,
  cssWidth: number,
  basePath = BRAND_ASSET_PATH,
): { src: string; srcSet?: string } {
  const base = `${basePath}${asset.id}`;
  if (asset.content_type === "image/svg+xml" || asset.widths.length === 0) return { src: base };
  const pick = (needed: number) => {
    const width = asset.widths.find((w) => w >= needed);
    return width ? `${base}?w=${width}` : base;
  };
  const one = pick(cssWidth);
  const two = pick(cssWidth * 2);
  return { src: one, srcSet: one === two ? undefined : `${one} 1x, ${two} 2x` };
}

/** A square PNG icon rendered by the API from a published file. */
const iconPng = (asset: BrandAsset, size: number) => ({
  url: `${BRAND_ASSET_PATH}${asset.id}?icon=${size}`,
  type: "image/png",
  sizes: `${size}x${size}`,
});

/**
 * Browser icons for a website from its published favicon and app icon: the
 * SVG itself where the favicon is an SVG, PNGs at 16, 32 and 48 px for other
 * browsers, and a 180 px Apple touch icon. Without published icons, the
 * built-in files in the app's `public/` (`icon.png`, `apple-icon.png`,
 * `favicon.ico`), made from the same official symbols. Published files have
 * unique, immutable URLs, so a new icon is never hidden by caches.
 */
export function brandIcons(brand?: BrandProfile | null) {
  const favicon = brand?.favicon;
  const app = brand?.app_icon ?? favicon;
  return {
    icon: favicon
      ? [
          ...(favicon.content_type === "image/svg+xml"
            ? [{ url: `${BRAND_ASSET_PATH}${favicon.id}`, type: "image/svg+xml", sizes: "any" }]
            : []),
          iconPng(favicon, 32),
          iconPng(favicon, 16),
          iconPng(favicon, 48),
        ]
      : [{ url: "/icon.png", type: "image/png" }],
    apple: app ? [iconPng(app, 180)] : [{ url: "/apple-icon.png", type: "image/png" }],
    // Never fall back to another site's favicon.ico once this one has its own.
    shortcut: favicon ? [iconPng(favicon, 32)] : [{ url: "/favicon.ico" }],
  };
}

/** Installable-app icons (192 and 512 px) from the published app icon, for web manifests. */
export function brandManifestIcons(brand?: BrandProfile | null) {
  const app = brand?.app_icon ?? brand?.favicon;
  if (!app) return null;
  return [192, 512].map((size) => {
    const { url, type, sizes } = iconPng(app, size);
    return { src: url, type, sizes, purpose: "any" as const };
  });
}
