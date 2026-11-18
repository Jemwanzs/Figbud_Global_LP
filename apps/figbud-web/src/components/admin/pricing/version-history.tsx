"use client";

import { type PriceBook, formatMoney } from "@figbud/site-kit";
import { cn, fieldClasses } from "@figbud/ui";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { AdminError, adminFetch } from "@/lib/admin-client";

import { LocalTime } from "../local-time";
import type { PricingAdmin } from "./pricing-types";

/** One published version with what changed (GET …/pricing/versions/{n}). */
interface VersionDetail {
  number: number;
  document: PriceBook;
  note: string;
  effective_from: string | null;
  requested_by: string | null;
  published_by: string | null;
  created_at: string;
  /** The version it's compared with, or null for the first. */
  against: number | null;
  changes: PricingAdmin["changes"];
}

/**
 * A published version's details, read-only (owner's brief, 14 Nov 2026):
 * what changed from the version before it, or from any other version, and
 * its items. Viewing never changes the draft, the website or quotations.
 */
export function VersionDetails({
  slug,
  number,
  others,
}: {
  slug: string;
  number: number;
  /** The other published versions, to compare with. */
  others: number[];
}) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (against?: number) => {
    setLoading(true);
    setError(null);
    try {
      setDetail(
        await adminFetch<VersionDetail>(
          `sites/${slug}/pricing/versions/${number}${against ? `?against=${against}` : ""}`,
        ),
      );
    } catch (err) {
      setError(err instanceof AdminError ? err.message : "Couldn't load this version. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        onClick={() => {
          setOpen(!open);
          if (!open && !detail) void load();
        }}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg text-sm font-medium text-accent"
      >
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
        {open ? "Hide version" : "View version"}
      </button>
      {open && (
        <div
          id={`${uid}-panel`}
          data-version-detail={number}
          className="mt-3 space-y-4 rounded-xl border border-line p-4"
        >
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}{" "}
              <button type="button" onClick={() => void load()} className="font-medium underline">
                Try again
              </button>
            </p>
          )}
          {loading && !detail && <p className="text-sm text-subtle">Loading…</p>}
          {detail && (
            <>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h4 className="text-sm font-semibold text-text">
                  {detail.against ? `Changes from version ${detail.against}` : "First published version"}
                </h4>
                {others.length > 0 && (
                  <label className="text-xs text-muted">
                    Compare with
                    <select
                      value={detail.against ?? ""}
                      onChange={(e) => void load(Number(e.target.value) || undefined)}
                      className={fieldClasses("ms-2 min-h-10 px-2 text-sm")}
                    >
                      {others.map((n) => (
                        <option key={n} value={n}>{`Version ${n}`}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {detail.against && <ChangeList changes={detail.changes} currency={detail.document.currency} />}
              <div>
                <h4 className="text-sm font-semibold text-text">{`Items (${detail.document.items.length})`}</h4>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {detail.document.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span className="text-text">
                        {item.name}
                        <span className="ms-2 text-xs text-subtle">
                          {[
                            item.billing === "one_off" ? "one-off" : item.billing,
                            item.active ? null : "disabled",
                            item.public ? "public" : "private",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="text-muted tabular-nums">
                        {item.rate
                          ? `${formatMoney(item.rate, detail.document.currency)}${item.unit_label ? ` per ${item.unit_label}` : ""}`
                          : item.tiers.length
                            ? "Tiered"
                            : "Quoted"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Added, removed and changed items, and which settings changed. */
export function ChangeList({ changes, currency }: { changes: PricingAdmin["changes"]; currency: string }) {
  if (!changes.items.length && !changes.settings_changed)
    return <p className="text-sm text-subtle">No differences.</p>;
  return (
    <ul className="space-y-1.5 text-sm" data-change-list="">
      {changes.items.map((ch) => (
        <li key={ch.item_id} className="flex flex-wrap justify-between gap-2">
          <span className="text-text">
            {ch.name}{" "}
            <span className="text-xs text-subtle">
              {ch.change === "added"
                ? "added"
                : ch.change === "removed"
                  ? "removed"
                  : ch.fields?.length
                    ? ch.fields.join(", ")
                    : "changed"}
            </span>
          </span>
          {ch.change === "changed" && ch.before !== ch.after && (
            <span className="font-mono text-xs text-muted">
              {`${ch.before ? formatMoney(ch.before, currency) : "not set"} → ${ch.after ? formatMoney(ch.after, currency) : "not set"}`}
            </span>
          )}
        </li>
      ))}
      {changes.settings_changed && (
        <li className="text-muted">
          {changes.settings?.length
            ? `Changed: ${changes.settings.join(", ")}.`
            : "Billing, tax, models or terms changed."}
        </li>
      )}
    </ul>
  );
}

/** A version's publication line: when (in the display zone), who approved and asked, effective date. */
export function VersionMeta({ version }: { version: PricingAdmin["versions"][number] }) {
  return (
    <p className="text-xs text-subtle">
      {"Published "}
      <LocalTime iso={version.created_at} />
      {` · approved by ${version.published_by ?? "someone"}`}
      {version.requested_by && ` · requested by ${version.requested_by}`}
      {version.effective_from && ` · effective ${version.effective_from}`}
    </p>
  );
}
