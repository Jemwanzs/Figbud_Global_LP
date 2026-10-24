import { buttonClasses, cn } from "@figbud/ui";
import { ArrowRight, Check } from "lucide-react";
import type { ReactNode } from "react";

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
}

export type PageSection = Base &
  (
    | {
        type: "hero";
        eyebrow?: string | null;
        heading: string;
        lead?: string | null;
        primary?: PageCta | null;
        secondary?: PageCta | null;
      }
    | { type: "text"; heading?: string | null; body?: string; body_html?: string }
    | {
        type: "feature_grid";
        heading?: string | null;
        intro?: string | null;
        items: { title: string; body: string }[];
      }
    | { type: "steps"; heading?: string | null; items: { title: string; body: string }[] }
    | { type: "stats"; heading?: string | null; items: { value: string; label: string }[]; source: string }
    | {
        type: "faq";
        heading?: string | null;
        items: { question: string; answer?: string; answer_html?: string }[];
      }
    | { type: "call_to_action"; heading: string; body?: string | null; cta: PageCta }
  );

export interface PageDocument {
  seo_title?: string | null;
  seo_description?: string | null;
  sections: PageSection[];
}

/** `preview`: links don't navigate (the Studio); `live`: real links on the website. */
type Mode = "live" | "preview";

function Action({ cta, mode, primary }: { cta: PageCta; mode: Mode; primary?: boolean }) {
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
    <a href={cta.href} className={className}>
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

function Heading({ children, level = 2 }: { children: ReactNode; level?: 1 | 2 }) {
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag
      className={cn(
        "font-display font-semibold tracking-tight text-text",
        level === 1 ? "text-display" : "text-title",
      )}
    >
      {children}
    </Tag>
  );
}

function Block({ section, mode, top }: { section: PageSection; mode: Mode; top: 1 | 2 }) {
  switch (section.type) {
    case "hero":
      return (
        <div className="max-w-3xl">
          {section.eyebrow && (
            <p className="text-sm font-medium tracking-[0.14em] text-product-text uppercase">
              {section.eyebrow}
            </p>
          )}
          <div className="mt-4">
            <Heading level={top}>{section.heading}</Heading>
          </div>
          {section.lead && <p className="mt-6 text-lead text-muted">{section.lead}</p>}
          {(section.primary || section.secondary) && (
            <div className="mt-9 flex flex-col gap-3 @lg:flex-row">
              {section.primary && <Action cta={section.primary} mode={mode} primary />}
              {section.secondary && <Action cta={section.secondary} mode={mode} />}
            </div>
          )}
        </div>
      );
    case "text":
      return (
        <div>
          {section.heading && (
            <div className="mb-6">
              <Heading>{section.heading}</Heading>
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
              "grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3",
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
      return (
        <div>
          {section.heading && <Heading>{section.heading}</Heading>}
          <ol className={cn("grid gap-4 @3xl:grid-cols-3", section.heading && "mt-10")}>
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
        <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface p-8 @2xl:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute end-[-10%] -top-24 h-64 w-64 rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]"
          />
          <div className="relative max-w-2xl">
            <Heading>{section.heading}</Heading>
            {section.body && <p className="mt-4 text-muted">{section.body}</p>}
            <div className="mt-8">
              <Action cta={section.cta} mode={mode} primary />
            </div>
          </div>
        </div>
      );
  }
}

/** A page's sections, in order, with consistent spacing. */
export function PageBlocks({
  document,
  mode = "live",
  className,
  firstHeading = 1,
}: {
  document: PageDocument;
  mode?: Mode;
  className?: string;
  /** Level of a leading hero heading: 1 on a page of its own, 2 when embedded under another title. */
  firstHeading?: 1 | 2;
}) {
  return (
    // Blocks respond to the space they are given (container queries), so the
    // Studio preview and the website lay out the same way at the same width.
    <div className={cn("@container space-y-16 sm:space-y-20", className)}>
      {document.sections.map((section, i) => (
        <section key={section.id} data-section={section.type}>
          <Block section={section} mode={mode} top={i === 0 ? firstHeading : 2} />
        </section>
      ))}
    </div>
  );
}
