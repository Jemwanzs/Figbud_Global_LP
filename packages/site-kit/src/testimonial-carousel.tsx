"use client";

import { cn } from "@figbud/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * Approved testimonials one at a time (owner's brief, 20 Nov 2026, P10-R4):
 * moved by hand with previous and next, or a dot per testimonial; never
 * rotating by itself. Every card shares one grid cell, so the band keeps the
 * tallest card's height and nothing jumps as they change. Hidden cards are
 * inert, so only the one shown is read out or reached with the keyboard.
 */
export function TestimonialCarousel({
  slides,
  label,
  names,
}: {
  slides: ReactNode[];
  /** The list's name, for screen readers ("Customer testimonials"). */
  label: string;
  /** Who each testimonial is from, for its dot. */
  names: string[];
}) {
  const [index, setIndex] = useState(0);
  const count = slides.length;
  const go = (i: number) => setIndex((i + count) % count);
  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      data-testimonial-carousel=""
      className="mx-auto max-w-[46rem]"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + (document.dir === "rtl" ? -1 : 1));
        if (e.key === "ArrowLeft") go(index + (document.dir === "rtl" ? 1 : -1));
      }}
    >
      <ul className="grid">
        {slides.map((slide, i) => (
          <li
            key={i}
            aria-roledescription="slide"
            aria-label={`${i + 1} / ${count}`}
            aria-hidden={i !== index}
            inert={i !== index}
            data-current={i === index || undefined}
            className={cn(
              "transition-opacity duration-[var(--motion-base)] [grid-area:1/1] motion-reduce:transition-none",
              i === index ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            {slide}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label="Previous testimonial"
          onClick={() => go(index - 1)}
          className="grid size-10 cursor-pointer place-items-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:text-text"
        >
          <ChevronLeft aria-hidden className="size-4 rtl:rotate-180" />
        </button>
        <span className="flex gap-1">
          {names.map((name, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Testimonial ${i + 1}: ${name}`}
              aria-current={i === index || undefined}
              onClick={() => go(i)}
              className="grid size-6 cursor-pointer place-items-center rounded-full"
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-[width,background-color] duration-[var(--motion-base)]",
                  i === index ? "w-5 bg-product" : "w-1.5 bg-line-strong",
                )}
              />
            </button>
          ))}
        </span>
        <button
          type="button"
          aria-label="Next testimonial"
          onClick={() => go(index + 1)}
          className="grid size-10 cursor-pointer place-items-center rounded-full border border-line text-muted transition-colors hover:border-line-strong hover:text-text"
        >
          <ChevronRight aria-hidden className="size-4 rtl:rotate-180" />
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {`${index + 1} / ${count}`}
      </p>
    </div>
  );
}
