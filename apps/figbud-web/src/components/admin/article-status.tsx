import { cn } from "@figbud/ui";

export type Status = "draft" | "in_review" | "published" | "archived";

const STYLES: Record<Status | "scheduled", { label: string; className: string }> = {
  draft: { label: "Draft", className: "border-line text-muted" },
  in_review: { label: "In review", className: "border-warning/40 bg-warning/10 text-warning" },
  scheduled: { label: "Scheduled", className: "border-accent/40 bg-accent-soft text-accent" },
  published: { label: "Published", className: "border-success/30 bg-success/10 text-success" },
  archived: { label: "Archived", className: "border-line bg-surface-2 text-subtle" },
};

/** Status pill; `scheduled` (from the API's clock) marks a published article not yet live. */
export function ArticleStatus({ status, scheduled = false }: { status: Status; scheduled?: boolean }) {
  const style = STYLES[scheduled ? "scheduled" : status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {style.label}
    </span>
  );
}
