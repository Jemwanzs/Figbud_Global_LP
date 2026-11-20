"use client";

import {
  DEFAULT_DISPLAY,
  DEFAULT_MOTION,
  type DisplayDefaults,
  type FigureMotion,
  MEDIA_PATH,
  type PublicMetric,
  type ResultsDisplay,
  ResultsShowcase,
  SuccessStory,
  type SuccessStoryConfig,
  type PublicTestimonial,
  Testimonials,
  type TestimonialsDisplay,
} from "@figbud/site-kit";
import { cn } from "@figbud/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactElement, cloneElement, useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { useUnsavedChangesWarning } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import { LocalTime } from "./local-time";
import { MediaPicker } from "./media-picker";
import { type FigureRecord, StoryFigures, asPublic } from "./story-figures";
import type { MediaItem } from "./page-types";
import type { WebsiteSettingsAdmin } from "./website-settings";

const input = "mt-1.5 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text";

const NEW_STORY: SuccessStoryConfig = {
  enabled: false,
  eyebrow: "Our Success Story",
  headline: "",
  lead: null,
  layout: "strip",
  background: "brand",
  image_id: null,
  overlay: 70,
  metric_ids: [],
  animation: null,
  parallax: false,
  replaces_results: false,
};

type Tab = "results" | "story" | "testimonials" | "display";

const TESTIMONIAL_LAYOUTS: Record<string, string> = {
  auto: "Automatic: a card for one, a carousel for more",
  card: "Compact card",
  carousel: "Carousel (moved by hand)",
  grid: "Grid",
};
const TESTIMONIAL_SPACING: Record<string, string> = {
  compact: "Compact",
  standard: "Standard",
  spacious: "Spacious",
};
const NEW_TESTIMONIALS: TestimonialsDisplay = { layout: "auto", spacing: "compact" };
type Message = { tone: "ok" | "error"; text: string } | null;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A labelled control: the label names the control by id, so its name is just the label. */
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-text">
        {label}
      </label>
      {cloneElement(children, { id })}
      {hint && <span className="mt-1 block text-xs font-normal text-subtle">{hint}</span>}
    </div>
  );
}

/** Motion: count-up, entrance, hover, duration and stagger (always still with reduced motion). */
function MotionFields({
  value,
  inherit,
  onChange,
  disabled,
}: {
  value: FigureMotion | null | undefined;
  /** Shown when unset: "the website display default". */
  inherit?: string;
  onChange: (value: FigureMotion | null) => void;
  disabled: boolean;
}) {
  const own = value ?? null;
  const m = own ?? DEFAULT_MOTION;
  const set = (patch: Partial<FigureMotion>) => onChange({ ...m, ...patch });
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-xs font-medium text-muted">Motion</legend>
      {inherit && (
        <label className="flex min-h-11 items-center gap-3 text-sm text-text">
          <input
            type="checkbox"
            checked={own === null}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? null : { ...DEFAULT_MOTION })}
            className="size-5 accent-[var(--color-accent)]"
          />
          {inherit}
        </label>
      )}
      {(own !== null || !inherit) && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["count_up", "Count up when the figures come into view"],
              ["entrance", "Fade and rise in, one after another"],
              ["hover", "Lift gently on hover"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 text-sm text-text">
              <input
                type="checkbox"
                checked={m[key]}
                disabled={disabled}
                onChange={(e) => set({ [key]: e.target.checked })}
                className="size-5 accent-[var(--color-accent)]"
              />
              {label}
            </label>
          ))}
          <Field label="Counting takes (seconds)">
            <input
              type="number"
              min={0.4}
              max={4}
              step={0.1}
              value={m.duration_ms / 1000}
              disabled={disabled}
              onChange={(e) => set({ duration_ms: Math.round(Number(e.target.value) * 1000) })}
              className={input}
            />
          </Field>
          <Field label="Between figures (seconds)">
            <input
              type="number"
              min={0}
              max={0.6}
              step={0.02}
              value={m.stagger_ms / 1000}
              disabled={disabled}
              onChange={(e) => set({ stagger_ms: Math.round(Number(e.target.value) * 1000) })}
              className={input}
            />
          </Field>
          <p className="text-xs text-subtle sm:col-span-2">
            Visitors who prefer less motion always see the final figures, still. Counting never shows a value
            above the verified one.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/**
 * Websites → a website → Results & success story (P10-R1/R2): the Results
 * band, Our Success Story after the home page's hero, and website display
 * (FigBud Global: the defaults every website inherits). Drafts and
 * publishing go through the website's settings, version-checked and audited.
 */
