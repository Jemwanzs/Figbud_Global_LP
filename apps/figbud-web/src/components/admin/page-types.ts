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
  revisions: PageRevision[];
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
];

export const blockLabel = (type: string) => BLOCKS.find((b) => b.type === type)?.label ?? type;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2);

/** A new section with starter content that passes validation. */
export function newSection(type: BlockType): PageSection {
  const id = newId();
  switch (type) {
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
