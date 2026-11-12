"use client";

import { cn } from "@figbud/ui";
import { useState } from "react";

import { AdminError, type AdminUser, ROLE_LABELS, adminFetch } from "@/lib/admin-client";

export interface PendingInvite {
  id: string;
  email: string;
  role: AdminUser["role"];
  invited_by: string | null;
  expires_at: string;
  created_at: string;
}

const date = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Invitations not yet accepted (owner's brief, 12 Nov 2026). Revoking one
 * stops its link working at once; to resend, create a new invite from the
 * Overview (links are shown once, never stored).
 */
export function PendingInvites({ invites }: { invites: PendingInvite[] }) {
  const [list, setList] = useState(invites);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(invite: PendingInvite) {
    if (!window.confirm(`Revoke the invitation for ${invite.email}? Its link stops working.`)) return;
    setBusy(invite.id);
    setMessage(null);
    try {
      await adminFetch(`invites/${invite.id}/revoke`, {});
      setList((l) => l.filter((i) => i.id !== invite.id));
      setMessage({ tone: "ok", text: `The invitation for ${invite.email} is revoked.` });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof AdminError ? err.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="pending-invites" className="mt-12">
      <h2 id="pending-invites" className="font-display text-xl font-semibold text-text">
        Pending invitations
      </h2>
      {list.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">No invitations are waiting.</p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {list.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-text">{invite.email}</span>
                <span className="text-sm text-muted">
                  {`${ROLE_LABELS[invite.role]} · invited ${date(invite.created_at)}${invite.invited_by ? ` by ${invite.invited_by}` : ""} · expires ${date(invite.expires_at)}`}
                </span>
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => revoke(invite)}
                className="min-h-11 rounded-xl px-3 text-sm font-medium text-danger hover:bg-surface-2 disabled:opacity-50"
              >
                Revoke
                <span className="sr-only"> the invitation for {invite.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-3 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
