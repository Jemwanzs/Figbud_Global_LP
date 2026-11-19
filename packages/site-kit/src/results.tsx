import { CountUp, type Figure, type FigureNotation, RevealGroup, cn, revealOrder } from "@figbud/ui";
import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  Clock,
  Globe,
  Landmark,
  Layers,
  type LucideIcon,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { PublicMetric } from "./proof";
import { LazyResultsCarousel } from "./lazy-blocks";

/*
 * Results & achievements and "Our Success Story" (owner's briefs, 19 Nov
 * 2026, P10-R1/R2). Every figure is a verified, published metric from
 * Customers & proof for this website, shown with the one formatter
 * (`formatFigure`): compact by default, never rounded up, its source and
 * period beside it. Layout, wording and motion come from the website's
 * published settings, else the website display defaults set on FigBud
 * Global. Nothing renders without figures.
 */

export type ResultsLayout = "featured" | "cards" | "carousel";

export interface FigureMotion {
  count_up: boolean;
  entrance: boolean;
  hover: boolean;
  duration_ms: number;
  stagger_ms: number;
}

export interface DisplayDefaults {
  notation: "compact" | "full";
  results_layout: ResultsLayout;
  animation: FigureMotion;
}

export interface ResultsDisplay {
  enabled?: boolean;
  eyebrow?: string | null;
  title?: string | null;
  lead?: string | null;
  layout?: ResultsLayout | null;
  placement?: "proof" | "after_hero";
  animation?: FigureMotion | null;
  autoplay?: boolean;
  interval?: number;
}

export interface SuccessStoryConfig {
  enabled: boolean;
  eyebrow: string;
  headline: string;
  lead?: string | null;
  layout: "strip" | "cards" | "split" | "featured" | "counter";
  background: "brand" | "gradient" | "image";
  image_id?: string | null;
  overlay: number;
  metric_ids: string[];
  animation?: FigureMotion | null;
  parallax?: boolean;
  replaces_results?: boolean;
  /** How many figures it may show (1–12; 8 by default). */
  max_figures?: number;
}

export const DEFAULT_MOTION: FigureMotion = {
  count_up: true,
  entrance: true,
  hover: true,
  duration_ms: 1600,
  stagger_ms: 120,
};

export const DEFAULT_DISPLAY: DisplayDefaults = {
  notation: "compact",
  results_layout: "featured",
  animation: DEFAULT_MOTION,
};

const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  users: Users,
  building: Building2,
  "badge-check": BadgeCheck,
  briefcase: Briefcase,
  layers: Layers,
  "trending-up": TrendingUp,
  clock: Clock,
  globe: Globe,
  award: Award,
  receipt: Receipt,
  landmark: Landmark,
};

/** A published metric as a figure for the shared formatter. */
export function figureOf(m: PublicMetric): Figure {
  return {
    value: m.value,
    format: m.format,
    currency: m.currency,
    notation: m.notation ?? (m.compact ? "compact" : "auto"),
    decimals: (m.auto_decimals ?? m.decimals === 0) ? null : m.decimals,
    prefix: m.prefix,
    suffix: m.suffix,
  };
}

function Value({
  m,
  locale,
  notation,
  motion,
  className,
}: {
  m: PublicMetric;
  locale: string;
  notation: FigureNotation;
  motion: FigureMotion;
  className?: string;
}) {
  return (
    <CountUp
      value={m.value}
      locale={locale}
      figure={figureOf(m)}
      notation={notation}
      duration={motion.duration_ms}
      animate={motion.count_up}
      className={className}
    />
  );
}

function Icon({ name, className }: { name?: string | null; className?: string }) {
  const Glyph = name ? ICONS[name] : undefined;
  return Glyph ? <Glyph aria-hidden className={className} /> : null;
}

function Heading({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow?: string | null;
  title: string;
  lead?: string | null;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="text-xs font-medium tracking-[0.18em] text-accent uppercase">{eyebrow}</p>}
      <h2 id={id} className="mt-3 font-display text-headline font-semibold text-balance text-text">
        {title}
      </h2>
      {lead && <p className="mt-4 text-lead text-muted">{lead}</p>}
    </div>
  );
}

