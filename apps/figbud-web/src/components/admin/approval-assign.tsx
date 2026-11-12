"use client";

import { cn } from "@figbud/ui";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

export interface Approver {
  id: string;
  name: string;
  role: "owner" | "reviewer";
}

/**
 * Hands a request to one approver, or back to everyone (P13-B5). The list
 * offers people the request's approval rule allows; the API also checks
 * their websites and that they didn't ask for it.
 */
export function ApprovalAssign({
  kind,
  request,
  title,
  assigned,
  approvers,
}: {
  kind: string;
  request: string;
  title: string;
  assigned: Approver["id"] | null;
  approvers: Approver[];
}) {
  const router = useRouter();
  const id = useId();
  const [to, setTo] = useState(assigned ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ assigned_to: { name: string } | null }>("approvals/assign", {
        kind,
        request,
        to: to || null,
      });
      setMessage({
        tone: "ok",
        text: result.assigned_to
          ? `Assigned to ${result.assigned_to.name}.`
          : "Open to every approver again.",
      });
      router.refresh();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof AdminError ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="grid gap-1 text-xs text-muted">
        Assign to
        <select
          id={id}
          value={to}
          disabled={busy}
          onChange={(e) => setTo(e.target.value)}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
        >
          <option value="">Any approver</option>
          {approvers.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.role === "owner" ? " (owner)" : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={busy || to === (assigned ?? "")}
        onClick={save}
        className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium text-text hover:bg-surface-2 disabled:opacity-50"
      >
        Assign
        <span className="sr-only"> {title}</span>
      </button>
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("w-full text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
