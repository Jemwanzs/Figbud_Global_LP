import { cn } from "@figbud/ui";
import { Gauge } from "lucide-react";

import type { BudgetLevel, PageBudget } from "./page-types";

/** What to do when a measure is past its warning. */
const ADVICE: Record<string, string> = {
  sections: "Combine or hide sections, or move some to a page of their own.",
  images: "Use fewer images, or move some to a page of their own.",
  image_bytes: "Use fewer images, or simpler ones: detailed photos weigh more than flat graphics.",
  largest_image: "Replace the largest image with a simpler one; it's already resized for phones.",
  text_bytes: "Shorten the text, or split it across pages.",
};

const LEVEL: Record<BudgetLevel, { label: string; pill: string; bar: string }> = {
  ok: { label: "Within budget", pill: "bg-success/15 text-success", bar: "bg-success" },
  warn: { label: "Getting heavy", pill: "bg-warning/15 text-text", bar: "bg-warning" },
  over: { label: "Over budget", pill: "bg-danger/10 text-danger", bar: "bg-danger" },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(bytes ? 1 : 0, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}

/**
 * Performance budget (P7-G4): what a phone downloads for the saved draft,
 * measured by the API. Past a warning it says what to change; past a limit
 * the page can't be submitted or approved.
 */
export function PerformancePanel({ budget, headingId }: { budget: PageBudget | null; headingId: string }) {
  if (!budget) return null;
  const level = LEVEL[budget.level];
  const show = (value: number, unit: "count" | "bytes") =>
    unit === "bytes" ? formatBytes(value) : String(value);
  return (
    <section aria-labelledby={headingId} className="fb-panel rounded-[var(--radius-panel)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 font-semibold text-text">
          <Gauge aria-hidden className="size-4 text-accent" />
          Performance
        </h2>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", level.pill)}>
          {level.label}
        </span>
      </div>
      <ul className="mt-4 space-y-3.5">
        {budget.checks.map((check) => {
          const style = LEVEL[check.level];
          return (
            <li key={check.key} data-check={check.key} data-level={check.level}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-text">{check.label}</span>
                <span className="shrink-0 text-muted tabular-nums">
                  {show(check.value, check.unit)}
                  <span className="text-subtle"> of {show(check.limit, check.unit)}</span>
                </span>
              </div>
              <div aria-hidden className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-300", style.bar)}
                  style={{ width: `${Math.min(100, (check.value / check.limit) * 100)}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-line-strong"
                  style={{ left: `${(check.warn / check.limit) * 100}%` }}
                />
              </div>
              {check.level !== "ok" && (
                <p className={cn("mt-1 text-xs", check.level === "over" ? "text-danger" : "text-muted")}>
                  {check.level === "over" ? "Over the limit. " : "Past the recommended size. "}
                  {ADVICE[check.key]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-subtle">
        Measured from the saved draft, as a phone downloads it (hidden sections don&apos;t count). Over a
        limit, the page can&apos;t be submitted or approved.
      </p>
    </section>
  );
}