/** One figure: icon, number, label, description and its source and period. */
function FigureCell({
  m,
  i,
  locale,
  notation,
  motion,
  sourceLabel,
  big = false,
  className,
}: {
  m: PublicMetric;
  i: number;
  locale: string;
  notation: FigureNotation;
  motion: FigureMotion;
  sourceLabel: string;
  big?: boolean;
  className?: string;
}) {
  const reveal = (n: number): CSSProperties | undefined =>
    motion.entrance ? { ...revealOrder(n), transitionDelay: `${i * motion.stagger_ms}ms` } : undefined;
  return (
    <RevealGroup
      data-figure={m.id}
      className={cn(
        "flex flex-col",
        motion.hover && "transition-transform duration-300 motion-safe:hover:-translate-y-0.5",
        className,
      )}
    >
      <dt
        className="fb-reveal-item order-2 mt-2 flex items-center gap-2 text-sm font-medium text-text"
        style={reveal(1)}
      >
        <Icon name={m.icon} className="size-4 shrink-0 text-accent" />
        {m.label}
      </dt>
      <dd
        className={cn(
          "order-1 font-display font-semibold tracking-tight text-text",
          big ? "text-5xl @2xl:text-6xl" : "text-3xl @2xl:text-4xl",
        )}
      >
        <Value m={m} locale={locale} notation={notation} motion={motion} />
      </dd>
      {m.description && (
        <dd className="fb-reveal-item order-3 mt-1 text-sm text-muted" style={reveal(2)}>
          {m.description}
        </dd>
      )}
      <dd className="fb-reveal-item order-4 mt-3 text-xs leading-relaxed text-subtle" style={reveal(2)}>
        {sourceLabel} {m.source} · {m.period}
      </dd>
    </RevealGroup>
  );
}

/**
 * The Results band. Featured: the first figure (by the order set in
 * Customers & proof) takes about a third, the others share the rest with
 * thin dividers. Cards: equal weight. Carousel: a row with previous/next.
 */
export function ResultsShowcase({
  metrics,
  locale,
  labels,
  display,
  defaults = DEFAULT_DISPLAY,
  className,
}: {
  metrics: PublicMetric[];
  locale: string;
  labels: {
    eyebrow?: string;
    title: string;
    lead?: string;
    source: string;
    previous?: string;
    next?: string;
  };
  display?: ResultsDisplay | null;
  defaults?: DisplayDefaults | null;
  className?: string;
}) {
  if (!metrics.length || display?.enabled === false) return null;
  const base = defaults ?? DEFAULT_DISPLAY;
  const layout = display?.layout ?? base.results_layout;
  const motion = display?.animation ?? base.animation;
  const notation = base.notation;
  const cell = (m: PublicMetric, i: number, extra?: { big?: boolean; className?: string }) => (
    <FigureCell
      key={m.id}
      m={m}
      i={i}
      locale={locale}
      notation={notation}
      motion={motion}
      sourceLabel={labels.source}
      {...extra}
    />
  );
  const [first, ...rest] = metrics;
  let body: ReactNode;
  if (layout === "featured" && first && rest.length) {
    // Two lists side by side: definition lists hold only figure groups (axe "dlitem").
    body = (
      <div
        data-results-layout="featured"
        className="grid overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-card,0_18px_40px_-28px_rgb(0_0_0/0.35))] @5xl:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]"
      >
        <dl className="border-b border-line bg-bg @5xl:border-s-4 @5xl:border-e @5xl:border-b-0 @5xl:border-s-accent">
          {cell(first, 0, { big: true, className: "h-full justify-center p-6 @2xl:p-8" })}
        </dl>
        <dl className="grid divide-y divide-line @2xl:grid-cols-2 @2xl:divide-y-0 @5xl:grid-cols-3 @5xl:divide-x rtl:@5xl:divide-x-reverse">
          {rest.map((m, i) => cell(m, i + 1, { className: "justify-center p-6 @2xl:p-8" }))}
        </dl>
      </div>
    );
  } else if (layout === "carousel" && metrics.length > 1) {
    body = (
      <LazyResultsCarousel
        autoplay={Boolean(display?.autoplay)}
        interval={display?.interval ?? 6}
        labels={{ previous: labels.previous ?? "Previous figures", next: labels.next ?? "Next figures" }}
      >
        {metrics.map((m, i) =>
          cell(m, i, {
            className:
              "w-[85%] shrink-0 snap-start rounded-[var(--radius-panel)] border border-line bg-surface p-6 @2xl:w-[45%] @2xl:p-8 @5xl:w-[30%]",
          }),
        )}
      </LazyResultsCarousel>
    );
  } else {
    body = (
      <dl
        data-results-layout="cards"
        className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line @2xl:grid-cols-2 @5xl:grid-cols-4"
      >
        {metrics.map((m, i) => cell(m, i, { className: "bg-surface p-6 @2xl:p-8" }))}
      </dl>
    );
  }
  return (
    <section aria-labelledby="metrics-title" className={cn("@container", className)} data-results="">
      <Heading
        id="metrics-title"
        eyebrow={display?.eyebrow ?? labels.eyebrow}
        title={display?.title ?? labels.title}
        lead={display?.lead ?? labels.lead}
      />
      <div className="mt-12">{body}</div>
    </section>
  );
}

/**
 * "Our Success Story": a full-width band after the hero, on the website's
 * dark brand band, its gradient, or a library image under a brand-aware
 * overlay. Four figures across on desktop, two on tablets and phones.
 */
