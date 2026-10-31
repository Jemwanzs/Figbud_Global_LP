"use client";

import { cn } from "@figbud/ui";
import { EyeOff, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";
import { KIND_LABELS, type ProofKind, type ProofList, STATUS_LABELS } from "./proof-types";

/** One kind's records (Trusted By, testimonials or metrics) with their status and websites. */
export function ProofOverview({
  kind,
  data,
  siteNames,
}: {
  kind: ProofKind;
  data: ProofList;
  siteNames: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = data.items.filter((i) => i.kind === kind);
  const labels = KIND_LABELS[kind];

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await adminFetch<{ id: string }>("proof", { kind });
      router.push(`/admin/proof/${id}`);
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-muted">{labels.lead}</p>
        {data.can_edit && (
          <ActionButton ready busy={busy} onClick={create} icon={<Plus aria-hidden className="size-4" />}>
            {`Add ${labels.singular}`}
          </ActionButton>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}
      {items.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          {`No ${labels.plural === "Trusted By" ? "organisations" : labels.plural.toLowerCase()} yet. Nothing shows on the websites until one is published.`}
        </p>
      ) : (
        <ul className="mt-8 divide-y divide-line rounded-2xl border border-line">
          {items.map((item) => {
            const status = STATUS_LABELS[item.status];
            const live = item.published_sites.map((s) => siteNames[s] ?? s);
            return (
              <li key={item.id}>
                <Link
                  href={`/admin/proof/${item.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{item.title || "Untitled"}</span>
                    <span className="mt-0.5 block text-xs text-subtle">
                      {live.length ? `Shown on ${live.join(", ")}` : "Not shown on any website"}
                      {` · order ${item.sort_order}`}
                    </span>
                  </span>
                  {!item.active && (
                    <span className="inline-flex items-center gap-1 text-xs text-subtle">
                      <EyeOff aria-hidden className="size-3.5" />
                      Hidden
                    </span>
                  )}
                  <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", status.tone)}>
                    {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
