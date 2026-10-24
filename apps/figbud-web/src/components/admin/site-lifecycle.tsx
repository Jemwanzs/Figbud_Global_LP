"use client";

import { buttonClasses } from "@figbud/ui";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { type AdminUser, adminFetch, describePasskeyError, hasRole } from "@/lib/admin-client";

import { ActionButton } from "./action-button";

import { type AdminSite, LIFECYCLE, type SiteStatus, TRANSITIONS, statusLabel } from "./site-labels";

export interface StatusRequest {
  id: string;
  from_status: SiteStatus;
  to_status: SiteStatus;
  reason: string;
  requested_by?: string | null;
  requested_by_id?: string | null;
  decision: "pending" | "approved" | "rejected" | "cancelled";
  decided_by?: string | null;
  decision_note?: string | null;
  created_at: string;
  decided_at?: string | null;
}

const when = (iso: string) => `${new Date(iso).toUTCString().slice(5, 22)} UTC`;

const DECISIONS: Record<StatusRequest["decision"], string> = {
  pending: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/**
 * Marketing lifecycle for one website: one open request at a time, decided by
 * a second person (owners may approve their own, which is audited).
 */
export function SiteLifecycle({
  site,
  requests,
  user,
}: {
  site: AdminSite;
  requests: StatusRequest[];
  user: AdminUser;
}) {
  const router = useRouter();
  const uid = useId();
  const options = TRANSITIONS[site.status];
  const [choice, setTo] = useState<SiteStatus>(options[0]);
  // The status may have moved on since the last choice (after an approval).
  const to = options.includes(choice) ? choice : options[0];
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const pending = requests.find((r) => r.decision === "pending");
  const reviewer = hasRole(user, "reviewer");
  const ownRequest = pending?.requested_by_id === user.id;
  const canDecide = reviewer && pending && (!ownRequest || user.role === "owner");
  const canCancel = pending && (ownRequest || user.role === "owner");

  async function run(label: string, path: string, body: unknown, success: string) {
    setBusy(label);
    setMessage(null);
    try {
      await adminFetch(`sites/${site.slug}/${path}`, body);
      setMessage({ tone: "ok", text: success });
      setReason("");
      setNote("");
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: describePasskeyError(err) });
    } finally {
      setBusy(null);
    }
  }

  const spinner = (label: string) =>
    busy === label && <LoaderCircle aria-hidden className="size-4 animate-spin" />;

  if (site.kind === "corporate") {
    return <p className="mt-3 text-sm text-muted">The FigBud Global website is always active.</p>;
  }

  return (
    <div className="mt-4 space-y-5">
      <ol aria-label="Lifecycle" className="flex flex-wrap gap-1.5">
        {LIFECYCLE.map((s) => (
          <li
            key={s.value}
            aria-current={s.value === site.status ? "step" : undefined}
            className={
              s.value === site.status
                ? "rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-ink"
                : "rounded-full border border-line px-2.5 py-0.5 text-xs text-subtle"
            }
          >
            {s.label}
          </li>
        ))}
      </ol>

      {site.archived_at ? (
        <p className="text-sm text-muted">Restore this website to change its status.</p>
      ) : pending ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm font-medium text-text">
            {statusLabel(pending.from_status)} → {statusLabel(pending.to_status)}
          </p>
          <p className="mt-1 text-sm text-muted">{pending.reason}</p>
          <p className="mt-1 text-xs text-subtle">
            Requested by {pending.requested_by ?? "a former admin"} · {when(pending.created_at)}
          </p>
          {canDecide && (
            <div className="mt-4">
              <label htmlFor={`${uid}-note`} className="block text-sm font-medium text-text">
                Note (optional)
              </label>
              <input
                id={`${uid}-note`}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-4 text-text"
              />
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {canDecide && (
              <>
                <button
                  type="button"
                  disabled={!!busy}
                  className={buttonClasses("primary", "md")}
                  onClick={() =>
                    run(
                      "approve",
                      `status-requests/${pending.id}/approve`,
                      { note: note || null },
                      "Status change approved.",
                    )
                  }
                >
                  {spinner("approve")}
                  {ownRequest ? "Approve my request" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={!!busy}
                  className={buttonClasses("secondary", "md")}
                  onClick={() =>
                    run(
                      "reject",
                      `status-requests/${pending.id}/reject`,
                      { note: note || null },
                      "Request rejected.",
                    )
                  }
                >
                  {spinner("reject")}
                  Reject
                </button>
              </>
            )}
            {canCancel && (
              <button
                type="button"
                disabled={!!busy}
                className={buttonClasses("ghost", "md")}
                onClick={() =>
                  run("cancel", `status-requests/${pending.id}/cancel`, {}, "Request cancelled.")
                }
              >
                {spinner("cancel")}
                Cancel request
              </button>
            )}
          </div>
          {reviewer && ownRequest && user.role !== "owner" && (
            <p className="mt-3 text-xs text-subtle">
              Another reviewer or an owner needs to approve your request.
            </p>
          )}
        </div>
      ) : reviewer ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("request", "status-requests", { to_status: to, reason }, "Request sent for approval.");
          }}
          className="space-y-4"
        >
          <div>
            <label htmlFor={`${uid}-to`} className="block text-sm font-medium text-text">
              Change status to
            </label>
            <select
              id={`${uid}-to`}
              value={to}
              onChange={(e) => setTo(e.target.value as SiteStatus)}
              className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-text"
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-reason`} className="block text-sm font-medium text-text">
              Reason
            </label>
            <textarea
              id={`${uid}-reason`}
              value={reason}
              required
              maxLength={500}
              rows={2}
              onChange={(e) => setReason(e.target.value)}
              className="mt-2 w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-text"
            />
          </div>
          <p className="text-xs text-subtle">
            Changes only how the website is marketed. The product itself, payments and sign-ups are not
            switched on by this.
          </p>
          <ActionButton
            type="submit"
            ready={reason.trim() !== ""}
            busy={busy === "request"}
            hint="Add a reason for the change"
          >
            Request change
          </ActionButton>
        </form>
      ) : (
        <p className="text-sm text-muted">Reviewers and owners can request status changes.</p>
      )}

      {user.role === "owner" && (
        <div className="border-t border-line pt-4">
          {site.archived_at ? (
            <button
              type="button"
              disabled={!!busy}
              className={buttonClasses("secondary", "md")}
              onClick={() => run("restore", "restore", {}, "Website restored.")}
            >
              {spinner("restore")}
              Restore website
            </button>
          ) : (
            <button
              type="button"
              disabled={!!busy}
              className={buttonClasses("ghost", "md")}
              onClick={() => {
                if (window.confirm(`Archive ${site.name}? It is hidden from every listing until restored.`))
                  run("archive", "archive", {}, "Website archived.");
              }}
            >
              {spinner("archive")}
              Archive website
            </button>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? "text-sm text-danger" : "text-sm text-success"}
        >
          {message.text}
        </p>
      )}

      {requests.some((r) => r.decision !== "pending") && (
        <div>
          <h3 className="text-sm font-medium text-text">History</h3>
          <ol className="mt-2 space-y-3 text-sm">
            {requests
              .filter((r) => r.decision !== "pending")
              .map((r) => (
                <li key={r.id}>
                  <p className="text-text">
                    {statusLabel(r.from_status)} → {statusLabel(r.to_status)} · {DECISIONS[r.decision]}
                  </p>
                  <p className="text-subtle">
                    {r.decided_by ?? r.requested_by ?? "System"}
                    {r.decided_at && ` · ${when(r.decided_at)}`}
                  </p>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  );
}
