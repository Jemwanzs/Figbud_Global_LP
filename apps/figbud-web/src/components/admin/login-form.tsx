"use client";

import { buttonClasses, cn } from "@figbud/ui";
import { ArrowLeft, CheckCircle2, KeyRound, LoaderCircle, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AdminError,
  adminFetch,
  assertPasskey,
  describePasskeyError,
  supportsPasskeys,
  validEmail,
} from "@/lib/admin-client";

import { PasswordField } from "./password-field";

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };
type Busy = "password" | "passkey" | "code" | null;

/**
 * Sign-in: a password with two-factor, or a passkey. Both are always in view
 * and share the email. Messages never say whether an account exists.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Set once the password was right: the second step.
  const [pending, setPending] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  /**
   * What's actually in the fields: password managers and autofill can fill
   * them before the page is ready or without telling React.
   */
  const entered = () => {
    const data = new FormData(form.current ?? undefined);
    const values = { email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") };
    setEmail(values.email);
    setPassword(values.password);
    return values;
  };

  useEffect(() => {
    if (pending) codeInput.current?.focus();
  }, [pending, useRecovery]);

  const signedIn = () => {
    setDone(true);
    setPassword("");
    // The Studio is rendered fresh for the new session (nothing signed-out is reused).
    router.replace("/admin");
  };

  async function withPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const { email, password } = entered();
    if (!validEmail(email) || !password) {
      setError("Enter your work email and password.");
      return;
    }
    setBusy("password");
    try {
      const result = await adminFetch<{ two_factor: { pending: string } }>("password/login", {
        email,
        password,
      });
      setPending(result.two_factor.pending);
      // Verified: it isn't needed again, so it isn't kept in memory.
      setPassword("");
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function withPasskey() {
    setError(null);
    const { email } = entered();
    if (!validEmail(email)) {
      setError("Enter your work email first, then use your passkey.");
      return;
    }
    if (!supportsPasskeys()) {
      setError("This browser doesn't support passkeys. Continue with your password instead.");
      return;
    }
    setBusy("passkey");
    try {
      const start = await adminFetch<Ceremony>("login/start", { email });
      const credential = await assertPasskey(start.options);
      await adminFetch("login/finish", { challenge_id: start.challenge_id, credential });
      signedIn();
    } catch (err) {
      setError(describePasskeyError(err));
      setBusy(null);
    }
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!code.trim()) {
      setError(useRecovery ? "Enter one of your recovery codes." : "Enter the 6-digit code from your app.");
      return;
    }
    setBusy("code");
    try {
      await adminFetch("password/verify", useRecovery ? { pending, recovery_code: code } : { pending, code });
      signedIn();
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Something went wrong. Please try again.");
      setCode("");
      codeInput.current?.focus();
      setBusy(null);
    }
  }

  const startOver = () => {
    setPending(null);
    setPassword("");
    setCode("");
    setUseRecovery(false);
    setError(null);
  };

  if (done) {
    return (
      <p role="status" className="flex items-center gap-2.5 text-text">
        <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />
        Signed in. Opening the Studio…
      </p>
    );
  }

  const alert = error && (
    <p id="admin-login-error" role="alert" className="mt-4 text-sm text-danger">
      {error}
    </p>
  );

  if (pending) {
    return (
      <form onSubmit={verify} noValidate>
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"
          >
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-text">Two-factor verification</h2>
            <p className="mt-0.5 text-sm text-muted">
              {useRecovery
                ? "Enter one of the recovery codes you saved. Each one works once."
                : "Enter the 6-digit code from your authenticator app."}
            </p>
          </div>
        </div>
        <label htmlFor="admin-code" className="mt-6 block text-sm font-medium text-text">
          {useRecovery ? "Recovery code" : "6-digit code"}
        </label>
        <input
          key={useRecovery ? "recovery" : "code"}
          ref={codeInput}
          id="admin-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete={useRecovery ? "off" : "one-time-code"}
          autoCapitalize={useRecovery ? "characters" : "none"}
          spellCheck={false}
          maxLength={useRecovery ? 16 : 6}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "admin-login-error" : undefined}
          className={cn(
            "mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text",
            !useRecovery && "font-mono tracking-[0.3em]",
          )}
        />
        {alert}
        <button
          type="submit"
          disabled={busy !== null}
          className={buttonClasses("primary", "lg", "mt-6 w-full")}
        >
          {busy === "code" && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {busy === "code" ? "Verifying…" : "Verify and sign in"}
        </button>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={startOver}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted hover:text-text"
          >
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            Start over
          </button>
          <button
            type="button"
            onClick={() => {
              setUseRecovery((r) => !r);
              setCode("");
              setError(null);
            }}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent-strong hover:underline"
          >
            {useRecovery ? "Use my authenticator app" : "Use a recovery code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form ref={form} onSubmit={withPassword} noValidate>
      <label htmlFor="admin-email" className="block text-sm font-medium text-text">
        Work email
      </label>
      <input
        id="admin-email"
        name="email"
        type="email"
        required
        autoComplete="username webauthn"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "admin-login-error" : undefined}
        className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text"
      />
      <div className="mt-5">
        <PasswordField
          id="admin-password"
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          invalid={Boolean(error)}
          describedBy={error ? "admin-login-error" : undefined}
          aside={
            <Link
              href="/admin/forgot-password"
              className="-my-3 inline-flex min-h-11 items-center text-sm font-medium text-accent-strong hover:underline"
            >
              Forgot password?
            </Link>
          }
        />
      </div>
      {alert}
      <button
        type="submit"
        disabled={busy !== null}
        className={buttonClasses("primary", "lg", "mt-6 w-full")}
      >
        {busy === "password" ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <LogIn aria-hidden className="size-4" />
        )}
        {busy === "password" ? "Checking…" : "Continue with password"}
      </button>
      <div className="my-5 flex items-center gap-3 text-sm text-subtle">
        <span aria-hidden className="h-px flex-1 bg-line" />
        or
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        onClick={withPasskey}
        disabled={busy !== null}
        className={buttonClasses("secondary", "lg", "w-full")}
      >
        {busy === "passkey" ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <KeyRound aria-hidden className="size-4" />
        )}
        {busy === "passkey" ? "Waiting for your passkey…" : "Use passkey instead"}
      </button>
      <p className="mt-3 text-center text-xs text-subtle">Your fingerprint, face or screen lock.</p>
    </form>
  );
}
