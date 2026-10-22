"use client";

import { buttonClasses } from "@figbud/ui";
import { Fingerprint, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { adminFetch, createPasskey, describePasskeyError, supportsPasskeys } from "@/lib/admin-client";

type Ceremony = { challenge_id: string; options: { publicKey: Record<string, unknown> } };

/** Accepts an invite. The token travels in the URL fragment, so it never reaches a server log. */
export function InviteForm() {
  const router = useRouter();
  // undefined while rendering on the server · null when missing from the link.
  const token = useSyncExternalStore(subscribeToHash, readToken, () => undefined);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError(null);
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
      router.replace("/admin");
      router.refresh();
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
        Shown to other admins. Already an admin? You can leave this empty: the invite adds a passkey for this
        device.
      </p>
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
          <Fingerprint aria-hidden className="size-4" />
        )}
        {busy ? "Waiting for your device…" : "Create passkey and sign in"}
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
