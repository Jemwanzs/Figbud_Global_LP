"use client";

import { cn } from "@figbud/ui";
import { type CSSProperties, useCallback, useEffect, useId, useRef, useState } from "react";

import type { StoryMotion } from "./scroll-story";

/*
 * Numbered storytelling (owner's brief, 8 Nov 2026): thin outlined numbers
 * beside each heading, and a dot-matrix pattern at the section's edge. As the
 * page scrolls, the row nearest the middle of the screen becomes current: its
 * number fills softly, and the dots light around its height. Scrolling back
 * up does the same in reverse. Nothing pins and nothing adds scroll length;
 * rows are as tall as their words. Numbers and dots are decorative (the list
 * is an ordered list, so the order is announced) and never take a pointer.
 * The website's accent colours: ZiraHR's oranges, FigBud Global's green and
 * blue. With reduced motion, or motion "off", nothing animates.
 */

/**
 * Which of `count` rows crosses the middle of the screen (the current one, in
 * either scroll direction), and how many have come into view (their words
 * show from then on, so nothing on screen waits for the middle line).
 */
export function useCurrentRow(count: number) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [current, setCurrent] = useState(0);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    const els = rows.current.slice(0, count).filter((el): el is HTMLElement => !!el);
    const index = (el: Element) => Number((el as HTMLElement).dataset.row);
    // A line across the middle of the screen: the row crossing it is current.
    const middle = new IntersectionObserver(
      (entries) => {
        const crossing = entries.filter((e) => e.isIntersecting).map((e) => index(e.target));
        if (crossing.length) setCurrent(Math.max(...crossing));
      },
      { rootMargin: "-50% 0px -50% 0px" },
    );
    // Most of the way up the screen: the row has been seen.
    const view = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((e) => e.isIntersecting).map((e) => index(e.target) + 1);
        if (shown.length) setSeen((s) => Math.max(s, ...shown));
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of els) {
      middle.observe(el);
      view.observe(el);
    }
    return () => {
      middle.disconnect();
      view.disconnect();
    };
  }, [count]);
  const register = useCallback(
    (i: number) => (el: HTMLElement | null) => {
      rows.current[i] = el;
    },
    [],
  );
  return { current, seen, register };
}

/**
 * A large outlined number: thin stroke, softly filled while current. Drawn as
 * SVG text, so the outline stays the same thin line at every size and the
 * number, which is decoration, isn't taken for body text.
 */
export function OutlineNumber({
  n,
  current,
  className,
}: {
  n: number;
  current: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 124 100"
      data-current={current || undefined}
      className={cn("fb-outline-num h-[1em] w-[1.24em] overflow-visible select-none", className)}
    >
      <text x="2" y="86" fontSize="100" className="font-display font-semibold">
        {String(n).padStart(2, "0")}
      </text>
    </svg>
  );
}

// A fixed, gently irregular grid: sizes vary a little, and the edges fade out.
const COLS = 9;
const ROWS = 16;
const DOTS = Array.from({ length: COLS * ROWS }, (_, k) => {
  const c = k % COLS;
  const r = Math.floor(k / COLS);
  const size = 0.62 + (((c * 7 + r * 13) % 5) / 5) * 0.5;
  // Fades toward the outer columns and the top and bottom rows.
  const edge = Math.min(1, (COLS - 1 - c) / 3 + 0.25) * Math.min(1, Math.min(r, ROWS - 1 - r) / 3 + 0.2);
  return { c, r, size, edge };
});

/** Decorative dots that light around the current step's height. */
export function DotMatrix({
  step,
  count,
  motion = "standard",
  className,
}: {
  step: number;
  count: number;
  motion?: StoryMotion;
  className?: string;
}) {
  const gradient = useId();
  const band = ((step + 0.5) / Math.max(1, count)) * ROWS;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${COLS * 4} ${ROWS * 4}`}
      data-motion={motion}
      style={{ "--dot-step": step } as CSSProperties}
      className={cn("fb-dots pointer-events-none select-none", className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--dot-from)" }} />
          <stop offset="100%" style={{ stopColor: "var(--dot-to)" }} />
        </linearGradient>
      </defs>
      <g fill={`url(#${gradient})`}>
        {DOTS.map(({ c, r, size, edge }) => {
          // Brighter near the current step's band.
          const near = Math.max(0, 1 - Math.abs(r - band) / (ROWS / 2.5));
          return (
            <circle
              key={`${c}-${r}`}
              cx={c * 4 + 2}
              cy={r * 4 + 2}
              r={size}
              style={{ opacity: edge * (0.16 + 0.6 * near), transitionDelay: `${(c + r) * 12}ms` }}
              className="fb-dot"
            />
          );
        })}
      </g>
    </svg>
  );
}

/** The steps block's "story" style: numbered rows, each current in turn, with dots beside them. */
export function NumberedStory({
  heading,
  intro,
  items,
  dots,
  motion = "standard",
}: {
  heading?: string | null;
  intro?: string | null;
  items: { title: string; body: string }[];
  dots: boolean;
  motion?: StoryMotion;
}) {
  const { current, seen, register } = useCurrentRow(items.length);
  return (
    <div data-numbered="" data-motion={motion} className="relative">
      {heading && <h2 className="font-display text-headline font-semibold text-text">{heading}</h2>}
      {intro && <p className="mt-4 max-w-2xl text-lead text-muted">{intro}</p>}
      <div
        className={cn(
          "grid gap-8 @5xl:items-start",
          dots && "@5xl:grid-cols-[minmax(0,1fr)_14rem]",
          (heading || intro) && "mt-stack",
        )}
      >
        <ol className="grid">
          {items.map((item, i) => (
            <li
              key={i}
              ref={register(i)}
              data-row={i}
              data-current={i === current || undefined}
              data-seen={i < seen || undefined}
              // The number sits level with its heading; the description runs beneath the heading.
              className="fb-numbered-row fb-num-row grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-4 border-t border-line py-6 last:border-b @xl:grid-cols-[6rem_minmax(0,1fr)] @xl:gap-x-6 @xl:py-8"
            >
              <OutlineNumber n={i + 1} current={i === current} className="text-[3rem] @xl:text-[4.5rem]" />
              <h3 className="fb-numbered-words font-display text-title font-semibold text-text">
                {item.title}
              </h3>
              <p className="fb-numbered-words col-start-2 max-w-prose leading-relaxed text-muted">
                {item.body}
              </p>
            </li>
          ))}
        </ol>
        {dots && (
          // Beside the list on wide screens, where it never sits behind words; left out on narrow ones.
          <div className="sticky top-24 hidden @5xl:block">
            <DotMatrix step={current} count={items.length} motion={motion} className="h-auto w-full" />
          </div>
        )}
      </div>
    </div>
  );
}
