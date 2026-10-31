/**
 * Customers & proof (P10-T1..T3): Trusted By organisations, testimonials and
 * success metrics. Mirrors services/api/src/proof.rs.
 */

export type ProofKind = "organization" | "testimonial" | "metric";

export type ProofStatus =
  "draft" | "in_review" | "published" | "changes_pending" | "unpublished" | "archived";

export interface ProofSummary {
  id: string;
  kind: ProofKind;
  title: string;
  status: ProofStatus;
  active: boolean;
  sort_order: number;
  /** Websites the draft is meant for, and where the published version shows. */
  sites: string[];
  published_sites: string[];
  published_at: string | null;
  updated_at: string;
}

export interface ProofList {
  items: ProofSummary[];
  can_edit: boolean;
  can_review: boolean;
}

export interface FieldIssue {
  field: string;
  code: string;
  message: string;
}

export interface ProofDetail extends ProofSummary {
  draft: Record<string, unknown>;
  draft_version: number;
  published: Record<string, unknown> | null;
  published_number: number;
  review: { requested_at: string; requested_by: string | null; note: string | null; own: boolean } | null;
  publish_errors: FieldIssue[];
  versions: {
    number: number;
    note: string;
    sites: string[];
    requested_by: string | null;
    published_by: string | null;
    created_at: string;
  }[];
  can_edit: boolean;
  can_review: boolean;
}

export const KIND_LABELS: Record<ProofKind, { plural: string; singular: string; lead: string }> = {
  organization: {
    plural: "Trusted By",
    singular: "organisation",
    lead: "Customers and partners shown in the Trusted By logo row. Only organisations that confirmed the relationship and approved being shown can be published.",
  },
  testimonial: {
    plural: "Testimonials",
    singular: "testimonial",
    lead: "Quotations from customers, published only with their approval for the words, and for their name and photograph when shown.",
  },
  metric: {
    plural: "Success metrics",
    singular: "metric",
    lead: "Verified figures with their source and measurement period, which the websites show beside them. Never publish an estimate or an example figure.",
  },
};

export const STATUS_LABELS: Record<ProofStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "border-line-strong text-muted" },
  in_review: { label: "Awaiting approval", tone: "border-amber-500/40 text-amber-600 dark:text-amber-400" },
  published: { label: "Published", tone: "border-accent/40 text-accent-strong" },
  changes_pending: { label: "Published · changes in draft", tone: "border-accent/40 text-accent-strong" },
  unpublished: { label: "Unpublished", tone: "border-line-strong text-muted" },
  archived: { label: "Archived", tone: "border-line text-subtle" },
};

export const RELATIONSHIPS = [
  { value: "customer", label: "Customer" },
  { value: "partner", label: "Partner" },
  { value: "technology", label: "Technology provider" },
  { value: "other", label: "Other" },
] as const;

export const isKind = (value: unknown): value is ProofKind =>
  value === "organization" || value === "testimonial" || value === "metric";
