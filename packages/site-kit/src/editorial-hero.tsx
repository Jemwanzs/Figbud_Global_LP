"use client";

import { cn } from "@figbud/ui";
import type { CSSProperties, ReactNode } from "react";

import { type HeroConfig, heroHeight, heroPace, useHeroMotion, useOnScreen, useStages } from "./hero-kit";

/*
 * The editorial hero (UI-MO8): the third hero style in the brief, beside each
 * website's default and motion-led designs. A magazine-like composition: an
 * oversized headline across the page under a drawn hairline, a numbered index
 * of chapters, and layered sheets that change places as the index moves on
 * (or as a visitor chooses a chapter). The headline renders at once (it's
 * the page's LCP); only the rule and the sheets move, with transforms and
 * opacity, paused off screen and still with reduced motion.
 */

export interface EditorialChapter {
  key: string;
  title: string;
  /** A short line under the title in the index. */
  meta?: string;
  /** The sheet shown for this chapter (decorative: the index carries the words). */
  sheet: ReactNode;
}

export function EditorialHero({
  id,
  design,
  product,
  config,
  identity,
  eyebrow,
  headline,
  accent,
  lead,
  actions,
  chapters,
  indexLabel,
  note,
}: {
  /** The heading's id (the section is labelled by it). */
  id: string;
  /** `data-hero`, for the Studio and tests. */
  design: string;
  /** Whose accent colours the composition takes. */
  product: string;
  config: HeroConfig;
  identity?: ReactNode;
  eyebrow: string;
  headline: string;
  accent?: string | null;
  lead: string;
  actions: ReactNode;
  chapters: EditorialChapter[];
  indexLabel: string;
  /** Under the sheets, such as "Illustrative product activity · synthetic data". */
  note?: string;
}) {
  const motion = useHeroMotion(config);
  const { ref, on } = useOnScreen<HTMLElement>();
  const pace = heroPace(config);
  const stages = useStages(chapters.length, 4.5 * pace, motion && on);
  const active = stages.index;
  const count = chapters.length;
  return (
    <section
      ref={ref}
      aria-labelledby={id}
      data-hero={design}
      data-product={product}
      data-moving={motion || undefined}
      className={cn("fb-ed relative isolate overflow-hidden", heroHeight(config))}
      style={{ "--ed-pace": pace } as CSSProperties}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -start-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(closest-side,var(--product-soft),transparent)]" />
      </div>
      <div className="mx-auto max-w-[92rem] px-5 pt-page-top pb-section-sm sm:px-8 md:px-10 lg:px-16">
        {identity && <div className="mb-6 flex">{identity}</div>}
        <p className="flex items-center gap-3 text-xs font-medium tracking-[0.2em] text-product-text uppercase">
          <span aria-hidden className="fb-ed-rule h-px w-10 origin-left bg-product rtl:origin-right" />
          {eyebrow}
        </p>
        <h1
          id={id}
          className="mt-5 max-w-[18ch] font-display text-[clamp(2.6rem,1.4rem+5vw,6.25rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-balance text-text"
        >
          <span className="block">{headline}</span>
          {accent && <span className="block font-light text-product-text">{accent}</span>}
        </h1>
        <div
          aria-hidden
          className="fb-ed-rule mt-8 h-px origin-left bg-line-strong lg:mt-10 rtl:origin-right"
        />

        <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <p className="max-w-xl text-lead text-muted">{lead}</p>
            {actions}
            <ol aria-label={indexLabel} className="mt-10 border-t border-line">
              {chapters.map((chapter, i) => {
                const current = i === active;
                return (
                  <li key={chapter.key} className="border-b border-line">
                    <button
                      type="button"
                      aria-pressed={current}
                      onClick={() => stages.choose(i)}
                      onMouseEnter={() => stages.hold(true)}
                      onMouseLeave={() => stages.hold(false)}
                      onFocus={() => stages.hold(true)}
                      onBlur={() => stages.hold(false)}
                      className="group relative grid min-h-14 w-full grid-cols-[2.5rem_1fr] items-baseline gap-x-3 py-3 text-start focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "font-mono text-sm transition-colors duration-300",
                          current ? "text-product-text" : "text-subtle",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>
                        <span
                          className={cn(
                            "block font-display text-lg font-medium transition-colors duration-300",
                            current ? "text-text" : "text-muted group-hover:text-text",
                          )}
                        >
                          {chapter.title}
                        </span>
                        {chapter.meta && <span className="block text-sm text-subtle">{chapter.meta}</span>}
                      </span>
                      {/* How long until the next chapter, while the index moves on by itself. */}
                      <span
                        aria-hidden
                        key={current && motion && on ? `on-${active}` : "off"}
                        className={cn(
                          "absolute start-0 -bottom-px h-px origin-left bg-product rtl:origin-right",
                          current ? "w-full" : "w-0",
                          current && motion && on && "fb-ed-progress",
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="lg:col-span-7">
            <div aria-hidden className="relative mx-auto aspect-[4/3] w-full max-w-2xl lg:max-w-none">
              {chapters.map((chapter, i) => {
                // How far behind the current sheet this one sits (0 = in front).
                const depth = (i - active + count) % count;
                return (
                  <div
                    key={chapter.key}
                    data-sheet={chapter.key}
                    data-current={depth === 0 || undefined}
                    className="fb-ed-sheet absolute inset-0 transition-[transform,opacity] duration-[var(--motion-slow)] ease-[var(--motion-ease)]"
                    style={{
                      zIndex: count - depth,
                      opacity: depth > 2 ? 0 : 1 - depth * 0.28,
                      transform: `translate3d(${depth * 4.5}%, ${depth * -5}%, 0) scale(${1 - depth * 0.07})`,
                      animationDelay: `${0.15 + i * 0.12}s`,
                    }}
                  >
                    <div className="size-full overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-elevated)]">
                      {chapter.sheet}
                    </div>
                  </div>
                );
              })}
            </div>
            {note && <p className="mt-4 text-end text-[0.7rem] text-subtle">{note}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
