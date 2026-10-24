"use client";

import { type ButtonVariant, buttonClasses } from "@figbud/ui";
import { LoaderCircle } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useId } from "react";

/**
 * The one button for Admin Studio actions (Save, Create, Submit, Apply,
 * Publish, Discard). It is enabled only when its own action is `ready`;
 * while `busy` it shows progress and can't be pressed again, so nothing is
 * submitted twice. When it isn't ready, `hint` says why ("Nothing to save").
 */
export function ActionButton({
  ready,
  busy = false,
  hint,
  variant = "primary",
  icon,
  className,
  children,
  ...props
}: {
  ready: boolean;
  busy?: boolean;
  /** Why the action isn't available right now; shown beside the button. */
  hint?: string;
  variant?: ButtonVariant;
  icon?: ReactNode;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled">) {
  const hintId = useId();
  const showHint = !busy && !ready && hint;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        {...props}
        disabled={!ready || busy}
        aria-busy={busy || undefined}
        aria-describedby={showHint ? hintId : props["aria-describedby"]}
        className={buttonClasses(variant, "md", className)}
      >
        {busy ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : icon}
        {children}
      </button>
      {showHint && (
        <span id={hintId} className="text-sm text-subtle">
          {hint}
        </span>
      )}
    </span>
  );
}
