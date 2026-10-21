import type { ReactNode } from "react";

import { cn } from "./cn";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-3 text-xs font-medium tracking-[0.18em] text-accent uppercase",
        className,
      )}
    >
      <span aria-hidden className="h-px w-8 bg-current opacity-60" />
      {children}
    </p>
  );
}
