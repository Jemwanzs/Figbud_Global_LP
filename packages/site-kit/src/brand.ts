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

export interface ListedSite {
  slug: string;
  kind: "corporate" | "product";
  name: string;
  status: "coming_soon" | "beta" | "active";
  cta: "waitlist" | "early_access" | "demo";
  brand: BrandProfile | null;
  /** Shown on the corporate Africa expansion map (Admin → Websites → settings). */
  show_on_map?: boolean;
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

/**
 * Browser icons for a website: its published favicon and app icon, else the
 * built-in files in the app's `public/` (`icon.png`, `apple-icon.png`,
 * `favicon.ico`), which are made from the same official symbols. Published
 * files have unique, immutable URLs, so a new icon is never hidden by caches.
 */
export function brandIcons(brand?: BrandProfile | null) {
  const file = (asset: BrandAsset) => ({ url: `${BRAND_ASSET_PATH}${asset.id}`, type: asset.content_type });
  return {
    icon: brand?.favicon ? [file(brand.favicon)] : [{ url: "/icon.png", type: "image/png" }],
    apple: brand?.app_icon ? [file(brand.app_icon)] : [{ url: "/apple-icon.png", type: "image/png" }],
    shortcut: [{ url: "/favicon.ico" }],
  };
}