export function SuccessStory({
  story,
  metrics,
  locale,
  sourceLabel,
  mediaBase,
  defaults = DEFAULT_DISPLAY,
}: {
  story: SuccessStoryConfig;
  metrics: PublicMetric[];
  locale: string;
  sourceLabel: string;
  mediaBase: string;
  defaults?: DisplayDefaults | null;
}) {
  const shown = story.metric_ids
    .map((id) => metrics.find((m) => m.id === id))
    .filter((m): m is PublicMetric => Boolean(m));
  if (!story.enabled || !shown.length) return null;
  const base = defaults ?? DEFAULT_DISPLAY;
  const motion = story.animation ?? base.animation;
  const image = story.background === "image" && story.image_id ? `${mediaBase}${story.image_id}` : null;
  const figures = (
    <dl
      className={cn(
        "grid gap-px",
        story.layout === "cards"
          ? "grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3"
          : story.layout === "split"
            ? "grid-cols-2"
            : story.layout === "featured"
              ? "grid-cols-2 gap-4 @5xl:grid-cols-3"
              : story.layout === "counter"
                ? "grid-cols-1 gap-8 @2xl:grid-cols-2 @5xl:grid-cols-4"
                : "grid-cols-2 @5xl:grid-cols-4",
        story.layout !== "cards" && "divide-white/15",
      )}
    >
      {shown.map((m, i) => (
        <RevealGroup
          key={m.id}
          data-figure={m.id}
          className={cn(
            "flex flex-col px-4 py-6 text-center",
            (story.layout === "cards" || story.layout === "featured") &&
              "rounded-2xl border border-white/15 bg-white/5 backdrop-blur",
            story.layout === "featured" && i === 0 && "col-span-2 @5xl:col-span-3 @5xl:py-10",
            story.layout === "strip" && i > 0 && "@5xl:border-s @5xl:border-white/15",
            m.link && "relative",
            motion.hover && "transition-transform duration-300 motion-safe:hover:-translate-y-0.5",
          )}
        >
          <dt
            className="fb-reveal-item order-2 mt-2 flex items-center justify-center gap-2 text-sm font-medium text-white/90"
            style={
              motion.entrance
                ? { ...revealOrder(1), transitionDelay: `${i * motion.stagger_ms}ms` }
                : undefined
            }
          >
            <Icon name={m.icon} className="size-4 shrink-0 text-[var(--story-accent)]" />
            {m.link ? (
              // The whole figure leads to its page (P10-R3).
              <a href={m.link} className="underline-offset-4 after:absolute after:inset-0 hover:underline">
                {m.label}
              </a>
            ) : (
              m.label
            )}
          </dt>
          {m.image && (
            <dd className="order-first mb-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${mediaBase}${m.image.id}`}
                alt={m.image.alt}
                width={m.image.width}
                height={m.image.height}
                loading="lazy"
                decoding="async"
                className="h-14 w-auto rounded-lg object-contain"
              />
            </dd>
          )}
          <dd
            className={cn(
              "order-1 font-display font-semibold tracking-tight text-[var(--story-accent)]",
              story.layout === "counter" || (story.layout === "featured" && i === 0)
                ? "text-5xl @2xl:text-7xl"
                : "text-4xl @2xl:text-5xl",
            )}
          >
            <Value m={m} locale={locale} notation={base.notation} motion={motion} />
          </dd>
          {m.description && <dd className="order-3 mt-1 text-sm text-white/75">{m.description}</dd>}
          <dd className="order-3 mt-2 text-[0.7rem] text-white/60">
            {sourceLabel} {m.source} · {m.period}
          </dd>
        </RevealGroup>
      ))}
    </dl>
  );
  return (
    <section
      aria-labelledby="success-story-title"
      data-success-story={story.layout}
      // Dark in both themes: the light theme's band takes the dark theme's colours (UI-TH7 markers).
      data-tone-light="inverse"
      className="@container relative isolate overflow-hidden bg-bg text-white"
      style={{ "--story-accent": "var(--product, var(--accent))" } as CSSProperties}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn(
            "absolute inset-0 -z-20 size-full object-cover",
            story.parallax && "@5xl:motion-safe:fixed @5xl:motion-safe:inset-0",
          )}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background: story.background === "gradient" ? "var(--grad-band, var(--bg))" : "var(--bg)",
          opacity: image ? story.overlay / 100 : 1,
        }}
      />
      <div
        className={cn(
          "mx-auto max-w-[92rem] px-5 py-section-sm @2xl:px-8 @3xl:px-10 @5xl:px-16",
          story.layout === "split" && "grid items-center gap-10 @5xl:grid-cols-2",
        )}
      >
        <div className={cn(story.layout !== "split" && "max-w-3xl")}>
          <p className="flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-[var(--story-accent)] uppercase">
            <span aria-hidden className="h-px w-8 bg-current" />
            {story.eyebrow}
          </p>
          <h2 id="success-story-title" className="mt-4 font-display text-headline font-semibold text-balance">
            {story.headline}
          </h2>
          {story.lead && <p className="mt-3 text-lead text-white/75">{story.lead}</p>}
        </div>
        <div className={cn(story.layout !== "split" && "mt-10 border-t border-white/15 pt-4")}>{figures}</div>
      </div>
    </section>
  );
}
