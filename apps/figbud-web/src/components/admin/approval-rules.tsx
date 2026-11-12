"use client";

import { cn } from "@figbud/ui";
import { ListChecks } from "lucide-react";
import { useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";
import { sameValue } from "@/lib/form-state";

import { ActionButton } from "./action-button";
import type { Approver } from "./approval-assign";

export interface ApprovalRule {
  kind: string;
  label: string;
  approvers: "reviewer" | "owner" | "people";
  people: string[];
  stages: 1 | 2;
}

export interface ApprovalRulesData {
  kinds: ApprovalRule[];
  approvers: Approver[];
}

const WHO: Record<ApprovalRule["approvers"], string> = {
  reviewer: "Reviewers",
  owner: "Owners only",
  people: "Chosen people",
};

/** One kind's rule; owners change it (with a recent identity check). */
function RuleRow({ initial, approvers }: { initial: ApprovalRule; approvers: Approver[] }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const changed = !sameValue(draft, saved);
  const missing = draft.approvers === "people" && draft.people.length === 0;
  const set = (patch: Partial<ApprovalRule>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setMessage(null);
  };

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await adminFetch<{ rule: Omit<ApprovalRule, "kind" | "label"> }>(
        `approval-rules/${draft.kind}`,
        { approvers: draft.approvers, people: draft.people, stages: draft.stages },
      );
      const next = { ...draft, ...result.rule } as ApprovalRule;
      setSaved(next);
      setDraft(next);
      setMessage({ tone: "ok", text: "Saved. It applies to the next decision." });
    } catch (err) {
      setMessage({
        tone: "error",
        text:
          err instanceof AdminError && err.status === 403
            ? "Please confirm it's you first, in Settings → Security & Authentication, then try again."
            : err instanceof AdminError
              ? (err.fields[0]?.message ?? err.message)
              : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-end gap-3">
        <p className="min-w-40 flex-1 font-medium text-text">{draft.label}</p>
        <label className="grid gap-1 text-xs text-muted">
          Who approves
          <select
            value={draft.approvers}
            onChange={(e) => set({ approvers: e.target.value as ApprovalRule["approvers"] })}
            className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
          >
            {(Object.keys(WHO) as ApprovalRule["approvers"][]).map((k) => (
              <option key={k} value={k}>
                {WHO[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Approvals needed
          <select
            value={draft.stages}
            onChange={(e) => set({ stages: Number(e.target.value) as 1 | 2 })}
            className="min-h-11 rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
          >
            <option value={1}>One</option>
            <option value={2}>Two, from different people</option>
          </select>
        </label>
        <ActionButton
          variant="secondary"
          ready={changed && !missing}
          busy={busy}
          hint={changed && missing ? "Choose at least one approver" : undefined}
          onClick={save}
        >
          Save
          <span className="sr-only"> the rule for {draft.label}</span>
        </ActionButton>
      </div>
      {draft.approvers === "people" && (
        <fieldset className="mt-3">
          <legend className="text-xs text-muted">
            Approvers for {draft.label} (owners can always approve)
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {approvers
              .filter((a) => a.role === "reviewer")
              .map((a) => (
                <label
                  key={a.id}
                  className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm text-text"
                >
                  <input
                    type="checkbox"
                    className="size-5 accent-[var(--action)]"
                    checked={draft.people.includes(a.id)}
                    onChange={() =>
                      set({
                        people: draft.people.includes(a.id)
                          ? draft.people.filter((p) => p !== a.id)
                          : [...draft.people, a.id],
                      })
                    }
                  />
                  {a.name}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn("mt-2 text-sm", message.tone === "error" ? "text-danger" : "text-success")}
        >
          {message.text}
        </p>
      )}
    </li>
  );
}

/**
 * Approval authority (P13-B5): for each kind of change, who approves and how
 * many approvals it needs. Every kind keeps maker-checker (nobody approves
 * their own request unless they're an owner); these rules only narrow it.
 */
export function ApprovalRules({ data }: { data: ApprovalRulesData }) {
  return (
    <section aria-labelledby="approval-rules" className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-strong"
        >
          <ListChecks className="size-5" />
        </span>
        <div>
          <h2 id="approval-rules" className="font-display text-xl font-semibold text-text">
            Approval rules
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Every change below needs someone other than the person who made it to approve it (owners may
            approve their own). Here you choose who approves each kind, and whether it needs a second
            approval. A reviewer still needs access to the websites involved. Requests can be assigned to one
            approver from Approvals.
          </p>
        </div>
      </div>
      <ul className="mt-5 grid gap-3">
        {data.kinds.map((k) => (
          <RuleRow key={k.kind} initial={k} approvers={data.approvers} />
        ))}
      </ul>
    </section>
  );
}
