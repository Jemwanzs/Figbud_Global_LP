"use client";

import { cn } from "@figbud/ui";
import { useState } from "react";

import { passwordProblem, passwordStrength } from "@/lib/password-rules";

import { PasswordField } from "./password-field";

/** Whether a new password and its confirmation are ready to send. */
export function newPasswordReady(password: string, confirm: string, email = "", name = "") {
  return password === confirm && passwordProblem(password, email, name) === null;
}

/**
 * New password and its confirmation, each with show/hide, a strength guide
 * and inline messages (shown once a field has been left, or on submit). The
 * same rules as the API; it checks again.
 */
export function NewPasswordFields({
  idPrefix,
  password,
  confirm,
  onPassword,
  onConfirm,
  email,
  name,
  showErrors = false,
  labels = { password: "New password", confirm: "Confirm new password" },
  serverError,
}: {
  idPrefix: string;
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  /** Used to warn against passwords containing them, as the API does. */
  email?: string;
  name?: string;
  /** Show every message now (after a submit attempt). */
  showErrors?: boolean;
  labels?: { password: string; confirm: string };
  /** The API's reason, when it refused the password. */
  serverError?: string | null;
}) {
  const [left, setLeft] = useState({ password: false, confirm: false });
  const problem = password ? passwordProblem(password, email, name) : null;
  const strength = passwordStrength(password, email, name);
  const mismatch = confirm.length > 0 && confirm !== password;
  const showProblem =
    (left.password || showErrors) && (problem ?? (showErrors && !password ? "Enter a password." : null));
  const showMismatch = (left.confirm || showErrors) && (mismatch || (showErrors && !confirm && password));
  const hintId = `${idPrefix}-hint`;
  const strengthId = `${idPrefix}-strength`;
  const errorId = `${idPrefix}-error`;
  const confirmErrorId = `${idPrefix}-confirm-error`;
  const passwordError = serverError ?? (typeof showProblem === "string" ? showProblem : null);

  return (
    <div className="grid gap-4">
      <div onBlur={() => setLeft((l) => ({ ...l, password: true }))}>
        <PasswordField
          id={`${idPrefix}-password`}
          label={labels.password}
          value={password}
          onChange={onPassword}
          autoComplete="new-password"
          invalid={Boolean(passwordError)}
          describedBy={[hintId, strengthId, passwordError ? errorId : ""].filter(Boolean).join(" ")}
        />
        <p id={hintId} className="mt-2 text-sm text-subtle">
          At least 12 characters. A short phrase of a few words is strong and easy to remember.
        </p>
        <div id={strengthId} className="mt-2 flex items-center gap-3" aria-live="polite">
          <span aria-hidden className="grid h-1.5 flex-1 grid-cols-3 gap-1">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={cn(
                  "rounded-full transition-colors",
                  strength.score >= n
                    ? strength.score === 1
                      ? "bg-warning"
                      : "bg-success"
                    : password && strength.score === 0 && n === 1
                      ? "bg-danger"
                      : "bg-line",
                )}
              />
            ))}
          </span>
          <span className="min-w-16 text-xs text-muted">
            {strength.label && <span className="sr-only">Password strength: </span>}
            {strength.label}
          </span>
        </div>
        {passwordError && (
          <p id={errorId} className="mt-2 text-sm text-danger">
            {passwordError}
          </p>
        )}
      </div>
      <div onBlur={() => setLeft((l) => ({ ...l, confirm: true }))}>
        <PasswordField
          id={`${idPrefix}-confirm`}
          label={labels.confirm}
          value={confirm}
          onChange={onConfirm}
          autoComplete="new-password"
          invalid={Boolean(showMismatch)}
          describedBy={showMismatch ? confirmErrorId : undefined}
        />
        {showMismatch && (
          <p id={confirmErrorId} className="mt-2 text-sm text-danger">
            {mismatch ? "The passwords don't match." : "Enter the password again."}
          </p>
        )}
      </div>
    </div>
  );
}
