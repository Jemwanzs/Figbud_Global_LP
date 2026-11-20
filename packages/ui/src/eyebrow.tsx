import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * A section's eyebrow label with its accent dash (owner's brief, 20 Nov 2026):
 * "— OUR SUCCESS STORY". The dash comes first, 2px thick, 24px on phones and
 * 32px wider up, 10–12px from the label, in the label's colour (the
 * website's accent unless a caller sets another). Dash and label are one
 * unit: centred together, never wrapping apart.
 *
 * The dash is centred by flex against the label's capital letters: the
 * label's box is trimmed to its cap height (`text-box`, with tight leading
 * where a browser lacks it), so the dash sits on the letters' centre
 * whatever the font's metrics, with no offsets or measuring.
 */
export function SectionEyebrow({
  children,
  className,
  dash = true,
  align = "start",
  dashClassName,
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  /** Without the dash, the label alone. */
  dash?: boolean;
  /** "center" centres dash and label together as one group. */
  align?: "start" | "center";
  /** Extra classes for the dash (a colour of its own, an entrance animation). */
  dashClassName?: string;
  as?: "p" | "span" | "div";
}) {
  return (
    <Tag
      data-eyebrow=""
      className={cn(
        // Inline, so a centred parent centres the group, as before.
        "inline-flex max-w-full items-center gap-2.5 text-[0.6875rem] font-medium tracking-[0.12em] text-accent uppercase sm:gap-3 sm:text-xs sm:tracking-[0.15em]",
        align === "center" && "mx-auto flex w-fit justify-center",
        className,
      )}
    >
      {dash && (
        <span
          aria-hidden
          data-eyebrow-dash=""
          className={cn("block h-0.5 w-6 shrink-0 rounded-full bg-current sm:w-8", dashClassName)}
        />
      )}
      <span className="min-w-0 leading-none [text-box:trim-both_cap_alphabetic]">{children}</span>
    </Tag>
  );
}

/** The eyebrow as used before: the shared label and dash. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <SectionEyebrow className={className}>{children}</SectionEyebrow>;
}