export function ResultsStudio({
  slug,
  name,
  data,
  metrics,
  media,
  inherited,
  initialFigures,
  figureMedia,
  canEditFigures,
  canReviewFigures,
  testimonials: approved = [],
}: {
  slug: string;
  name: string;
  data: WebsiteSettingsAdmin;
  metrics: PublicMetric[];
  /** This website's published testimonials (Customers & proof), for the preview. */
  testimonials?: PublicTestimonial[];
  media: MediaItem[];
  /** Every figure (Customers & proof), with drafts, for the figure manager (P10-R3). */
  initialFigures: FigureRecord[];
  /** FigBud Global's media library, where figures' images live. */
  figureMedia: MediaItem[];
  canEditFigures: boolean;
  canReviewFigures: boolean;
  /** FigBud Global's defaults, for a product website (null on FigBud Global itself). */
  inherited: DisplayDefaults | null;
}) {
  const router = useRouter();
  const uid = useId();
  const canEdit = data.can_edit;
  const corporate = data.corporate;
  const [base, setBase] = useState(data.settings);
  const [version, setVersion] = useState(data.version);
  const [tab, setTab] = useState<Tab>("results");
  const [results, setResults] = useState<ResultsDisplay>(
    () => base.results_draft ?? base.results ?? { enabled: true, placement: "proof" },
  );
  const [story, setStory] = useState<SuccessStoryConfig>(
    () => base.success_story_draft ?? base.success_story ?? NEW_STORY,
  );
  const [display, setDisplay] = useState<DisplayDefaults | null>(() => base.display ?? null);
  const [quotes, setQuotes] = useState<TestimonialsDisplay>(
    () => base.testimonials_draft ?? base.testimonials ?? NEW_TESTIMONIALS,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [inverse, setInverse] = useState(false);
  const [figures, setFigures] = useState<FigureRecord[]>(initialFigures);
  const [width, setWidth] = useState<"desktop" | "tablet" | "phone">("desktop");
  const effective = display ?? inherited ?? DEFAULT_DISPLAY;

  const resultsSaved = same(
    results,
    base.results_draft ?? base.results ?? { enabled: true, placement: "proof" },
  );
  const storySaved = same(story, base.success_story_draft ?? base.success_story ?? NEW_STORY);
  const displaySaved = same(display, base.display ?? null);
  const quotesSaved = same(quotes, base.testimonials_draft ?? base.testimonials ?? NEW_TESTIMONIALS);
  useUnsavedChangesWarning(canEdit && !(resultsSaved && storySaved && displaySaved && quotesSaved));

  async function save(label: string, patch: Partial<typeof base>, done: string) {
    setBusy(label);
    setMessage(null);
    try {
      const saved = await adminFetch<WebsiteSettingsAdmin>(`sites/${slug}/settings`, {
        // The rest of the document goes back unchanged; the API keeps the history.
        settings: { ...base, ...patch },
        version,
      });
      setBase(saved.settings);
      setVersion(saved.version);
      setMessage({ tone: "ok", text: done });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  // The story's preview shows figures still in draft too (as the website would, once published).
  const storyMetrics = [
    ...metrics,
    ...figures
      .filter((f) => f.draft && !f.archived && f.sites.includes(slug) && !metrics.some((m) => m.id === f.id))
      .map(asPublic),
  ];

  const tabs: [Tab, string][] = [
    ["results", "Results band"],
    ["story", "Our Success Story"],
    ["testimonials", "Testimonials"],
    ["display", corporate ? "Website display (all websites)" : "Website display"],
  ];
  const actions = (
    draftKey: "results_draft" | "success_story_draft" | "testimonials_draft",
    publishKey: "results" | "success_story" | "testimonials",
  ) => {
    const value = draftKey === "results_draft" ? results : draftKey === "testimonials_draft" ? quotes : story;
    const published = base[publishKey];
    const hasDraft = Boolean(base[draftKey]);
    return (
      canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <ActionButton
            variant="secondary"
            ready={!same(value, base[draftKey] ?? published)}
            busy={busy === "draft"}
            hint="Nothing new to save"
            onClick={() =>
              save("draft", { [draftKey]: value }, "Draft saved. Visitors still see the published version.")
            }
          >
            Save draft
          </ActionButton>
          <ActionButton
            ready={!same(value, published)}
            busy={busy === "publish"}
            hint="Matches what's published"
            onClick={() =>
              save(
                "publish",
                { [publishKey]: value, [draftKey]: null },
                `Published. ${name} shows this within a few minutes.`,
              )
            }
          >
            Publish
          </ActionButton>
          {hasDraft && (
            <button
              type="button"
              onClick={() => {
                if (draftKey === "results_draft")
                  setResults(base.results ?? { enabled: true, placement: "proof" });
                else if (draftKey === "testimonials_draft") setQuotes(base.testimonials ?? NEW_TESTIMONIALS);
                else setStory(base.success_story ?? NEW_STORY);
                void save("discard", { [draftKey]: null }, "Draft discarded.");
              }}
              className="text-sm text-muted hover:text-text"
            >
              Discard draft
            </button>
          )}
        </div>
      )
    );
  };

  return (
    <div className="mt-8 space-y-6" data-results-studio={slug}>
      {!canEdit && (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-sm text-muted">
          Reviewers and owners change these settings. You can see what the website shows.
        </p>
      )}
      <div role="tablist" aria-label="Results settings" className="flex flex-wrap gap-2">
        {tabs.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${uid}-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`${uid}-panel`}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm transition-colors",
              tab === value
                ? "bg-accent font-medium text-accent-ink"
                : "border border-line text-muted hover:border-line-strong hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={`${uid}-tab-${tab}`}
        className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
      >
        <div className="fb-panel space-y-4 rounded-[var(--radius-panel)] p-5">
          {tab === "results" && (
            <>
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={results.enabled !== false}
                  disabled={!canEdit}
                  onChange={(e) => setResults({ ...results, enabled: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Show the Results band
              </label>
              <Field label="Eyebrow (optional)">
                <input
                  value={results.eyebrow ?? ""}
                  maxLength={40}
                  disabled={!canEdit}
                  placeholder="Results"
                  onChange={(e) => setResults({ ...results, eyebrow: e.target.value || null })}
                  className={input}
                />
              </Field>
              <Field label="Heading (optional)">
                <input
                  value={results.title ?? ""}
                  maxLength={80}
                  disabled={!canEdit}
                  placeholder="Measured, not estimated."
                  onChange={(e) => setResults({ ...results, title: e.target.value || null })}
                  className={input}
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  rows={2}
                  value={results.lead ?? ""}
                  maxLength={200}
                  disabled={!canEdit}
                  placeholder="Real results, backed by verified data and the periods they cover."
                  onChange={(e) => setResults({ ...results, lead: e.target.value || null })}
                  className={cn(input, "py-2")}
                />
              </Field>
              <Field label="Layout">
                <select
                  value={results.layout ?? ""}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setResults({ ...results, layout: (e.target.value || null) as ResultsDisplay["layout"] })
                  }
                  className={input}
                >
                  <option value="">Website default ({effective.results_layout})</option>
                  <option value="featured">Featured figure with supporting figures</option>
                  <option value="cards">Equal cards</option>
                  <option value="carousel">Carousel with previous and next</option>
                </select>
              </Field>
              {(results.layout ?? effective.results_layout) === "carousel" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={Boolean(results.autoplay)}
                      disabled={!canEdit}
                      onChange={(e) => setResults({ ...results, autoplay: e.target.checked })}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    Move on by itself
                  </label>
                  <Field label="Every (seconds)">
                    <input
                      type="number"
                      min={4}
                      max={15}
                      value={results.interval ?? 6}
                      disabled={!canEdit}
                      onChange={(e) => setResults({ ...results, interval: Number(e.target.value) })}
                      className={input}
                    />
                  </Field>
                </div>
              )}
              <Field label="Placement on the home page">
                <select
                  value={results.placement ?? "proof"}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setResults({ ...results, placement: e.target.value as ResultsDisplay["placement"] })
                  }
                  className={input}
                >
                  <option value="proof">With customer proof, before testimonials</option>
                  <option value="after_hero">Straight after the hero</option>
                </select>
              </Field>
              <MotionFields
                value={results.animation}
                inherit="Use the website display motion"
                disabled={!canEdit}
                onChange={(animation) => setResults({ ...results, animation })}
              />
              {actions("results_draft", "results")}
            </>
          )}

          {tab === "story" && (
            <>
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={story.enabled}
                  disabled={!canEdit}
                  onChange={(e) => setStory({ ...story, enabled: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Show Our Success Story after the home page&apos;s hero
              </label>
              <Field label="Section title">
                <input
                  value={story.eyebrow}
                  maxLength={40}
                  disabled={!canEdit}
                  onChange={(e) => setStory({ ...story, eyebrow: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Headline">
                <input
                  value={story.headline}
                  maxLength={90}
                  disabled={!canEdit}
                  placeholder="Real progress. Measurable impact."
                  onChange={(e) => setStory({ ...story, headline: e.target.value })}
                  className={input}
                />
              </Field>
              <Field label="Description (optional)">
                <textarea
                  rows={2}
                  value={story.lead ?? ""}
                  maxLength={220}
                  disabled={!canEdit}
                  onChange={(e) => setStory({ ...story, lead: e.target.value || null })}
                  className={cn(input, "py-2")}
                />
              </Field>
              <StoryFigures
                slug={slug}
                name={name}
                figures={figures}
                setFigures={setFigures}
                chosen={story.metric_ids}
                setChosen={(metric_ids) => setStory((st) => ({ ...st, metric_ids }))}
                limit={story.max_figures ?? 8}
                library={figureMedia}
                canEdit={canEdit && canEditFigures}
                canReview={canReviewFigures}
              />
              <Field label="Figures in the story at most" hint="1–12; eight by default.">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={story.max_figures ?? 8}
                  disabled={!canEdit}
                  onChange={(e) => setStory({ ...story, max_figures: Number(e.target.value) })}
                  className={input}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Layout">
                  <select
                    value={story.layout}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setStory({ ...story, layout: e.target.value as SuccessStoryConfig["layout"] })
                    }
                    className={input}
                  >
                    <option value="strip">Horizontal strip</option>
                    <option value="cards">Cards</option>
                    <option value="split">Words beside the figures</option>
                    <option value="featured">Featured figure with supporting figures</option>
                    <option value="counter">Large counting numbers</option>
                  </select>
                </Field>
                <Field label="Background">
                  <select
                    value={story.background}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setStory({ ...story, background: e.target.value as SuccessStoryConfig["background"] })
                    }
                    className={input}
                  >
                    <option value="brand">Dark brand band</option>
                    <option value="gradient">Band gradient</option>
                    <option value="image">Image from the media library</option>
                  </select>
                </Field>
              </div>
              {story.background === "image" && (
                <>
                  <MediaPicker
                    label="Background image"
                    hint="An approved image from this website's media library."
                    value={story.image_id ?? null}
                    media={media}
                    disabled={!canEdit}
                    onChange={(id) => setStory({ ...story, image_id: id })}
                  />
                  <Field
                    label={`Overlay: ${story.overlay}%`}
                    hint="Darker overlays keep the figures readable."
                  >
                    <input
                      type="range"
                      min={0}
                      max={95}
                      step={5}
                      value={story.overlay}
                      disabled={!canEdit}
                      onChange={(e) => setStory({ ...story, overlay: Number(e.target.value) })}
                      className="mt-2 w-full accent-[var(--color-accent)]"
                    />
                  </Field>
                  <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                    <input
                      type="checkbox"
                      checked={Boolean(story.parallax)}
                      disabled={!canEdit}
                      onChange={(e) => setStory({ ...story, parallax: e.target.checked })}
                      className="size-5 accent-[var(--color-accent)]"
                    />
                    Slow background movement (wide screens only)
                  </label>
                </>
              )}
              <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                <input
                  type="checkbox"
                  checked={Boolean(story.replaces_results)}
                  disabled={!canEdit}
                  onChange={(e) => setStory({ ...story, replaces_results: e.target.checked })}
                  className="size-5 accent-[var(--color-accent)]"
                />
                Replace the Results band on the home page (so the figures don&apos;t show twice)
              </label>
              <MotionFields
                value={story.animation}
                inherit="Use the website display motion"
                disabled={!canEdit}
                onChange={(animation) => setStory({ ...story, animation })}
              />
              {actions("success_story_draft", "success_story")}
              {(base.story_history?.length ?? 0) > 0 && (
                <details className="rounded-xl border border-line p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-text">Published versions</summary>
                  <ul className="mt-2 space-y-2">
                    {base.story_history!.map((v) => (
                      <li key={v.published_at} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-muted">
                          <LocalTime iso={v.published_at} />
                          {v.by && ` · ${v.by}`} · {v.story.enabled ? "on" : "off"}
                        </span>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setStory(v.story)}
                            className="text-accent-strong underline underline-offset-2"
                          >
                            Load to restore
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-subtle">
                    Loading a version fills the form; publish it to restore it.
                  </p>
                </details>
              )}
            </>
          )}

          {tab === "testimonials" && (
            <>
              <p className="text-sm text-muted">
                How {name}&apos;s approved testimonials are laid out. The testimonials themselves (quotation,
                person, organisation, logo, consent, order and publishing) are managed in{" "}
                <Link
                  href="/admin/proof?kind=testimonial"
                  className="font-medium text-accent-strong underline"
                >
                  Customers & proof
                </Link>
                ; nothing here changes their wording.
              </p>
              <Field label="Layout">
                <select
                  value={quotes.layout ?? "auto"}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setQuotes({ ...quotes, layout: e.target.value as TestimonialsDisplay["layout"] })
                  }
                  className={input}
                >
                  {Object.entries(TESTIMONIAL_LAYOUTS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Spacing" hint="Compact: the band is as tall as its content needs.">
                <select
                  value={quotes.spacing ?? "compact"}
                  disabled={!canEdit}
                  onChange={(e) =>
                    setQuotes({ ...quotes, spacing: e.target.value as TestimonialsDisplay["spacing"] })
                  }
                  className={input}
                >
                  {Object.entries(TESTIMONIAL_SPACING).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-subtle">
                A carousel never turns by itself: visitors move it with the arrows or dots. With one
                testimonial it shows as a card.
              </p>
              {actions("testimonials_draft", "testimonials")}
            </>
          )}

          {tab === "display" && (
            <>
              <p className="text-sm text-muted">
                {corporate
                  ? "Defaults for every website that hasn't set its own. Changing them never touches a website's figures, wording, colours or chosen layout."
                  : `${name} uses FigBud Global's website display unless you set its own here.`}
              </p>
              {!corporate && (
                <label className="flex min-h-11 items-center gap-3 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={display === null}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setDisplay(e.target.checked ? null : { ...(inherited ?? DEFAULT_DISPLAY) })
                    }
                    className="size-5 accent-[var(--color-accent)]"
                  />
                  Use FigBud Global&apos;s website display
                </label>
              )}
              {(display !== null || corporate) && (
                <>
                  <Field label="Figures">
                    <select
                      value={effective.notation}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDisplay({ ...effective, notation: e.target.value as DisplayDefaults["notation"] })
                      }
                      className={input}
                    >
                      <option value="compact">Compact (25M, 1.3K)</option>
                      <option value="full">Full (25,000,000)</option>
                    </select>
                  </Field>
                  <Field label="Results layout">
                    <select
                      value={effective.results_layout}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setDisplay({
                          ...effective,
                          results_layout: e.target.value as DisplayDefaults["results_layout"],
                        })
                      }
                      className={input}
                    >
                      <option value="featured">Featured figure with supporting figures</option>
                      <option value="cards">Equal cards</option>
                      <option value="carousel">Carousel</option>
                    </select>
                  </Field>
                  <MotionFields
                    value={effective.animation}
                    disabled={!canEdit}
                    onChange={(animation) =>
                      setDisplay({ ...effective, animation: animation ?? DEFAULT_MOTION })
                    }
                  />
                </>
              )}
              {canEdit && (
                <ActionButton
                  ready={!displaySaved}
                  busy={busy === "display"}
                  hint="Nothing to save"
                  onClick={() => save("display", { display }, "Saved. Websites update within a few minutes.")}
                >
                  Save website display
                </ActionButton>
              )}
            </>
          )}
          {message && (
            <p
              role={message.tone === "error" ? "alert" : "status"}
              className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
            >
              {message.text}
            </p>
          )}
        </div>

        <section aria-label="Preview" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-text">
              Preview with {name}&apos;s {tab === "testimonials" ? "testimonials" : "figures"}
            </p>
            <div role="group" aria-label="Preview width" className="flex gap-1">
              {(["desktop", "tablet", "phone"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  aria-pressed={width === w}
                  onClick={() => setWidth(w)}
                  className={cn(
                    "inline-flex min-h-10 cursor-pointer items-center rounded-full px-3 text-xs capitalize",
                    width === w
                      ? "bg-accent text-accent-ink"
                      : "border border-line text-muted hover:text-text",
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={inverse}
                onChange={(e) => setInverse(e.target.checked)}
                className="size-5 accent-[var(--color-accent)]"
              />
              Show the other theme
            </label>
          </div>
          <div
            data-tone={inverse ? "inverse" : undefined}
            // The bands respond to their container, so these widths show the real tablet and phone layouts.
            style={{ maxWidth: width === "desktop" ? undefined : width === "tablet" ? 768 : 390 }}
            className="mx-auto overflow-hidden rounded-[var(--radius-panel)] border border-line bg-bg"
            data-results-preview=""
            data-preview-width={width}
          >
            {tab === "testimonials" ? (
              approved.length ? (
                <div className="fb-tone fb-tone-full fb-tone-alternate px-5" data-testimonials-preview="">
                  <Testimonials
                    testimonials={approved}
                    labels={{
                      eyebrow: "Customers",
                      title: "In our customers' words.",
                      list: "Customer testimonials",
                    }}
                    display={quotes}
                  />
                </div>
              ) : (
                <p className="p-8 text-sm text-subtle">
                  Nothing to preview until testimonials are published for {name} in Customers & proof.
                </p>
              )
            ) : storyMetrics.length === 0 ? (
              <p className="p-8 text-sm text-subtle">
                Nothing to preview until figures are published for {name}.
              </p>
            ) : tab === "story" ? (
              story.metric_ids.length ? (
                <SuccessStory
                  story={{ ...story, enabled: true }}
                  metrics={storyMetrics}
                  locale="en"
                  sourceLabel="Source:"
                  mediaBase={MEDIA_PATH}
                  defaults={effective}
                />
              ) : (
                <p className="p-8 text-sm text-subtle">Choose figures to preview the story.</p>
              )
            ) : (
              <div className="p-6">
                <ResultsShowcase
                  metrics={metrics}
                  locale="en"
                  labels={{ eyebrow: "Results", title: "Measured, not estimated.", source: "Source:" }}
                  display={tab === "results" ? { ...results, enabled: true } : null}
                  defaults={effective}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
