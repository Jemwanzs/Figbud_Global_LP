"use client";

import { buttonClasses } from "@figbud/ui";
import { Check, Copy, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminFetch, describePasskeyError, validEmail } from "@/lib/admin-client";

import { ActionButton } from "./action-button";

const ROLES = [
  { value: "editor", label: "Editor", hint: "Writes and edits drafts" },
  { value: "reviewer", label: "Reviewer", hint: "Approves and publishes" },
  { value: "viewer", label: "Viewer", hint: "Read only" },
  { value: "owner", label: "Owner", hint: "Everything, including people" },
] as const;

/** Owner-only: creates a single-use invite link to send privately. */
export function InviteAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ url: string; expires: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInvite(null);
    setCopied(false);
    try {
      const created = await adminFetch<{ invite_url: string; expires_at: string }>("invites", {
        email,
        role,
      });
      setInvite({ url: created.invite_url, expires: new Date(created.expires_at).toUTCString() });
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(describePasskeyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-text">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="block text-sm font-medium text-text">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} · {r.hint}
              </option>
            ))}
          </select>
        </div>
        <ActionButton
          type="submit"
          ready={validEmail(email)}
          busy={busy}
          hint="Enter their work email"
          icon={<UserPlus aria-hidden className="size-4" />}
        >
          Create invite
        </ActionButton>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {invite && (
        <div role="status" className="mt-5 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
          <p className="font-medium text-text">Invite created. Send this link privately; it works once.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-xs text-muted">
              {invite.url}
            </code>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(invite.url);
                setCopied(true);
              }}
              className={buttonClasses("secondary", "md")}
            >
              {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="mt-2 text-subtle">Expires {invite.expires}.</p>
        </div>
      )}
    </div>
  );
}
