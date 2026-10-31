import { CountUp, Marquee, RevealGroup, cn, revealOrder } from "@figbud/ui";
import { Quote } from "lucide-react";

import { MEDIA_PATH } from "./blocks";

/*
 * Customers & proof (P10-T1..T3): what websites receive from
 * `GET /v1/sites/{slug}/proof` and the sections that show it. Only published,
 * active records approved for the website arrive; every section renders
 * nothing when it has nothing to show, so no placeholder or example content
 * ever appears.
 */

export interface ProofImage {
  id: string;
  alt: string;
  width: number;
  height: number;
}

export interface PublicOrganization {
  id: string;
  name: string;
  relationship: "customer" | "partner" | "technology" | "other";
  website: string | null;
  description: string | null;
  logo: ProofImage | null;
}

export interface PublicTestimonial {
  id: string;
  quote: string;
  organization_name: string | null;
  organization_logo: ProofImage | null;
  person_name: string | null;
  person_title: string | null;
  photo: ProofImage | null;
  product: string | null;
  industry: string | null;
  country: string | null;
}

export interface PublicMetric {
  id: string;
  label: string;
  value: number;
  format: "number" | "currency" | "percent";
  currency: string | null;
  compact: boolean;
  decimals: number;
  prefix: string | null;
  suffix: string | null;
  source: string;
  period: string;
}

export interface PublicProof {
  organizations: PublicOrganization[];
  testimonials: PublicTestimonial[];
  metrics: PublicMetric[];
}

export const EMPTY_PROOF: PublicProof = { organizations: [], testimonials: [], metrics: [] };

const src = (image: ProofImage) => `${MEDIA_PATH}${image.id}`;

function Heading({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
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

/**
 * Trusted By: a calm, continuous logo row (pauses on hover, focus and its
 * button; still with reduced motion). Logos sit on light plates in both
 * themes so their colours and proportions are never altered.
 */
export function TrustedBy({
  organizations,
  labels,
  className,
}: {
  organizations: PublicOrganization[];
  labels: { eyebrow?: string; title: string; lead?: string; list: string; pause: string; play: string };
  className?: string;
}) {
  const shown = organizations.filter((o) => o.logo);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="trusted-by-title" className={cn("overflow-x-clip", className)}>
      <Heading id="trusted-by-title" eyebrow={labels.eyebrow} title={labels.title} lead={labels.lead} />
      <Marquee
        label={labels.list}
        labels={labels}
        className="mt-10"
        duration={Math.max(32, shown.length * 8)}
      >
        {shown.map((o) => (
          <div
            key={o.id}
            className="flex h-20 w-44 items-center justify-center rounded-2xl border border-line bg-white px-6 shadow-[0_8px_24px_-18px_rgb(2_6_23/0.35)] sm:h-24 sm:w-52"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- media library files, served as uploaded */}
            <img
              src={src(o.logo!)}
              alt={o.name}
              width={o.logo!.width}
              height={o.logo!.height}
              loading="lazy"
              decoding="async"
              className="max-h-10 w-auto max-w-full object-contain sm:max-h-12"
            />
          </div>
        ))}
      </Marquee>
    </section>
  );
}

function metricFormat(m: PublicMetric): { format: Intl.NumberFormatOptions; suffix: string } {
  const digits = { minimumFractionDigits: m.decimals, maximumFractionDigits: m.decimals };
  const compact = m.compact ? ({ notation: "compact" } as const) : {};
  if (m.format === "currency" && m.currency)
    return {
      format: { style: "currency", currency: m.currency, currencyDisplay: "code", ...compact, ...digits },
      suffix: m.suffix ?? "",
    };
  // Percentages are entered as points (98 means 98%).
  if (m.format === "percent") return { format: { ...digits }, suffix: `%${m.suffix ?? ""}` };
  return { format: { ...compact, ...digits }, suffix: m.suffix ?? "" };
}

/** Verified figures that count up once, each with its source and period. */
export function ProofMetrics({
  metrics,
  locale,
  labels,
  className,
}: {
  metrics: PublicMetric[];
  /** BCP 47 tag for number formatting. */
  locale: string;
  labels: { eyebrow?: string; title: string; lead?: string; source: string };
  className?: string;
}) {
  if (!metrics.length) return null;
  return (
    <section aria-labelledby="metrics-title" className={className}>
      <Heading id="metrics-title" eyebrow={labels.eyebrow} title={labels.title} lead={labels.lead} />
      <dl className="mt-12 grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m) => {
          const { format, suffix } = metricFormat(m);
          return (
            <RevealGroup key={m.id} className="flex flex-col bg-surface p-6 sm:p-8">
              <dt
                className="fb-reveal-item order-2 mt-2 text-sm font-medium text-text"
                style={revealOrder(1)}
              >
                {m.label}
              </dt>
              <dd className="order-1 font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                <CountUp
                  value={m.value}
                  locale={locale}
                  format={format}
                  prefix={m.prefix ?? ""}
                  suffix={suffix}
                />
              </dd>
              <dd
                className="fb-reveal-item order-3 mt-3 text-xs leading-relaxed text-subtle"
                style={revealOrder(2)}
              >
                {labels.source} {m.source} · {m.period}
              </dd>
            </RevealGroup>
          );
        })}
      </dl>
    </section>
  );
}

/** Customer testimonials: cards in a grid, a swipeable row on phones. */
export function Testimonials({
  testimonials,
  labels,
  className,
}: {
  testimonials: PublicTestimonial[];
  labels: { eyebrow?: string; title: string; lead?: string; list: string };
  className?: string;
}) {
  if (!testimonials.length) return null;
  return (
    <section aria-labelledby="testimonials-title" className={className}>
      <Heading id="testimonials-title" eyebrow={labels.eyebrow} title={labels.title} lead={labels.lead} />
      <ul
        aria-label={labels.list}
        className="-mx-5 mt-12 flex snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-6 md:overflow-visible md:px-0 xl:grid-cols-3"
      >
        {testimonials.map((t, i) => {
          const avatar = t.photo ?? t.organization_logo;
          const who = [t.person_title, t.organization_name].filter(Boolean).join(", ");
          return (
            <li
              key={t.id}
              data-product={t.product ?? undefined}
              className="w-[85%] shrink-0 snap-start md:w-auto"
            >
              <RevealGroup className="h-full">
                <figure
                  style={revealOrder(i % 3)}
                  className="fb-reveal-item relative flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-surface p-6 sm:p-8"
                >
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-1 rounded-t-[var(--radius-panel)] bg-gradient-to-r from-product via-product/40 to-transparent rtl:bg-gradient-to-l"
                  />
                  <Quote aria-hidden className="size-7 text-product-text opacity-70" />
                  <blockquote className="mt-4 flex-1 text-[1.0625rem] leading-relaxed text-text">
                    <p>{t.quote}</p>
                  </blockquote>
                  <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
                    {avatar && (
                      <span
                        className={cn(
                          "flex size-11 shrink-0 items-center justify-center overflow-hidden border border-line bg-white",
                          t.photo ? "rounded-full" : "rounded-xl p-1.5",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- media library files, served as uploaded */}
                        <img
                          src={src(avatar)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={
                            t.photo ? "size-full object-cover" : "max-h-full max-w-full object-contain"
                          }
                        />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium text-text">
                        {t.person_name ?? t.organization_name}
                      </span>
                      {t.person_name && who && <span className="block text-sm text-muted">{who}</span>}
                      {(t.industry || t.country) && (
                        <span className="block text-xs text-subtle">
                          {[t.industry, t.country].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </figcaption>
                </figure>
              </RevealGroup>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
