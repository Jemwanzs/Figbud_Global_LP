"use client";

import { buttonClasses } from "@figbud/ui";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import {
  AdminError,
  adminFetch,
  createPasskey,
  describePasskeyError,
  supportsPasskeys,
} from "@/lib/admin-client";

import { NewPasswordFields, newPasswordReady } from "./new-password-fields";

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };

/** Accepts an invite. The token travels in the URL fragment, so it never reaches a server log. */
export function InviteForm() {
  const router = useRouter();
  // undefined while rendering on the server · null when missing from the link.
  const token = useSyncExternalStore(subscribeToHash, readToken, () => undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A password instead of a passkey (owner's brief, 13 Nov 2026).
  const [withPassword, setWithPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [tried, setTried] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function acceptWithPassword() {
    if (!token) return;
    setTried(true);
    setFieldError(null);
    if (!newPasswordReady(password, confirm, "", name)) return;
    setBusy(true);
    try {
      await adminFetch("invites/accept/password", { token, name, password });
      window.history.replaceState(null, "", "/admin/invite");
      router.replace("/admin");
    } catch (err) {
      if (err instanceof AdminError && err.fields[0]?.field === "password")
        setFieldError(err.fields[0].message);
      else
        setError(
          err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
        );
      setBusy(false);
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
    if (withPassword) return acceptWithPassword();
    if (!supportsPasskeys()) {
      setError("This browser does not support passkeys. Please use a current browser.");
      return;
    }
    setBusy(true);
    try {
      const start = await adminFetch<Ceremony>("invites/accept/start", { token, name });
      const credential = await createPasskey(start.options);
      await adminFetch("invites/accept/finish", { challenge_id: start.challenge_id, credential });
      // Drop the token from the address bar and history.
      window.history.replaceState(null, "", "/admin/invite");
      // The Studio is rendered fresh for the new session (nothing signed-out is reused).
      router.replace("/admin");
    } catch (err) {
      setError(describePasskeyError(err));
      setBusy(false);
    }
  }

  if (token === null) {
    return (
      <p role="alert" className="text-muted">
        This invite link is incomplete. Open the full link from your invitation, or ask an owner for a new
        one.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="admin-name" className="block text-sm font-medium text-text">
        Your name
      </label>
      <input
        id="admin-name"
        type="text"
        autoComplete="name"
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-describedby="admin-name-hint"
        className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-text"
      />
      <p id="admin-name-hint" className="mt-2 text-sm text-subtle">
        Shown to other admins. If the owner who invited you entered it, you can leave this empty. Already an
        admin? Leave it empty: the invite adds a passkey for this device.
      </p>
      {withPassword && (
        <div className="mt-6">
          <NewPasswordFields
            idPrefix="invite"
            password={password}
            confirm={confirm}
            onPassword={setPassword}
            onConfirm={setConfirm}
            name={name}
            showErrors={tried}
            serverError={fieldError}
            labels={{ password: "Password", confirm: "Confirm password" }}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !token}
        className={buttonClasses("primary", "lg", "mt-6 w-full")}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          !withPassword && <Fingerprint aria-hidden className="size-4" />
        )}
        {withPassword
          ? busy
            ? "Creating your account…"
            : "Create password and sign in"
          : busy
            ? "Waiting for your device…"
            : "Create passkey and sign in"}
      </button>
      <button
        type="button"
        onClick={() => {
          setWithPassword((w) => !w);
          setError(null);
        }}
        className="mt-3 min-h-11 w-full rounded-xl text-sm font-medium text-accent hover:bg-accent-soft/60"
      >
        {withPassword ? "Use a passkey instead" : "Create a password instead"}
      </button>
    </form>
  );
}

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readToken(): string | null {
  return /(?:^|&)token=([0-9a-f]{64})(?:&|$)/.exec(window.location.hash.slice(1))?.[1] ?? null;
}
