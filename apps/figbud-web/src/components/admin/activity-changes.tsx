"use client";

import { ChevronDown, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { adminFetch } from "@/lib/admin-client";

interface Change {
  path: string;
  before: unknown;
  after: unknown;
}

/** Stored values can be anything; show them as text, never as markup. */
function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** Previous and new values of one logged action, fetched when opened. */
export function ActivityChanges({ id }: { id: string }) {
  const [state, setState] = useState<
    { status: "closed" | "loading" | "error" } | { status: "open"; changes: Change[]; truncated: boolean }
  >({ status: "closed" });
  const [loaded, setLoaded] = useState<{ changes: Change[]; truncated: boolean } | null>(null);

  async function toggle() {
    if (state.status === "open") return setState({ status: "closed" });
    if (loaded) return setState({ status: "open", ...loaded });
    setState({ status: "loading" });
    try {
      const next = await adminFetch<{ changes: Change[]; truncated: boolean }>(`audit/${id}/changes`);
      setLoaded(next);
      setState({ status: "open", ...next });
    } catch {
      setState({ status: "error" });
    }
  }

  const open = state.status === "open";
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg font-medium text-accent hover:underline"
      >
        {state.status === "loading" ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin" />
        ) : (
          <ChevronDown aria-hidden className={open ? "size-4 rotate-180" : "size-4"} />
        )}
        {open ? "Hide changes" : "Show changes"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="mt-1 text-danger">
          We couldn&apos;t load the changes. Please try again.
        </p>
      )}
      {open &&
        (state.changes.length === 0 ? (
          <p className="mt-1 text-muted">The values were the same before and after.</p>
        ) : (
          <>
            <dl className="mt-2 grid gap-3">
              {state.changes.map((change) => (
                <div key={change.path} className="rounded-xl border border-line bg-surface-2 p-3">
                  <dt className="font-medium break-words text-text">{change.path || "Value"}</dt>
                  <dd className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-xs text-subtle">Before</p>
                      <p className="mt-0.5 break-words whitespace-pre-wrap text-muted">
                        {show(change.before)}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-subtle">After</p>
                      <p className="mt-0.5 break-words whitespace-pre-wrap text-text">{show(change.after)}</p>
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
            {state.truncated && (
              <p className="mt-2 text-subtle">Showing the first 200 changes in this action.</p>
            )}
          </>
        ))}
    </div>
  );
}
