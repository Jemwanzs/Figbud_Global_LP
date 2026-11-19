"use client";

import { cn } from "@figbud/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * The Results carousel (P10-R1): a scroll-snapping row with previous and
 * next; optional rotation that pauses on hover, focus and off screen and
 * never runs with reduced motion.
 */
export function ResultsCarousel({
  children,
  autoplay,
  interval,
  labels,
}: {
  children: ReactNode;
  autoplay: boolean;
  interval: number;
  labels: { previous: string; next: string };
}) {
  const row = useRef<HTMLDListElement>(null);
  const [held, setHeld] = useState(false);
  const step = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const width = (card?.offsetWidth ?? el.clientWidth) + 16;
    const rtl = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    const end = el.scrollLeft * rtl + el.clientWidth >= el.scrollWidth - 4;
    if (dir === 1 && end) el.scrollTo({ left: 0, behavior: "smooth" });
    else el.scrollBy({ left: dir * width * rtl, behavior: "smooth" });
  };
  useEffect(() => {
    const el = row.current;
    if (!autoplay || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = Boolean(e?.isIntersecting)), { threshold: 0.4 });
    io.observe(el);
    const timer = window.setInterval(() => {
      if (visible && !held && !document.hidden) step(1);
    }, interval * 1000);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [autoplay, interval, held]);
  const button =
    "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-text hover:border-line-strong";
  return (
    <div
      data-results-layout="carousel"
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <dl
        ref={row}
        tabIndex={0}
        className={cn(
          "flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto scroll-smooth pb-2",
        )}
      >
        {children}
      </dl>
      <div className="mt-4 flex justify-center gap-2">
        <button type="button" onClick={() => step(-1)} aria-label={labels.previous} className={button}>
          <ChevronLeft aria-hidden className="size-5 rtl:rotate-180" />
        </button>
        <button type="button" onClick={() => step(1)} aria-label={labels.next} className={button}>
          <ChevronRight aria-hidden className="size-5 rtl:rotate-180" />
        </button>
      </div>
    </div>
  );
}
