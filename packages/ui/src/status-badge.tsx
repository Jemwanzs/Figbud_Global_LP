import { cn } from "./cn";

export type BadgeStatus = "active" | "coming_soon" | "planned";

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: BadgeStatus;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        status === "active" && "border-success/30 bg-success/10 text-success",
        status === "coming_soon" && "border-product/30 bg-product-soft text-product-text",
        status === "planned" && "border-line-strong text-subtle",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "active" && "motion-safe:animate-[fb-pulse_2.4s_ease-in-out_infinite]",
        )}
      />
      {label}
    </span>
  );
}
