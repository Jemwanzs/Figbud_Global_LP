"use client";

import { DotMatrix, OutlineNumber, useCurrentRow } from "@figbud/site-kit";
import { RevealGroup, revealOrder } from "@figbud/ui";
import type { ReactNode } from "react";

/**
 * Our philosophy's three principles as numbered storytelling (owner's brief,
 * 8 Nov 2026): outlined numbers in FigBud's green, the row nearest the middle
 * of the screen current (its number softly filled), in either scroll
 * direction, and a green-to-blue dot pattern beside the heading that lights
 * at the current row's level. Each row still reveals on its own as it
 * scrolls in: accent line, number, title, then description, sharing a
 * baseline on wider screens.
 */
export function PhilosophySteps({
  heading,
  items,
}: {
  heading: ReactNode;
  items: readonly { title: string; body: string }[];
}) {
  const { current, register } = useCurrentRow(items.length);
  return (
    <div className="fb-accent-numbers">
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_13rem]">
        {heading}
        {/* Beside the heading, never behind words; left out on narrower screens. */}
        <DotMatrix step={current} count={items.length} className="hidden h-auto w-full lg:block" />
      </div>
      <ol className="mt-stack">
        {items.map((item, i) => (
          <li
            key={item.title}
            ref={register(i)}
            data-row={i}
            data-current={i === current || undefined}
            className="relative border-t border-line last:border-b"
          >
            <RevealGroup className="grid gap-2.5 py-6 sm:py-7 md:grid-cols-12 md:items-baseline md:gap-x-8 md:gap-y-0 md:py-8">
              <span
                aria-hidden
                style={revealOrder(0)}
                className="fb-reveal-line absolute start-0 -top-px h-px w-2/5 bg-gradient-to-r from-accent/80 to-transparent rtl:bg-gradient-to-l"
              />
              <span className="fb-reveal-roll md:col-span-2">
                <span style={revealOrder(1)} className="block">
                  <OutlineNumber
                    n={i + 1}
                    current={i === current}
                    // The digits' baseline is 14% above the picture's bottom: the margin lines them up with the title's.
                    className="-mb-[0.14em] text-[2.75rem] md:text-[3.75rem]"
                  />
                </span>
              </span>
              <h3
                style={revealOrder(2, { x: "calc(var(--motion-distance-lg) * -1)", y: "0px" })}
                className="fb-reveal-item font-display text-title font-medium text-text md:col-span-4"
              >
                {item.title}
              </h3>
              <p
                style={revealOrder(3, { x: "calc(var(--motion-distance) * -1)", y: "0px" })}
                className="fb-reveal-item max-w-prose leading-7 text-muted md:col-span-6 md:text-[1.0625rem]"
              >
                {item.body}
              </p>
            </RevealGroup>
          </li>
        ))}
      </ol>
    </div>
  );
}
