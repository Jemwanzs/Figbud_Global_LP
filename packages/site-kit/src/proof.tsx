import { Marquee, RevealGroup, cn, revealOrder } from "@figbud/ui";
import { Quote } from "lucide-react";

import { MEDIA_PATH } from "./blocks";
import { ProofLogo } from "./proof-logo";
import { TestimonialCarousel } from "./testimonial-carousel";

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
  /** Compact, full or the website default (P10-R1); older figures send only `compact`. */
  notation?: "auto" | "compact" | "full";
  auto_decimals?: boolean;
  icon?: string | null;
  description?: string | null;
  /** A supporting image, a page it links to, and when it was last checked (P10-R3). */
  image?: ProofImage | null;
  link?: string | null;
  verified_on?: string | null;
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
        {shown.map((o) => {
          const plate =
            "flex h-20 w-44 items-center justify-center rounded-2xl border border-line bg-white px-6 shadow-[0_8px_24px_-18px_rgb(2_6_23/0.35)] sm:h-24 sm:w-52";
          const logo = (
            <ProofLogo src={src(o.logo!)} name={o.name} width={o.logo!.width} height={o.logo!.height} />
          );
          // Their own website, where they gave one (owner's brief, 12 Nov 2026).
          return o.website?.startsWith("https://") ? (
            <a
              key={o.id}
              href={o.website}
              target="_blank"
              rel="noopener noreferrer"
              title={`${o.name}: visit their website`}
              className={cn(
                plate,
                // The website's own accent on hover (FigBud's, or the product's).
                "focus-visible:outline-focus transition-[translate,box-shadow,border-color] duration-[var(--motion-base)] ease-out-expo hover:-translate-y-0.5 hover:border-[color:var(--product,var(--accent))] hover:shadow-[0_14px_30px_-18px_rgb(2_6_23/0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:hover:translate-y-0",
              )}
            >
              {logo}
              <span className="sr-only"> (opens their website in a new tab)</span>
            </a>
          ) : (
            <div key={o.id} className={plate}>
              {logo}
            </div>
          );
        })}
      </Marquee>
    </section>
  );
}

export type TestimonialsLayout = "auto" | "card" | "carousel" | "grid";

/** A website's testimonial band (Studio → a website → Results & success story → Testimonials, P10-R4). */
export interface TestimonialsDisplay {
  layout?: TestimonialsLayout;
  /** Compact unless set. */
  spacing?: "compact" | "standard" | "spacious" | null;
}

/** One approved testimonial, as approved: the quotation, the person, their organisation and logo. */
function TestimonialCard({ t, compact }: { t: PublicTestimonial; compact: boolean }) {
  const avatar = t.photo ?? t.organization_logo;
  const who = [t.person_title, t.organization_name].filter(Boolean).join(", ");
  return (
    <figure
      data-testimonial=""
      className={cn(
        "relative flex h-full flex-col rounded-[var(--radius-panel)] border border-line bg-surface",
        compact ? "p-5 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.35)] sm:p-7" : "p-6 sm:p-8",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 rounded-t-[var(--radius-panel)] bg-gradient-to-r from-product via-product/40 to-transparent rtl:bg-gradient-to-l"
      />
      <Quote aria-hidden className={cn("text-product-text opacity-70", compact ? "size-6" : "size-7")} />
      <blockquote
        className={cn("flex-1 text-[1.0625rem] leading-relaxed text-text", compact ? "mt-3" : "mt-4")}
      >
        <p>{t.quote}</p>
      </blockquote>
      <figcaption
        className={cn("flex items-center gap-3 border-t border-line", compact ? "mt-5 pt-4" : "mt-6 pt-5")}
      >
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
              className={t.photo ? "size-full object-cover" : "max-h-full max-w-full object-contain"}
            />
          </span>
        )}
        <span className="min-w-0">
          <span className="block font-medium text-text">{t.person_name ?? t.organization_name}</span>
          {t.person_name && who && <span className="block text-sm text-muted">{who}</span>}
          {(t.industry || t.country) && (
            <span className="block text-xs text-subtle">
              {[t.industry, t.country].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Customer testimonials. With a website's display (P10-R4, owner's brief,
 * 20 Nov 2026): one centred card for one testimonial, a carousel moved by
 * hand for more (or the layout chosen), in a compact band whose height
 * follows its content. Without one: cards in a grid, a swipeable row on
 * phones, as before (FigBud Global until it publishes its own).
 */
export function Testimonials({
  testimonials,
  labels,
  className,
  display,
}: {
  testimonials: PublicTestimonial[];
  labels: { eyebrow?: string; title: string; lead?: string; list: string };
  className?: string;
  display?: TestimonialsDisplay | null;
}) {
  if (!testimonials.length) return null;
  const chosen = display ? (display.layout ?? "auto") : "grid";
  const layout = chosen === "auto" ? (testimonials.length === 1 ? "card" : "carousel") : chosen;
  // One testimonial can't be a carousel: it shows as a card.
  const shown = layout === "carousel" && testimonials.length === 1 ? "card" : layout;
  const compact = Boolean(display);
  return (
    <section
      aria-labelledby="testimonials-title"
      className={className}
      data-testimonials={shown}
      data-testimonials-spacing={display ? (display.spacing ?? "compact") : undefined}
    >
      <Heading id="testimonials-title" eyebrow={labels.eyebrow} title={labels.title} lead={labels.lead} />
      {shown === "carousel" ? (
        <div className="mt-8">
          <TestimonialCarousel
            label={labels.list}
            names={testimonials.map((t) => t.person_name ?? t.organization_name ?? "")}
            slides={testimonials.map((t) => (
              <TestimonialCard key={t.id} t={t} compact />
            ))}
          />
        </div>
      ) : shown === "card" ? (
        <ul aria-label={labels.list} className="mx-auto mt-8 grid max-w-[46rem] gap-5">
          {testimonials.map((t) => (
            <li key={t.id} data-product={t.product ?? undefined}>
              <RevealGroup className="h-full">
                <div className="fb-reveal-item h-full">
                  <TestimonialCard t={t} compact />
                </div>
              </RevealGroup>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          aria-label={labels.list}
          className={cn(
            "-mx-5 flex snap-x snap-mandatory scroll-px-5 [scrollbar-width:none] gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-[repeat(auto-fit,minmax(18rem,26rem))] md:justify-center md:gap-6 md:overflow-visible md:px-0",
            compact ? "mt-8" : "mt-12",
          )}
        >
          {testimonials.map((t, i) => (
            <li
              key={t.id}
              data-product={t.product ?? undefined}
              className="w-[85%] shrink-0 snap-start md:w-auto"
            >
              <RevealGroup className="h-full">
                <div style={revealOrder(i % 3)} className="fb-reveal-item h-full">
                  <TestimonialCard t={t} compact={compact} />
                </div>
              </RevealGroup>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
