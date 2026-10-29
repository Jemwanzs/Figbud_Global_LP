/**
 * Published brand profiles from the website registry (`GET /v1/sites`,
 * managed in Admin → Websites → Branding). Logos are served by each website
 * itself at `/brand/assets/{id}` (see `brandAssetRoute` in ./server).
 */

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
