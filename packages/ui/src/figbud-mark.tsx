import { useId } from "react";

import { cn } from "./cn";

/** The FigBud mark: an "F" formed by a stem, a leaf and a bud. */
export function FigBudMark({ className, title }: { className?: string; title?: string }) {
  const gradient = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient id={gradient} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F6BD82" />
          <stop offset="0.55" stopColor="#F0A65D" />
          <stop offset="1" stopColor="#A66538" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      <rect x="9.4" y="7.4" width="3.7" height="17.2" rx="1.85" fill="#15120F" />
      <path d="M12.6 11.6C14.2 7.7 19.4 6.3 24.3 7.3 23.3 10.6 18.6 12.5 12.6 11.6Z" fill="#15120F" />
      <circle cx="17.6" cy="16.6" r="2.5" fill="#15120F" />
    </svg>
  );
}

export function FigBudWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <FigBudMark />
      <span className="text-[1.15rem] leading-none font-semibold tracking-[-0.02em] whitespace-nowrap text-text">
        FigBud <span className="font-normal text-muted">Global</span>
      </span>
    </span>
  );
}
