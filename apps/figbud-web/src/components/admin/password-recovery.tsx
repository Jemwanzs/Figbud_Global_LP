"use client";

import { buttonClasses } from "@figbud/ui";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { AdminError, adminFetch, validEmail } from "@/lib/admin-client";

import { PasswordField } from "./password-field";

/** Asks for a recovery link. The answer is the same whether or not the account exists. */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validEmail(email)) {
      setError("Enter your work email.");
      return;
    }
    setBusy(true);
    try {
      await adminFetch("password/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <p className="flex items-start gap-2.5 font-medium text-text">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          Request received
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          If that email belongs to a Studio administrator with two-factor set up, a link to choose a new
          password is on its way. It works once and expires in an hour.
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          Nothing after a few minutes? Ask a FigBud owner for a recovery link from Team & access.
        </p>
        <Link href="/admin/login" className={buttonClasses("secondary", "lg", "mt-6 w-full")}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="forgot-email" className="block text-sm font-medium text-text">
        Work email
      </label>
      <input
        id="forgot-email"
        type="email"
        autoComplete="username"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "forgot-error" : undefined}
        className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text"
      />
      {error && (
        <p id="forgot-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClasses("primary", "lg", "mt-6 w-full")}>
        {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        {busy ? "Sending…" : "Send recovery link"}
      </button>
      <Link
        href="/admin/login"
        className="mt-4 flex min-h-11 items-center justify-center text-sm text-muted hover:text-text"
      >
        Back to sign in
      </Link>
    </form>
  );
}

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const readToken = () => /^#token=([0-9a-f]{64})$/.exec(window.location.hash)?.[1] ?? null;

/** Chooses a new password. The token travels in the URL fragment, so it never reaches a server log. */
export function ResetPasswordForm() {
  // undefined while rendering on the server · null when missing from the link.
  const token = useSyncExternalStore(subscribeToHash, readToken, () => undefined);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await adminFetch("password/reset", { token, password });
      // Drop the token from the address bar and history.
      window.history.replaceState(null, "", "/admin/reset-password");
      setDone(true);
    } catch (err) {
      setError(
        err instanceof AdminError
          ? (err.fields[0]?.message ?? err.message)
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div role="status">
        <p className="flex items-start gap-2.5 font-medium text-text">
          <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
          Your password has changed
        </p>
        <p className="mt-3 leading-relaxed text-muted">
          You were signed out everywhere. Sign in with your new password and your authenticator app.
        </p>
        <Link href="/admin/login" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Go to sign in
        </Link>
      </div>
    );
  }

  if (token === null) {
    return (
      <p role="alert" className="text-muted">
        This recovery link is incomplete. Open the full link, or{" "}
        <Link href="/admin/forgot-password" className="font-medium text-accent-strong underline">
          ask for a new one
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <PasswordField
        id="new-password"
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        describedBy="new-password-hint"
      />
      <p id="new-password-hint" className="-mt-3 text-sm text-subtle">
        At least 12 characters. A short phrase is easiest to remember.
      </p>
      <PasswordField
        id="repeat-password"
        label="Repeat new password"
        value={repeat}
        onChange={setRepeat}
        autoComplete="new-password"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !token || !password}
        className={buttonClasses("primary", "lg", "w-full")}
      >
        {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
        {busy ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
