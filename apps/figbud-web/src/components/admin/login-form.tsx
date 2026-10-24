"use client";

import { buttonClasses } from "@figbud/ui";
import { KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  adminFetch,
  assertPasskey,
  describePasskeyError,
  supportsPasskeys,
  validEmail,
} from "@/lib/admin-client";

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!supportsPasskeys()) {
      setError("This browser does not support passkeys. Please use a current browser.");
      return;
    }
    setBusy(true);
    try {
      const start = await adminFetch<Ceremony>("login/start", { email });
      const credential = await assertPasskey(start.options);
      await adminFetch("login/finish", { challenge_id: start.challenge_id, credential });
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(describePasskeyError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="admin-email" className="block text-sm font-medium text-text">
        Work email
      </label>
      <input
        id="admin-email"
        type="email"
        required
        autoComplete="username webauthn"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "admin-login-error" : undefined}
        className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-text"
      />
      {error && (
        <p id="admin-login-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !validEmail(email)}
        className={buttonClasses("primary", "lg", "mt-6 w-full")}
      >
        {busy ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <KeyRound aria-hidden className="size-4" />
        )}
        {busy ? "Waiting for your passkey…" : "Sign in with passkey"}
      </button>
    </form>
  );
}
