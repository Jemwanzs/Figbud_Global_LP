"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

/** A password input with a show/hide button. 16px text, so phones don't zoom in on focus. */
export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete,
  invalid,
  describedBy,
  aside,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  describedBy?: string;
  /** Beside the label, such as the "Forgot password?" link. */
  aside?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium text-text">
          {label}
        </label>
        {aside}
      </div>
      <div className="relative mt-2">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className="min-h-12 w-full rounded-xl border border-line-strong bg-surface ps-4 pe-14 text-base text-text"
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute end-1 top-1/2 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          {shown ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
        </button>
      </div>
    </div>
  );
}
