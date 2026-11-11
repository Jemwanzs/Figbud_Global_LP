import type { HeroDesign, HeroVariant, PublishedHero } from "@figbud/site-kit";

/** GET /v1/admin/sites/{slug}/hero (services/api/src/heroes.rs). */
export interface HeroAdmin {
  site: { slug: string; name: string };
  /** This website's collection; empty when it has none yet. */
  designs: { key: HeroDesign; name: string }[];
  draft: { variants: HeroVariant[]; selected: string };
  /** 0 until the first save. */
  draft_version: number;
  /** `null` while the website shows its own hero. */
  published: PublishedHero | null;
  /** What visitors see now: a variant's id, or "own" (the website's own hero). */
  live: string;
  published_number: number;
  published_at: string | null;
  review: { requested_at: string; requested_by: string | null; note: string | null; own: boolean } | null;
  versions: {
    number: number;
    note: string;
    /** `null`: the website's own hero. */
    hero: PublishedHero | null;
    requested_by: string | null;
    published_by: string | null;
    created_at: string;
  }[];
  /** "own": the website's own hero is selected and live, nothing ever published. */
  status: "draft" | "in_review" | "published" | "changes_pending" | "own";
  can_edit: boolean;
  can_review: boolean;
}
