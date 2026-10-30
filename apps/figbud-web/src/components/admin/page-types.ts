import type { PageDocument, PageSection, SiteTheme } from "@figbud/site-kit";

/** Admin view of pages (services/api/src/pages). */

export interface PageSummary {
  id: string;
  path: string;
  title: string;
  position: number;
  sections: number;
  published: boolean;
  published_at: string | null;
  draft_differs: boolean;
  pending: boolean;
  /** When an approved change goes live, if one is scheduled. */
  scheduled_at: string | null;
  /** Taken off the website (404) without losing content or versions. */
  offline: boolean;
  /** Listed in the website's navigation (pages left out stay reachable by address). */
  show_in_nav: boolean;
  /** Sections kept in the draft but not shown on the website. */
  hidden_sections: number;
  archived_at: string | null;
  draft_updated_at: string;
}

/** A starting point for a new page (services/api/src/pages/templates.rs). */
export interface PageTemplate {
  id: string;
  label: string;
  description: string;
  /** Suggested title and address ("" is the home page). */
  title: string;
  path: string;
  /** The website category it is written for; null suits every website. */
  category: string | null;
}

export interface PageList {
  site: { slug: string; name: string; category: string };
  pages: PageSummary[];
  /** The website's category set first, then the general set. */
  templates: PageTemplate[];
}

export interface PageRevision {
  id: string;
  number: number;
  note: string;
  state: "pending" | "scheduled" | "published" | "rejected" | "cancelled";
  requested_by: string | null;
  requested_by_id: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
  decided_at: string | null;
  /** The requested go-live time; the change waits as "scheduled" once approved. */
  publish_at: string | null;
}

/** Performance budget of a page (services/api/src/pages/budget.rs, P7-G4). */
export type BudgetLevel = "ok" | "warn" | "over";

export interface PageBudget {
  level: BudgetLevel;
  checks: {
    key: string;
    label: string;
    value: number;
    warn: number;
    limit: number;
    unit: "count" | "bytes";
    level: BudgetLevel;
  }[];
}

export interface PageDetail {
  page: {
    id: string;
    path: string;
    title: string;
    draft: PageDocument;
    draft_version: number;
    draft_updated_at: string;
    draft_updated_by: string | null;
    published: PageDocument | null;
    published_revision: string | null;
    published_at: string | null;
    archived_at: string | null;
    offline: boolean;
    show_in_nav: boolean;
  };
  /** `theme`: the website's section band colours, for previews. */
  site: { slug: string; name: string; theme?: SiteTheme };
  draft_differs: boolean;
  /** The saved draft as websites would receive it (Markdown rendered). */
  preview: PageDocument | null;
  /** What a phone downloads for the saved draft, against the budget. */
  budget?: PageBudget | null;
  revisions: PageRevision[];
  /** Old addresses of this page that forward to it (P7-G1). */
  redirects?: { from_path: string; created_at: string }[];
}

export type BlockType = PageSection["type"];

/** The block library, as offered in "Add section". */
export const BLOCKS: { type: BlockType; label: string; hint: string }[] = [
  { type: "hero", label: "Hero", hint: "Headline, introduction and buttons" },
  { type: "text", label: "Text", hint: "Rich text in Markdown" },
  { type: "feature_grid", label: "Feature grid", hint: "Capabilities in cards" },
  { type: "steps", label: "Steps", hint: "How it works, in order" },
  { type: "stats", label: "Figures", hint: "Verified figures with their source" },
  { type: "faq", label: "Questions", hint: "Expandable questions and answers" },
  { type: "call_to_action", label: "Call to action", hint: "A closing invitation with a button" },
  { type: "image", label: "Image", hint: "A picture from the media library, with a caption" },
  { type: "shared", label: "Shared content", hint: "A section from the content library, kept in sync" },
];

/** A section's content without its page-specific id (a content library item). */
export const sectionContent = (section: PageSection): Record<string, unknown> =>
  Object.fromEntries(Object.entries(section).filter(([key]) => key !== "id"));

/** A content library item (`GET /v1/admin/shared`). */
export interface SharedItem {
  id: string;
  name: string;
  draft: Exclude<PageSection, { type: "image" | "shared" }> | Record<string, unknown>;
  draft_version: number;
  published: Record<string, unknown> | null;
  published_number: number | null;
  published_at: string | null;
  archived_at: string | null;
  updated_at: string;
  updated_by: string | null;
  draft_differs: boolean;
  used_on: { page: string; title: string; path: string; site: string; site_name: string; state: string }[];
}

/** A media library image (`GET /v1/admin/sites/{slug}/media`). */
export interface MediaItem {
  id: string;
  label: string;
  alt_text: string;
  content_type: string;
  width: number;
  height: number;
  byte_size: number;
  archived_at: string | null;
  created_at: string;
  created_by: string | null;
  used_on: { page: string; title: string; path: string; state: "draft" | "published" }[];
}

/** Where the Studio loads media images from (its private proxy to the admin API). */
export const STUDIO_MEDIA_BASE = "/admin/api/media/";

export const blockLabel = (type: string) => BLOCKS.find((b) => b.type === type)?.label ?? type;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2);

/**
 * A new section with starter content that passes validation. Image and
 * Shared content sections need what they point to (`ref`).
 */
export function newSection(type: BlockType, ref = ""): PageSection {
  const id = newId();
  switch (type) {
    case "image":
      return { id, type, image_id: ref, caption: "", size: "content" };
    case "shared":
      return { id, type, shared_id: ref };
    case "hero":
      return { id, type, heading: "New headline", lead: "", eyebrow: "" };
    case "text":
      return { id, type, heading: "", body: "Write here. **Markdown** is supported." };
    case "feature_grid":
      return { id, type, heading: "", intro: "", items: [{ title: "Capability", body: "What it does." }] };
    case "steps":
      return { id, type, heading: "How it works", items: [{ title: "First step", body: "What happens." }] };
    case "stats":
      return {
        id,
        type,
        heading: "",
        items: [{ value: "0", label: "Label" }],
        source: "Replace with where these figures come from",
      };
    case "faq":
      return {
        id,
        type,
        heading: "Questions",
        items: [{ question: "A common question?", answer: "The answer." }],
      };
    case "call_to_action":
      return {
        id,
        type,
        heading: "Ready to talk?",
        body: "",
        cta: { label: "Request a demo", href: "/contact" },
      };
  }
}

/** A copy of a section with a fresh id. */
export const copySection = (section: PageSection): PageSection => ({
  ...structuredClone(section),
  id: newId(),
});

export const PATH_PATTERN = /^$|^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*){0,2}$/;

export const toPath = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
