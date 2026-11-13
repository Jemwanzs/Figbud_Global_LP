import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, Check, Monitor, MonitorSmartphone, Smartphone, Tablet } from "lucide-react";
import { type ReactNode, Suspense } from "react";

import { GuidedDemo } from "./guided-demo";
import { GUIDED_STEPS } from "./guided-steps";
import { type DemoKind, ModuleCatalogue, type ModuleItem, ProductDemo } from "./product-demos";
import { enquiryFormCopy, type EnquiryProduct } from "./enquiry";
import { HeroSignal } from "./hero-signal";
import { LazyEnquiryForm, LazyReferralForm } from "./lazy-blocks";
import { NumberedStory } from "./numbered-story";

/** The website's own mark, for demonstrations that show it (the scroll story's hub). */
export type BrandMark = ReactNode;

/** What a website's enquiry form needs; absent in Studio previews. */
export interface EnquiryContext {
  apiOrigin: string;
  /** The product, when the website is one the enquiry inbox knows. */
  product?: EnquiryProduct;
  privacyHref: string;
}
import type { StoryMotion } from "./scroll-story";

/**
 * Renders page documents built in the Studio (D17): an approved library of
 * typed blocks, styled by the design system. Markdown fields arrive as HTML
 * already sanitised by the API (`*_html`); without it (an unsaved preview)
 * the text is shown as plain paragraphs. Nothing here executes content.
 */

export interface PageCta {
  label: string;
  href: string;
}

interface Base {
  id: string;
  /** Kept in the document but not shown on the website (the API never sends it there). */
  hidden?: boolean;
  /** A band behind the section in the website's theme colours (unset: none). */
  tone?: SectionTone;
  /** Set by the API when the section comes from the content library. */
  shared?: { id: string; name: string; version: number };
}

export type SectionTone =
  | "brand"
  | "soft"
  | "inverse"
  // Brand & Theme Studio (11 Nov 2026): a surface that stays light or dark, or a gradient preset.
  | "light"
  | "dark"
  | "gradient_hero"
  | "gradient_band"
  | "gradient_cta";

/** Full-width section styles (like the contrasting band). */
const FULL_TONES = new Set<SectionTone>(["light", "dark", "gradient_hero", "gradient_band", "gradient_cta"]);

export type PageSection = Base &
  (
    | {
        type: "hero";
        eyebrow?: string | null;
        heading: string;
        accent?: string | null;
        lead?: string | null;
        primary?: PageCta | null;
        secondary?: PageCta | null;
        visual?: "connected_modules" | null;
        highlights?: string[];
        /** The visual's modules, in order (catalogue keys); all eight when empty. */
        modules?: string[];
        /** How much the visual moves by itself. */
        motion?: StoryMotion;
        /** Employee Self-Service, highlighted under the hero. */
        ess?: { heading: string; body: string } | null;
        /** Hover messages changed in the Studio, by module key; the approved copy otherwise. */
        messages?: Partial<Record<string, string>>;
      }
    | { type: "text"; heading?: string | null; body?: string; body_html?: string }
    | {
        type: "feature_grid";
        heading?: string | null;
        intro?: string | null;
        items: { title: string; body: string }[];
      }
    | {
        type: "steps";
        heading?: string | null;
        items: { title: string; body: string }[];
        /** Cards (the default), or numbered storytelling (8 Nov 2026). */
        style?: "cards" | "story";
        intro?: string | null;
        /** The dot pattern beside a story. */
        dots?: boolean;
        motion?: StoryMotion;
      }
    | { type: "stats"; heading?: string | null; items: { value: string; label: string }[]; source: string }
    | {
        type: "faq";
        heading?: string | null;
        items: { question: string; answer?: string; answer_html?: string }[];
      }
    | { type: "call_to_action"; heading: string; body?: string | null; cta: PageCta }
    | {
        type: "modules";
        heading?: string | null;
        intro?: string | null;
        items: (Omit<ModuleItem, "cta"> & { cta?: PageCta | null })[];
      }
    | {
        type: "demo";
        demo: DemoKind;
        heading?: string | null;
        intro?: string | null;
        motion?: StoryMotion;
        layout?: "stacked" | "split";
        /** Scrolling guides a demonstration with steps on wide screens; `false` turns it off. */
        guided?: boolean | null;
      }
    | { type: "referral_form"; heading?: string | null; intro?: string | null; contact_phone?: string | null }
    | { type: "enquiry_form"; heading?: string | null; intro?: string | null }
    | {
        type: "image";
        image_id: string;
        caption?: string | null;
        size?: "content" | "wide";
        /** Added by the API from the media library; `null` when the image is unavailable (previews). */
        media?: MediaInfo | null;
      }
    /** A content library item; the API replaces it with the item's published content. */
    | { type: "shared"; shared_id: string }
  );

