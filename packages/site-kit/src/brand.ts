/**
 * Published brand profiles from the website registry (`GET /v1/sites`,
 * managed in Admin → Websites → Branding). Logos are served by each website
 * itself at `/brand/assets/{id}` (see `brandAssetRoute` in ./server).
 */

import type { SiteLanguages } from "@figbud/i18n";

import type { EnquiryFormConfig } from "./enquiry";

import type { StudioTheme } from "./site-theme";
import type { DemoIdentities } from "./demo-identities";
import type { DeviceExperience } from "./device-experience";
import type { TestimonialsDisplay } from "./proof";
import type { DisplayDefaults, ResultsDisplay, SuccessStoryConfig } from "./results";
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
  /** What the website's header shows (Brand → Header); "auto" when unset. */
  header_logo?: "auto" | "logo" | "symbol_and_name";
}

/** A navigation or footer link: a page path on the website ("/platform") or an https:// address. */
export interface SiteLink {
  label: string;
  href: string;
}

/** Must match `SocialNetwork` in `services/api/src/site_settings.rs`. */
export type FooterSocialNetwork =
  "linkedin" | "x" | "facebook" | "instagram" | "youtube" | "tiktok" | "android" | "apple";

/**
 * A website's footer (Studio → a website → Footer; owner's brief, 7 Nov 2026).
 * Empty text means the website's built-in wording.
 */
export interface SiteFooterSettings {
  /** A short introduction under the tagline. */
  note?: string | null;
  /** The older single list of links, shown as one group while `groups` is empty. */
  links: SiteLink[];
  tagline?: string | null;
  groups?: { title: string; links: SiteLink[] }[];
  cta?: {
    show: boolean;
    heading?: string | null;
    body?: string | null;
    label?: string | null;
    href?: string | null;
  };
  /** An empty address shows the icon without a link, until one is added. */
  social?: { network: FooterSocialNetwork; href: string }[];
  /** No social icons at all; otherwise, with none configured, the common networks show unlinked. */
  hide_social_icons?: boolean;
  contact?: { email?: string | null; phone?: string | null };
  hidden?: boolean;
}

/**
 * Per-website settings (Admin Studio → Websites → Navigation, footer & forms).
 * Missing means the defaults: the website's pages in the menu, enquiries open.
 */
export interface WebsiteSettings {
  navigation: { mode: "pages" | "custom"; items: SiteLink[] };
  footer: SiteFooterSettings;
  /** The footer being edited in the Studio (only the Studio ever receives it). */
  footer_draft?: SiteFooterSettings | null;
  /** FigBud Global's home page section themes (Studio → Section themes), as published. */
  section_themes?: Partial<Record<string, "follow" | "inverse">>;
  /** Saved in the Studio, not published. */
  section_themes_draft?: Partial<Record<string, "follow" | "inverse">> | null;
  enquiries: {
    open: boolean;
    closed_message?: string | null;
    /** The main button's action (P8-M8); unset is the enquiry form. */
    action?: "contact" | "start_now" | "book_demo";
  };
  /** The website's enquiry form (UI-EF3), as published; unset means the form as built. */
  enquiry_form?: EnquiryFormConfig | null;
  /** The Results band's display (P10-R1); unset: as before, with the display defaults. */
  results?: ResultsDisplay | null;
  /** Saved in the Studio, not published; only the Studio ever receives it. */
  results_draft?: ResultsDisplay | null;
  /** The testimonial band's layout and spacing (P10-R4); unset: automatic and compact. */
  testimonials?: TestimonialsDisplay | null;
  /** Saved in the Studio, not published. */
  testimonials_draft?: TestimonialsDisplay | null;
  /** "Our Success Story" (P10-R2); websites receive it only while it's on. */
  success_story?: SuccessStoryConfig | null;
  /** Saved in the Studio, not published. */
  success_story_draft?: SuccessStoryConfig | null;
  /** The last published stories, newest first (the Studio's history; never sent to websites). */
  story_history?: { published_at: string; by?: string | null; story: SuccessStoryConfig }[];
  /** Website display: FigBud Global's defaults, or this website's own (P10-R1). */
  display?: DisplayDefaults | null;
  /** Sample identities (P14-W10), on FigBud Global: active people in order and each website's lead. */
  demo_identities?: DemoIdentities | null;
  /** Saved in the Studio, not published. */
  demo_identities_draft?: DemoIdentities | null;
  /** Published sets, newest first (Studio only). */
  demo_identities_history?: { published_at: string; by?: string | null; identities: DemoIdentities }[];
  /** Device experience (P14-W8); websites receive it only once published and on. */
  devices?: DeviceExperience | null;
  /** Saved in the Studio, not published; only the Studio ever receives it. */
  devices_draft?: DeviceExperience | null;
  /** The last published device settings, newest first (Studio only). */
  devices_history?: { published_at: string; by?: string | null; devices: DeviceExperience }[];
  /** Saved in the Studio, not published; only the Studio ever receives it. */
  enquiry_form_draft?: EnquiryFormConfig | null;
  /** The Brand & Theme Studio's colours, section bands included; unset means the built-in ones. */
  theme?: SiteTheme;
  /** The theme being edited in the Studio (only the Studio ever receives it). */
  theme_draft?: SiteTheme | null;
  /** Published themes, newest first, for rollback (kept by the API; Studio only). */
  theme_history?: { published_at: string; by?: string | null; theme: SiteTheme }[];
  /** The website's languages (P7-L1); unset means `builtInLanguages` for its kind. */
  languages?: SiteLanguages | null;
  /** Saved in the Studio, not published; only the Studio ever receives it. */
  languages_draft?: SiteLanguages | null;
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

/**
 * A website's theme (Colours & themes). The section bands are part of it
 * (`bands`, owner's brief, 13 Nov 2026): they inherit from its colours unless
 * overridden, and reach the website through `siteThemeCss`.
 */
export type SiteTheme = StudioTheme;

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

/**
 * Whether a website's header shows its full logo (owner's brief, 20 Nov
 * 2026): as chosen in Brand → Header; automatically, unless the logo's
 * artwork names the product differently from its published name (as its
 * text alternative records, e.g. "Ziwa LMS" for Master Lender), so a renamed
 * product shows its symbol and new name with no artwork changed. Without a
 * symbol, the logo stays (there is nothing else to show).
 */
export function headerShowsLogo(brand: BrandProfile | null | undefined, name: string): boolean {
  if (!hasLogo(brand?.logos.horizontal)) return false;
  if (!hasLogo(brand.logos.symbol)) return true;
  const mode = brand.header_logo ?? "auto";
  if (mode !== "auto") return mode === "logo";
  const words = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const alts = [brand.logos.horizontal.on_light?.alt, brand.logos.horizontal.on_dark?.alt].filter(
    (a): a is string => Boolean(a?.trim()),
  );
  return !alts.length || alts.some((alt) => words(alt).includes(words(name)));
}

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
