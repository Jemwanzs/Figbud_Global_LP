import type { BrandAsset, BrandPair } from "@figbud/site-kit";

/** Admin view of the brand files and profiles (services/api/src/brand). */

export const ADMIN_ASSET_PATH = "/admin/api/brand/assets/";

export interface ThemePair {
  on_dark: string | null;
  on_light: string | null;
}

export interface BrandConfig {
  logos: { horizontal: ThemePair; stacked: ThemePair; symbol: ThemePair; wordmark: ThemePair };
  favicon: string | null;
  app_icon: string | null;
  social_image: string | null;
  colors: { primary: string; secondary: string; accent: string };
  logo_height: number;
}

export interface Placement {
  slot: string;
  theme: "dark" | "light" | null;
}

export interface LibraryAsset {
  id: string;
  label: string;
  alt_text: string;
  content_type: string;
  width: number;
  height: number;
  has_alpha: boolean;
  byte_size: number;
  origin: "official" | "proposed" | "upload";
  archived_at: string | null;
  created_at: string;
  widths: number[];
  used_in: { draft: Placement[]; published: Placement[]; pending: Placement[] };
}

export interface BrandCheck {
  id: string;
  label: string;
  required: boolean;
  ok: boolean;
  ratio?: number;
}

export interface BrandRevision {
  id: string;
  number: number;
  note: string;
  state: "pending" | "published" | "rejected" | "cancelled";
  requested_by: string | null;
  requested_by_id: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface BrandStudioData {
  draft: BrandConfig;
  draft_version: number;
  draft_note: string | null;
  draft_updated_at: string;
  draft_updated_by: string | null;
  draft_differs: boolean;
  checks: BrandCheck[];
  publishable: boolean;
  published: BrandConfig | null;
  published_revision: string | null;
  published_at: string | null;
  assets: LibraryAsset[];
  revisions: BrandRevision[];
}

export type LogoSlot = keyof BrandConfig["logos"];
export type SingleSlot = "favicon" | "app_icon" | "social_image";

export const LOGO_SLOTS: { key: LogoSlot; label: string; hint: string }[] = [
  { key: "horizontal", label: "Horizontal logo", hint: "Headers, footers and product cards" },
  { key: "stacked", label: "Stacked logo", hint: "Square spaces, splash screens" },
  { key: "symbol", label: "Symbol", hint: "Icon tiles, menus and small spaces" },
  { key: "wordmark", label: "Wordmark", hint: "Name only, where the symbol already shows" },
];

export const SINGLE_SLOTS: { key: SingleSlot; label: string; hint: string }[] = [
  { key: "favicon", label: "Favicon", hint: "Square; browser tabs" },
  { key: "app_icon", label: "App icon", hint: "Square, at least 180 px; home screens" },
  { key: "social_image", label: "Social sharing image", hint: "About 1200 × 630 px" },
];

export const ORIGIN_LABELS: Record<LibraryAsset["origin"], string> = {
  official: "Official",
  proposed: "Proposed",
  upload: "Uploaded",
};

export const SLOT_LABELS: Record<string, string> = {
  horizontal: "Horizontal",
  stacked: "Stacked",
  symbol: "Symbol",
  wordmark: "Wordmark",
  favicon: "Favicon",
  app_icon: "App icon",
  social_image: "Social image",
};

export const placementText = (p: Placement) =>
  `${SLOT_LABELS[p.slot] ?? p.slot}${p.theme ? ` (${p.theme} backgrounds)` : ""}`;

export const toBrandAsset = (a: LibraryAsset): BrandAsset => ({
  id: a.id,
  alt: a.alt_text,
  content_type: a.content_type,
  width: a.width,
  height: a.height,
  widths: a.widths,
});

/** A slot's files, ready for `BrandLogo`. */
export function resolvePair(pair: ThemePair, assets: Map<string, LibraryAsset>): BrandPair {
  const get = (id: string | null) => {
    const asset = id ? assets.get(id) : undefined;
    return asset ? toBrandAsset(asset) : null;
  };
  return { on_dark: get(pair.on_dark), on_light: get(pair.on_light) };
}

export const fileSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
