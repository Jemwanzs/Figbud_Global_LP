"use client";

import { cn } from "@figbud/ui";
import { Check, RotateCcw } from "lucide-react";
import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/get-dictionary";

/** An approval workflow that executes step by step when scrolled into view. */
export function WorkflowDemo({ copy }: { copy: Dictionary["home"]["engineer"]["workflow"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20% 0px" });
  const reduceMotion = useReducedMotion();
  const total = copy.steps.length;
  const [run, setRun] = useState(0);
  const [completed, setCompleted] = useState(0);
  const shown = reduceMotion ? total : completed;

  useEffect(() => {
    if (!inView || reduceMotion) return;
    let step = 0;
    const id = window.setInterval(() => {
      step += 1;
      setCompleted(step);
      if (step >= total) window.clearInterval(id);
    }, 750);
    return () => window.clearInterval(id);
  }, [inView, reduceMotion, total, run]);

  const replay = () => {
    setCompleted(0);
    setRun((r) => r + 1);
  };

  return (
    <div ref={ref} className="fb-panel rounded-[var(--radius-card)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text">{copy.title}</p>
          <p className="mt-0.5 text-xs text-subtle">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={replay}
          disabled={!reduceMotion && shown < total}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40"
        >
          <RotateCcw aria-hidden className="size-3.5" />
          {copy.replay}
        </button>
      </div>

      <ol className="relative mt-6 space-y-1" aria-live="polite">
        <span aria-hidden className="absolute start-[0.9rem] top-3 bottom-3 w-px bg-line-strong" />
        <span
          aria-hidden
          className="absolute start-[0.9rem] top-3 w-px origin-top bg-accent transition-[height] duration-700 ease-out-expo"
          style={{ height: `calc((100% - 1.5rem) * ${Math.max(0, shown - 1) / (total - 1)})` }}
        />
        {copy.steps.map((step, i) => {
          const done = i < shown;
          const current = i === shown;
          return (
            <li key={step.label} className="relative flex items-center gap-4 py-2">
              <span
                className={cn(
                  "relative z-10 inline-flex size-[1.8rem] shrink-0 items-center justify-center rounded-full border transition-all duration-500",
                  done && "border-accent bg-accent text-accent-ink",
                  current && "border-accent/60 bg-bg-elevated",
                  !done && !current && "border-line-strong bg-bg-elevated",
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-3.5" strokeWidth={3} />
                ) : (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      current
                        ? "bg-accent motion-safe:animate-[fb-pulse_1.2s_ease-in-out_infinite]"
                        : "bg-subtle/50",
                    )}
                  />
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className={cn("text-sm transition-colors", done ? "text-text" : "text-subtle")}>
                  {step.label}
                </span>
                <span className="shrink-0 font-mono text-[0.68rem] text-subtle">{step.meta}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
