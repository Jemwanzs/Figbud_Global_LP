import type { ProductSlug } from "@figbud/brand";
import { BrandLogo, type BrandProfile, ProductGlyph, hasLogo } from "@figbud/site-kit";
import { cn } from "@figbud/ui";

export type SiteStatus = "draft" | "coming_soon" | "beta" | "active" | "retired";

export interface AdminSite {
  id: string;
  slug: string;
  kind: "corporate" | "product";
  name: string;
  tagline?: string | null;
  description?: string | null;
  category: string;
  template: string;
  status: SiteStatus;
  primary_domain?: string | null;
  position: number;
  archived_at?: string | null;
  version: number;
  updated_at: string;
  pending_to_status?: SiteStatus | null;
  /** Shown on the corporate Africa expansion map. */
  show_on_map?: boolean;
  /** Published brand profile (list responses only). */
  brand?: BrandProfile | null;
}

export const LIFECYCLE: { value: SiteStatus; label: string; hint: string }[] = [
  { value: "draft", label: "Draft", hint: "Private; not listed anywhere" },
  { value: "coming_soon", label: "Coming soon", hint: "Listed with a waitlist" },
  { value: "beta", label: "Beta / early access", hint: "Listed with early-access sign-up" },
  { value: "active", label: "Active", hint: "Listed with demo requests" },
  { value: "retired", label: "Retired", hint: "Removed from listings" },
];

export const statusLabel = (status: string) => LIFECYCLE.find((s) => s.value === status)?.label ?? status;

/** Mirrors the API's allowed moves (services/api/src/sites.rs) to offer only valid options. */
export const TRANSITIONS: Record<SiteStatus, SiteStatus[]> = {
  draft: ["coming_soon", "beta", "active"],
  coming_soon: ["draft", "beta", "active", "retired"],
  beta: ["coming_soon", "active", "retired"],
  active: ["coming_soon", "beta", "retired"],
  retired: ["coming_soon"],
};

export const CATEGORIES: { value: string; label: string; template: string; pages: string[] }[] = [
  {
    value: "hr_workforce",
    label: "HR & Workforce",
    template: "hr",
    pages: ["Home", "Platform", "Modules", "Solutions", "Pricing", "Resources", "Company"],
  },
  {
    value: "lending_credit",
    label: "Lending & Credit",
    template: "lending",
    pages: ["Home", "Platform", "Lending solutions", "Collections", "Analytics", "Security", "Resources"],
  },
  {
    value: "finance_payments",
    label: "Finance & Payments",
    template: "finance",
    pages: ["Home", "Features", "Solutions", "Resources", "Contact"],
  },
  {
    value: "custom_enterprise",
    label: "Custom Enterprise Software",
    template: "custom",
    pages: ["Home", "Capabilities", "Industries", "Resources", "Contact"],
  },
];

export const categoryLabel = (value: string) =>
  value === "corporate" ? "Corporate website" : (CATEGORIES.find((c) => c.value === value)?.label ?? value);

export const TEMPLATES: { value: string; label: string }[] = [
  { value: "hr", label: "HR & workforce" },
  { value: "lending", label: "Lending & financial software" },
  { value: "finance", label: "Expense & payment platforms" },
  { value: "custom", label: "Custom enterprise application" },
];

const STYLES: Record<SiteStatus, string> = {
  draft: "border-line text-muted",
  coming_soon: "border-accent/40 bg-accent-soft text-accent",
  beta: "border-warning/40 bg-warning/10 text-warning",
  active: "border-success/30 bg-success/10 text-success",
  retired: "border-line bg-surface-2 text-subtle",
};

export function SiteStatusPill({ status }: { status: SiteStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

/** Whether a website has a published logo (symbol or horizontal) to show. */
export const hasPublishedLogo = (brand?: BrandProfile | null) =>
  hasLogo(brand?.logos.symbol) || hasLogo(brand?.logos.horizontal);

/**
 * Website identity in the Studio: its published symbol, else its published
 * logo, on a dark tile (the official files are made for dark backgrounds).
 * Without a published logo, the temporary built-in icon is shown. This is
 * `ProductLogo`'s rule (symbol, else logo, else built-in), drawn here on a
 * tile because it also covers the corporate site, which isn't a product.
 */
export function SiteMark({ slug, name, brand }: { slug: string; name: string; brand?: BrandProfile | null }) {
  const tile =
    "flex h-12 shrink-0 items-center justify-center rounded-xl bg-[#15120f] shadow-[0_0_0_1px_var(--line-strong)]";
  if (hasLogo(brand?.logos.symbol)) {
    return (
      <span className={cn(tile, "w-12")}>
        <BrandLogo pair={brand!.logos.symbol} on="dark" height={30} maxWidth={32} alt={`${name} logo`} />
      </span>
    );
  }
  if (hasLogo(brand?.logos.horizontal)) {
    return (
      <span className={cn(tile, "px-3")}>
        <BrandLogo pair={brand!.logos.horizontal} on="dark" height={30} maxWidth={96} alt={`${name} logo`} />
      </span>
    );
  }
  if (isProductSlug(slug)) return <ProductGlyph slug={slug} size="lg" className="size-12" />;
  return (
    <span
      aria-hidden
      data-product="figbud"
      className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-product to-product-2 text-base font-semibold text-product-ink"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const isProductSlug = (slug: string): slug is ProductSlug =>
  ["zirahr", "jasiri", "expense_now", "ziwa"].includes(slug);
