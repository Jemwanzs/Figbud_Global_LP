import type { CalcInput, Calculation, PriceBook, PricingItem } from "@figbud/site-kit";

/** GET /v1/admin/sites/{slug}/pricing (services/api/src/pricing/mod.rs). */
export interface PricingAdmin {
  site: { slug: string; name: string };
  draft: PriceBook;
  /** 0 until the first save. */
  draft_version: number;
  draft_updated_at?: string;
  published: PriceBook | null;
  published_number: number;
  published_at?: string | null;
  effective_from?: string | null;
  public_visible: boolean;
  review: { requested_at: string; requested_by: string | null; note: string | null; own: boolean } | null;
  versions: {
    number: number;
    note: string;
    effective_from: string | null;
    requested_by: string | null;
    published_by: string | null;
    created_at: string;
  }[];
  changes: {
    first: boolean;
    settings_changed: boolean;
    items: {
      item_id: string;
      name: string;
      change: "added" | "changed" | "removed";
      before?: string | null;
      after?: string | null;
    }[];
  };
  status: "draft" | "in_review" | "published" | "changes_pending";
  can_edit: boolean;
  can_review: boolean;
  user_id: string;
}

export type QuoteStatus =
  "draft" | "pending_approval" | "approved" | "sent" | "accepted" | "declined" | "expired";

export interface QuoteSummary {
  id: string;
  reference: string;
  customer_name: string;
  status: QuoteStatus;
  currency: string;
  due_first_period: string;
  renewal_amount: string;
  issue_date: string;
  expiry_date: string;
  book_version: number;
  created_at: string;
  updated_at: string;
}

export interface QuoteDetail extends QuoteSummary {
  site: { slug: string; name: string };
  customer_contact: string;
  input: CalcInput;
  snapshot: { calculation: Calculation; model: string | null; tax_name: string };
  terms: string;
  internal_notes: string;
  version: number;
  shared: boolean;
  own_submission: boolean;
  can_edit: boolean;
  can_review: boolean;
}

export const QUOTE_STATUS: Record<QuoteStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "border-line-strong text-muted" },
  pending_approval: {
    label: "Pending approval",
    tone: "border-amber-500/40 text-amber-700 dark:text-amber-400",
  },
  approved: { label: "Approved", tone: "border-accent/40 text-accent-strong" },
  sent: { label: "Sent", tone: "border-blue-500/40 text-blue-700 dark:text-blue-300" },
  accepted: { label: "Accepted", tone: "border-accent/50 bg-accent-soft text-accent-strong" },
  declined: { label: "Declined", tone: "border-line-strong text-subtle" },
  expired: { label: "Expired", tone: "border-line text-subtle" },
};

export const CATEGORY_LABELS: Record<PricingItem["category"], string> = {
  core: "Core module",
  add_on: "Add-on",
  implementation: "Implementation",
  support: "Support",
  integration: "Integration",
  custom: "Custom",
};

export const GROUP_LABELS: Record<string, string> = {
  setup: "A. Platform setup",
  migration: "B. Data migration",
  training: "C. Training",
  integrations: "D. Integrations",
  deployment: "E. Deployment & support",
};

/** A blank item for the given section. */
export function newItem(section: "recurring" | "one_off", id: string): PricingItem {
  return {
    id,
    name: "",
    description: "",
    category: section === "recurring" ? "core" : "implementation",
    group: section === "recurring" ? null : "setup",
    method: section === "recurring" ? "per_employee" : "flat",
    unit_label: section === "recurring" ? "employees" : "project",
    billing: section === "recurring" ? "monthly" : "one_off",
    rate: null,
    minimum_charge: null,
    tiers: [],
    tier_mode: "volume",
    cycle_terms: [],
    min_qty: null,
    max_qty: null,
    taxable: true,
    discountable: section === "recurring",
    one_off_mode: "charged",
    effective_from: null,
    availability: "available",
    active: true,
    public: false,
  };
}