/** A media library image as the API describes it (alt text comes from the library). */
export interface MediaInfo {
  id: string;
  alt: string;
  width: number;
  height: number;
  content_type: string;
  /** Rendition widths, for `srcset`. */
  widths: number[];
}

export const MEDIA_PATH = "/media/";

/** `src`, `srcSet` and `sizes` for a media image served from `base`. */
export function mediaImageSources(media: MediaInfo, wide: boolean, base = MEDIA_PATH) {
  const url = (w?: number) => `${base}${media.id}${w ? `?w=${w}` : ""}`;
  const svg = media.content_type === "image/svg+xml";
  const srcSet = svg
    ? undefined
    : [...media.widths.map((w) => `${url(w)} ${w}w`), `${url()} ${media.width}w`].join(", ");
  return {
    src: svg || !media.widths.length ? url() : url(media.widths.find((w) => w >= 960) ?? media.widths.at(-1)),
    srcSet,
    sizes: wide ? "(min-width: 1536px) 1440px, 100vw" : "(min-width: 1024px) 768px, 100vw",
  };
}

export interface PageDocument {
  seo_title?: string | null;
  seo_description?: string | null;
  /** The page's own sharing image from the media library (else the website's). */
  seo_image_id?: string | null;
  /** Asks search engines not to index the page; it's left out of sitemaps. */
  seo_noindex?: boolean;
  /** Added by the API: the sharing image's details, when it's available. */
  seo_image?: MediaInfo | null;
  sections: PageSection[];
}

/** `preview`: links don't navigate (the Studio); `live`: real links on the website. */
type Mode = "live" | "preview";

/** Maps a block link (a site path or https URL) to where it should point on this website. */
export type HrefResolver = (href: string) => string;

function Action({
  cta,
  mode,
  primary,
  resolve,
}: {
  cta: PageCta;
  mode: Mode;
  primary?: boolean;
  resolve?: HrefResolver;
}) {
  const className = buttonClasses(primary ? "product" : "secondary", "lg");
  const content = (
    <>
      {cta.label}
      {primary && <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />}
    </>
  );
  if (mode === "preview") {
    return (
      <span className={className} title={cta.href}>
        {content}
      </span>
    );
  }
  return (
    <a href={resolve ? resolve(cta.href) : cta.href} className={className}>
      {content}
    </a>
  );
}

function Prose({ html, text }: { html?: string; text?: string }) {
  if (html) {
    // Sanitised by the API's Markdown renderer: raw HTML escaped, unsafe URLs removed.
    return <div className="fb-prose max-w-3xl" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <div className="max-w-3xl space-y-4 leading-relaxed whitespace-pre-line text-muted">{text}</div>;
}

/**
 * Columns that fill evenly (UI-MO9): two items sit side by side, and four
 * never split three and one; other counts keep the usual columns.
 */
function evenColumns(count: number, usual: string, four: string) {
  if (count === 2) return "@xl:grid-cols-2";
  if (count === 4) return four;
  return usual;
}

/**
 * A section heading. Major section headings carry a short accent line in the
 * website's product colour above them (owner's brief, 13 Nov 2026: 48 by 2 px,
 * 14 px above, left-aligned, theme-aware through `--product`). Headings with
 * their own treatment (heroes, call-to-action panels, long text) leave it out.
 */
function Heading({
  children,
  level = 2,
  accent = level === 2,
}: {
  children: ReactNode;
  level?: 1 | 2;
  accent?: boolean;
}) {
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <>
      {accent && <span aria-hidden data-heading-accent="" className="fb-heading-accent" />}
      <Tag
        className={cn(
          "font-display font-semibold tracking-tight text-text",
          level === 1 ? "text-display" : "text-title",
        )}
      >
        {children}
      </Tag>
    </>
  );
}

