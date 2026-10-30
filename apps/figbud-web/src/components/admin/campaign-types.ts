import type { CampaignAction, CampaignPlacement, LiveCampaign } from "@figbud/site-kit";

/** Admin view of campaigns (services/api/src/campaigns). */

export type CampaignStatus = "draft" | "scheduled" | "live" | "paused" | "completed" | "archived";

export interface CampaignStats {
  impressions: number;
  clicks: number;
  dismissals: number;
  conversions: number;
  entries: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  reference: string;
  kind: string;
  site: string;
  site_name: string;
  owner_name: string | null;
  status: CampaignStatus;
  pending: boolean;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  draft_differs: boolean;
  stats: CampaignStats;
}

export interface CampaignList {
  items: CampaignSummary[];
  sites: { site: string; name: string; can_create: boolean }[];
  kinds: string[];
}

export interface Reward {
  id: string;
  label: string;
  description?: string | null;
  kind: string;
  quantity?: number | null;
  weight: number;
  instructions: string;
}

/** The campaign document as the Studio edits it (doc.rs). */
export interface CampaignDoc {
  content: {
    badge?: string | null;
    headline: string;
    subheadline?: string | null;
    body?: string | null;
    primary?: { label: string; action: CampaignAction; href?: string | null } | null;
    secondary?: { label: string; action: CampaignAction; href?: string | null } | null;
    terms?: string | null;
    promo_code?: string | null;
    countdown?: boolean;
    image_id?: string | null;
  };
  design: LiveCampaign["design"];
  display: LiveCampaign["display"];
  schedule: {
    starts_at?: string | null;
    ends_at?: string | null;
    timezone: string;
    priority: number;
    recurrence: "none" | "yearly";
  };
  rewards?: {
    rewards: Reward[];
    max_attempts: number;
    eligibility: string;
    redeem_days: number;
    applicable?: string | null;
    restrictions?: string | null;
    legal_review: string;
  } | null;
}

export interface CampaignRevision {
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

export interface CampaignDetail {
  id: string;
  site_id: string;
  site_slug: string;
  site_name: string;
  name: string;
  reference: string;
  kind: string;
  objective: string;
  description: string;
  owner_id: string | null;
  owner_name: string | null;
  draft: CampaignDoc;
  draft_version: number;
  draft_updated_at: string;
  published: CampaignDoc | null;
  published_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  paused_at: string | null;
  archived_at: string | null;
  status: CampaignStatus;
  draft_differs: boolean;
  revisions: CampaignRevision[];
  stats: CampaignStats;
  redeemed: number;
  daily: { day: string; kind: string; count: number }[];
  stock: {
    id: string;
    label: string;
    quantity: number | null;
    awarded: number;
    weight: number;
    active: boolean;
  }[];
  can_edit: boolean;
  can_review: boolean;
  can_approve_rewards: boolean;
}

export const KIND_LABELS: Record<string, { label: string; hint: string }> = {
  hero: { label: "Hero campaign", hint: "Large banner with headline, visual and call to action" },
  announcement: { label: "Announcement bar", hint: "Slim, dismissible bar at the top" },
  floating: { label: "Floating promotion", hint: "Compact card in the corner" },
  modal: { label: "Modal campaign", hint: "Timed or behaviour-triggered dialog" },
  seasonal: { label: "Seasonal campaign", hint: "Black Friday, festive or anniversary offers" },
  countdown: { label: "Countdown campaign", hint: "Time-limited offer with a live countdown" },
  launch: { label: "Product launch", hint: "New product, feature or early access" },
  rewards: { label: "Interactive rewards", hint: "Spin to win, decided securely by the API" },
  referral: { label: "Referral campaign", hint: "Invitations and eligible rewards" },
  event: { label: "Event campaign", hint: "Webinars, demos and showcases" },
};

export const STATUS_LABELS: Record<CampaignStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "bg-surface-2 text-muted" },
  scheduled: { label: "Scheduled", tone: "border border-accent/40 bg-accent-soft text-accent-strong" },
  live: { label: "Live", tone: "bg-success/15 text-success" },
  paused: { label: "Paused", tone: "bg-warning/15 text-text" },
  completed: { label: "Completed", tone: "border border-line text-subtle" },
  archived: { label: "Archived", tone: "border border-line text-subtle" },
};

export const PLACEMENT_LABELS: Record<CampaignPlacement, string> = {
  announcement_bar: "Announcement bar (above the header)",
  below_nav: "Banner below the navigation",
  home_hero: "Home page hero",
  floating: "Floating corner card",
  modal: "Centred dialog",
  footer: "Above the footer",
};

export const ACTION_LABELS: Record<CampaignAction, string> = {
  demo: "Request a demo (contact form)",
  waitlist: "Join the waitlist (contact form)",
  contact: "Contact sales (contact form)",
  webinar: "Register for a webinar (contact form)",
  link: "Open a link",
};

export const REWARD_KINDS: Record<string, string> = {
  discount: "Subscription discount",
  trial_extension: "Free trial extension",
  credit: "Product credit",
  onboarding_discount: "Implementation or onboarding discount",
  merchandise: "Approved merchandise",
  training: "Complimentary training",
  other: "Other",
};

/** Click-through rate as a percentage string, or "—" with no impressions. */
export const ctr = (s: CampaignStats) =>
  s.impressions ? `${((s.clicks / s.impressions) * 100).toFixed(1)}%` : "—";
