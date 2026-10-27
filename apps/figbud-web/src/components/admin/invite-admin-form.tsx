"use client";

import { buttonClasses, cn } from "@figbud/ui";
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
      <form onSubmit={onSubmit} className="grid gap-6">
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-text">
            Work email
          </label>
          <input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            spellCheck={false}
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-4 text-text placeholder:text-subtle"
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium text-text">Role</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
                  role === r.value
                    ? "border-accent bg-accent-soft/60"
                    : "border-line hover:border-line-strong",
                )}
              >
                <input
                  type="radio"
                  name="invite-role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{r.label}</span>
                  <span className="block text-sm text-muted">{r.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-subtle">The link works once and expires after 7 days.</p>
          <ActionButton
            type="submit"
            ready={validEmail(email)}
            busy={busy}
            hint="Enter their work email"
            icon={<UserPlus aria-hidden className="size-4" />}
          >
            Create invite
          </ActionButton>
        </div>
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
          <p className="mt-2 text-muted">Expires {invite.expires}.</p>
        </div>
      )}
    </div>
  );
}
