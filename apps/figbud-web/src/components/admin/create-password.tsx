"use client";

import { buttonClasses } from "@figbud/ui";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import {
  AdminError,
  adminFetch,
  assertPasskey,
  describePasskeyError,
  supportsPasskeys,
  validEmail,
} from "@/lib/admin-client";

import { NewPasswordFields, newPasswordReady } from "./new-password-fields";

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };

interface Security {
  password: { set: boolean; needs_two_factor: boolean };
  two_factor: { enabled: boolean };
}

/**
 * Create (or reset) a password, starting from a passkey (owner's brief,
 * 13 Nov 2026). The passkey proves who this is, so nothing here says whether
 * an email address has an account: an unknown address simply finds no
 * passkey. No email is sent or needed. Newcomers without a passkey create
 * their password from their invitation instead.
 */
export function CreatePassword() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"verify" | "password" | "two-factor" | "done">("verify");
  const [had, setHad] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validEmail(email)) {
      setError("Enter your work email.");
      return;
    }
    if (!supportsPasskeys()) {
      setError("This browser doesn't support passkeys. Use a device with your passkey, or ask an owner.");
      return;
    }
    setBusy(true);
    try {
      const start = await adminFetch<Ceremony>("login/start", { email: email.trim() });
      const credential = await assertPasskey(start.options);
      await adminFetch("login/finish", { challenge_id: start.challenge_id, credential });
      const security = await adminFetch<Security>("security");
      setHad(security.password.set);
      setStep(security.password.needs_two_factor && !security.two_factor.enabled ? "two-factor" : "password");
    } catch (err) {
      setError(describePasskeyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setTried(true);
    setFieldError(null);
    setError(null);
    if (!newPasswordReady(password, confirm, email)) return;
    setBusy(true);
    try {
      await adminFetch("security/password", { password });
      setPassword("");
      setConfirm("");
      setStep("done");
    } catch (err) {
      if (err instanceof AdminError && err.fields[0]) setFieldError(err.fields[0].message);
      else setError(err instanceof AdminError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return (
      <div role="status" className="text-center">
        <CheckCircle2 aria-hidden className="mx-auto size-10 text-success" />
        <p className="mt-3 font-semibold text-text">
          {had
            ? "Password reset successfully. You can now sign in to FigBud Studio."
            : "Password created successfully. You can now sign in to FigBud Studio."}
        </p>
        <p className="mt-2 text-sm text-muted">
          You&apos;re signed in on this device. Your passkeys keep working too.
        </p>
        <Link href="/admin" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Go to the Studio
        </Link>
      </div>
    );
  }

  if (step === "two-factor") {
    return (
      <div className="text-sm text-muted">
        <p role="status" className="text-text">
          Thanks, that&apos;s you. Your role needs two-factor with a password, so set that up first.
        </p>
        <p className="mt-2">
          In Security &amp; Authentication, turn on two-factor with an authenticator app, then create your
          password there. An owner can change this in the sign-in policy.
        </p>
        <Link href="/admin/settings/security" className={buttonClasses("primary", "lg", "mt-6 w-full")}>
          Open Security &amp; Authentication
        </Link>
      </div>
    );
  }

  if (step === "password") {
    return (
      <form method="post" onSubmit={save} noValidate className="space-y-5" aria-label="Create password">
        <p role="status" className="text-sm text-muted">
          Thanks, that&apos;s you. {had ? "Choose a new password." : "Now choose your password."}
        </p>
        <NewPasswordFields
          idPrefix={`${uid}-new`}
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
          email={email}
          showErrors={tried}
          serverError={fieldError}
          labels={{ password: "New password", confirm: "Confirm password" }}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={buttonClasses("primary", "lg", "w-full")}>
          {busy && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {busy ? "Saving…" : had ? "Save new password" : "Create password"}
        </button>
      </form>
    );
  }

  return (
    <form method="post" onSubmit={verify} noValidate className="space-y-5">
      <div>
        <label htmlFor={`${uid}-email`} className="block text-sm font-medium text-text">
          Work email
        </label>
        <input
          id={`${uid}-email`}
          type="email"
          autoComplete="username webauthn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-base text-text"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={buttonClasses("primary", "lg", "w-full")}>
        {busy ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <KeyRound aria-hidden className="size-4" />
        )}
        {busy ? "Waiting for your passkey…" : "Confirm with your passkey"}
      </button>
      <div className="space-y-2 text-sm text-muted">
        <p>
          Your passkey (fingerprint, face or screen lock) confirms it&apos;s you. Nothing is sent by email.
        </p>
        <p>
          New to the Studio? Create your password from your invitation link. No passkey on this device? Ask an
          owner for a one-time recovery link.
        </p>
        <p>
          <Link href="/admin/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