function Block({
  section,
  mode,
  top,
  first,
  resolve,
  mediaBase,
  enquiry,
  mark,
}: {
  section: PageSection;
  mode: Mode;
  top: 1 | 2;
  /** The page's first section: an image there is the main content, so it loads at once. */
  first: boolean;
  resolve?: HrefResolver;
  mediaBase?: string;
  enquiry?: EnquiryContext;
  mark?: BrandMark;
}) {
  switch (section.type) {
    case "hero": {
      const highlights = (section.highlights ?? []).map((h) => h.trim()).filter(Boolean);
      const words = (
        <div className={section.visual ? "min-w-0" : "max-w-3xl"}>
          {section.eyebrow && (
            <p className="text-sm font-medium tracking-[0.14em] text-product-text uppercase">
              {section.eyebrow}
            </p>
          )}
          <div className="mt-4">
            <Heading level={top} accent={false}>
              {section.heading}
              {section.accent && <span className="block text-product-text">{section.accent}</span>}
            </Heading>
          </div>
          {section.lead && <p className="mt-6 text-lead text-muted">{section.lead}</p>}
          {(section.primary || section.secondary) && (
            <div className="mt-9 flex flex-col gap-3 @lg:flex-row">
              {section.primary && <Action cta={section.primary} mode={mode} resolve={resolve} primary />}
              {section.secondary && <Action cta={section.secondary} mode={mode} resolve={resolve} />}
            </div>
          )}
          {highlights.length > 0 && (
            // Two even columns, so four highlights never leave one alone on a line.
            <ul className="mt-8 grid w-fit gap-x-8 gap-y-3 text-sm text-muted @md:grid-cols-2">
              {highlights.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-product-soft text-product-text">
                    <Check aria-hidden className="size-3" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
      if (!section.visual) return words;
      return (
        <>
          <div className="fb-hero-signal relative isolate grid items-center gap-10 @5xl:grid-cols-12 @5xl:gap-8">
            <div className="@5xl:col-span-6">{words}</div>
            <div className="@container @5xl:col-span-6">
              <HeroSignal
                modules={section.modules}
                motion={section.motion ?? "standard"}
                messages={section.messages}
              />
            </div>
          </div>
          {section.ess && <SelfServiceHighlight {...section.ess} />}
        </>
      );
    }
    case "text":
      return (
        <div>
          {section.heading && (
            <div className="mb-6">
              <Heading accent={false}>{section.heading}</Heading>
            </div>
          )}
          <Prose html={section.body_html} text={section.body} />
        </div>
      );
    case "feature_grid":
      return (
        <div>
          {section.heading && <Heading>{section.heading}</Heading>}
          {section.intro && <p className="mt-4 max-w-2xl text-muted">{section.intro}</p>}
          <ul
            className={cn(
              "grid gap-4",
              evenColumns(section.items.length, "@xl:grid-cols-2 @4xl:grid-cols-3", "@xl:grid-cols-2"),
              (section.heading || section.intro) && "mt-10",
            )}
          >
            {section.items.map((item, i) => (
              <li key={i} className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-product-soft text-product-text">
                  <Check aria-hidden className="size-4" strokeWidth={3} />
                </span>
                <h3 className="mt-4 font-semibold text-text">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      );
    case "steps":
      if (section.style === "story")
        return (
          <div>
            {section.heading && <Heading>{section.heading}</Heading>}
            {section.intro && <p className="mt-4 max-w-2xl text-muted">{section.intro}</p>}
            <div className={section.heading || section.intro ? "mt-10" : undefined}>
              <NumberedStory
                items={section.items}
                dots={!!section.dots}
                motion={section.motion ?? "standard"}
              />
            </div>
          </div>
        );
      return (
        <div>
          {section.heading && <Heading>{section.heading}</Heading>}
          <ol
            className={cn(
              "grid gap-4",
              evenColumns(section.items.length, "@3xl:grid-cols-3", "@3xl:grid-cols-2 @6xl:grid-cols-4"),
              section.heading && "mt-10",
            )}
          >
            {section.items.map((item, i) => (
              <li
                key={i}
                className="relative rounded-[var(--radius-panel)] border border-line bg-surface p-6"
              >
                <span className="font-mono text-sm text-product-text">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 font-semibold text-text">{item.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      );
    case "stats":
      return (
        <div>
          {section.heading && <Heading>{section.heading}</Heading>}
          <dl className={cn("grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-4", section.heading && "mt-10")}>
            {section.items.map((item, i) => (
              <div key={i} className="rounded-[var(--radius-panel)] border border-line bg-surface p-6">
                <dt className="text-sm text-muted">{item.label}</dt>
                <dd className="mt-2 font-display text-title font-semibold text-text">{item.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-subtle">{section.source}</p>
        </div>
      );
    case "faq":
      return (
        <div>
          {section.heading && <Heading>{section.heading}</Heading>}
          <div
            className={cn("max-w-3xl divide-y divide-line border-y border-line", section.heading && "mt-8")}
          >
            {section.items.map((item, i) => (
              <details key={i} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium text-text">
                  {item.question}
                  <span aria-hidden className="text-product-text transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-3">
                  <Prose html={item.answer_html} text={item.answer} />
                </div>
              </details>
            ))}
          </div>
        </div>
      );
    case "call_to_action":
      return (
        <div className="fb-cta-panel relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-8 @2xl:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute end-[-10%] -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
          />
          <div className="relative max-w-2xl">
            <Heading accent={false}>{section.heading}</Heading>
            {section.body && <p className="mt-4 text-muted">{section.body}</p>}
            <div className="mt-8">
              <Action cta={section.cta} mode={mode} resolve={resolve} primary />
            </div>
          </div>
        </div>
      );
    case "modules":
      return (
        // The heading and lead travel with the tour while it's pinned (12 Nov 2026).
        <ModuleCatalogue
          items={section.items.map((item) => ({
            ...item,
            cta: item.cta && { ...item.cta, href: resolve ? resolve(item.cta.href) : item.cta.href },
          }))}
          plannedLabel="Planned"
          preview={mode === "preview"}
          intro={
            section.heading || section.intro ? (
              <>
                {section.heading && <Heading>{section.heading}</Heading>}
                {section.intro && <p className="mt-4 max-w-2xl text-muted">{section.intro}</p>}
              </>
            ) : undefined
          }
        />
      );
    case "enquiry_form":
      return (
        <div id="enquire" className="grid scroll-mt-32 gap-8 @5xl:grid-cols-12 @5xl:gap-12">
          <div className="@5xl:col-span-4">
            {section.heading && <Heading>{section.heading}</Heading>}
            {section.intro && <p className="mt-4 text-lead text-muted">{section.intro}</p>}
          </div>
          <div className="@5xl:col-span-8">
            {enquiry ? (
              // The form reads ?kind= from the address, which is request-time data.
              <Suspense
                fallback={<div className="fb-panel h-[52rem] rounded-[var(--radius-panel)]" aria-hidden />}
              >
                <LazyEnquiryForm
                  locale="en"
                  copy={enquiryFormCopy}
                  privacyHref={enquiry.privacyHref}
                  apiOrigin={enquiry.apiOrigin}
                  product={enquiry.product}
                />
              </Suspense>
            ) : (
              <p className="rounded-[var(--radius-panel)] border border-dashed border-line-strong p-8 text-muted">
                The enquiry form appears here on the website: demo requests and questions, sent to the enquiry
                inbox.
              </p>
            )}
          </div>
        </div>
      );
    case "referral_form":
      return (
        <div className="max-w-4xl">
          {section.heading && <Heading>{section.heading}</Heading>}
          {section.intro && <p className="mt-4 max-w-2xl text-muted">{section.intro}</p>}
          <div className={cn((section.heading || section.intro) && "mt-8")}>
            <LazyReferralForm
              endpoint={resolve?.("/referral-submit")}
              contactPhone={section.contact_phone}
              preview={mode === "preview"}
            />
          </div>
        </div>
      );
    case "demo": {
      // Scroll stories and the module showcase pin their heading and lead with them, so nothing drifts apart.
      if (
        section.demo === "scattered_to_connected" ||
        section.demo === "employee_journey" ||
        (section.demo === "connected_modules" && section.layout !== "split")
      ) {
        const intro =
          section.heading || section.intro ? (
            <>
              {section.heading && <Heading>{section.heading}</Heading>}
              {section.intro && <p className="mt-3 max-w-2xl text-lead text-muted">{section.intro}</p>}
            </>
          ) : undefined;
        return <ProductDemo demo={section.demo} motion={section.motion} mark={mark} intro={intro} />;
      }
      // Split: an editorial column beside the showcase on wide screens, stacked on narrow ones.
      const content =
        section.layout === "split" ? (
          <div className="grid gap-8 @5xl:grid-cols-12 @5xl:items-center @5xl:gap-12">
            <div className="@5xl:col-span-4">
              {section.heading && <Heading>{section.heading}</Heading>}
              {section.intro && <p className="mt-4 text-lead text-muted">{section.intro}</p>}
            </div>
            <div className="min-w-0 @5xl:col-span-8">
              <ProductDemo demo={section.demo} motion={section.motion} mark={mark} />
            </div>
          </div>
        ) : (
          <div>
            {section.heading && <Heading>{section.heading}</Heading>}
            {section.intro && <p className="mt-4 max-w-2xl text-lead text-muted">{section.intro}</p>}
            <div className={cn((section.heading || section.intro) && "mt-8")}>
              <ProductDemo demo={section.demo} motion={section.motion} mark={mark} />
            </div>
          </div>
        );
      // Demonstrations with steps: scrolling guides them on wide screens (owner's brief, 12 Nov 2026).
      const steps = GUIDED_STEPS[section.demo];
      return steps && mode !== "preview" ? (
        <GuidedDemo steps={steps} enabled={section.guided !== false} label={section.heading ?? "product"}>
          {content}
        </GuidedDemo>
      ) : (
        content
      );
    }
    case "shared":
      // Only previews see an unresolved item (unpublished or archived); websites never get one.
      return mode === "preview" ? (
        <div className="rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface-2 p-8 text-center text-sm text-muted">
          Shared content that isn&apos;t published yet. It appears here once a reviewer publishes it in the
          content library.
        </div>
      ) : null;
    case "image": {
      const wide = section.size === "wide";
      const media = section.media;
      return (
        <figure className={cn(!wide && "max-w-3xl")}>
          {media ? (
            // Width and height reserve the space, so nothing shifts while it loads.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              {...mediaImageSources(media, wide, mediaBase)}
              alt={media.alt}
              width={media.width}
              height={media.height}
              loading={first ? "eager" : "lazy"}
              fetchPriority={first ? "high" : undefined}
              decoding="async"
              className="h-auto w-full rounded-[var(--radius-panel)] border border-line bg-surface-2 object-cover"
            />
          ) : (
            <div className="grid aspect-[16/9] place-items-center rounded-[var(--radius-panel)] border border-dashed border-line-strong bg-surface-2 p-6 text-center text-sm text-muted">
              Choose an image from the media library
            </div>
          )}
          {section.caption && <figcaption className="mt-3 text-sm text-muted">{section.caption}</figcaption>}
        </figure>
      );
    }
  }
}

/** A page's sections, in order, with consistent spacing. */
export function PageBlocks({
  document,
  mode = "live",
  className,
  firstHeading = 1,
  resolveHref,
  mediaBase,
  enquiry,
  mark,
}: {
  document: PageDocument;
  mode?: Mode;
  className?: string;
  /** Level of a leading hero heading: 1 on a page of its own, 2 when embedded under another title. */
  firstHeading?: 1 | 2;
  /** Live mode: rewrites site paths for where the website is served (a path prefix or its own domain). */
  resolveHref?: HrefResolver;
  /** Where media library images are served from (the Studio uses its private proxy). */
  mediaBase?: string;
  /** Live websites: where the enquiry form sends enquiries. */
  enquiry?: EnquiryContext;
  /** The website's official mark, drawn from its brand. */
  mark?: BrandMark;
}) {
  return (
    // Blocks respond to the space they are given (container queries), so the
    // Studio preview and the website lay out the same way at the same width.
    <div data-page-blocks="" className={cn("@container space-y-block", className)}>
      {document.sections
        // Live pages never show hidden sections; previews show them dimmed and labelled.
        .filter((section) => mode === "preview" || !section.hidden)
        .map((section, i) => (
          <section
            key={section.id}
            data-section={section.type}
            data-hidden={section.hidden || undefined}
            data-tone={section.tone}
            // A light or dark surface keeps its colours whatever the visitor's theme.
            data-theme={section.tone === "light" || section.tone === "dark" ? section.tone : undefined}
            className={cn(
              section.tone && `fb-tone fb-tone-${section.tone}`,
              section.tone && FULL_TONES.has(section.tone) && "fb-tone-full",
              section.hidden && "relative rounded-2xl border border-dashed border-line-strong p-4 opacity-50",
            )}
          >
            {section.hidden && (
              <span className="absolute end-3 -top-3 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-muted">
                Hidden
              </span>
            )}
            <Block
              section={section}
              mode={mode}
              top={i === 0 ? firstHeading : 2}
              first={i === 0}
              resolve={resolveHref}
              mediaBase={mediaBase}
              enquiry={enquiry}
              mark={mark}
            />
          </section>
        ))}
    </div>
  );
}

/**
 * Employee Self-Service under the hero (owner's brief, 8 Nov 2026): across
 * every module, in a web browser on any device. Never presented as an app to
 * download.
 */
function SelfServiceHighlight({ heading, body }: { heading: string; body: string }) {
  return (
    <aside
      aria-labelledby="hero-ess"
      data-ess=""
      className="mt-10 grid gap-5 rounded-[var(--radius-panel)] border border-line bg-surface/70 p-5 backdrop-blur @3xl:grid-cols-[auto_minmax(0,1fr)_auto] @3xl:items-center @3xl:gap-8 @3xl:p-6"
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-product text-product-ink">
        <MonitorSmartphone aria-hidden className="size-6" />
      </span>
      <div className="min-w-0">
        <h2 id="hero-ess" className="font-display text-xl font-semibold text-text">
          {heading}
        </h2>
        <p className="mt-1.5 max-w-3xl text-muted">{body}</p>
      </div>
      <ul className="flex flex-wrap gap-2 text-sm text-muted" aria-label="Works in the browser on">
        {[
          { icon: Monitor, label: "Desktop" },
          { icon: Tablet, label: "Tablet" },
          { icon: Smartphone, label: "Phone browser" },
        ].map(({ icon: Icon, label }) => (
          <li
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 whitespace-nowrap"
          >
            <Icon aria-hidden className="size-4 text-product-text" />
            {label}
          </li>
        ))}
      </ul>
    </aside>
  );
}
