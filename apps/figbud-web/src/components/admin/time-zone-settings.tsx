"use client";

import { TIME_ZONES, formatMoment } from "@figbud/ui";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { AdminError, type AdminUser, adminFetch } from "@/lib/admin-client";

import { ActionButton } from "./action-button";

type Zones = NonNullable<AdminUser["time_zone"]>;

const label = (zone: string) => TIME_ZONES.find((z) => z.zone === zone)?.label ?? zone;
const FOLLOW = "";

/**
 * Settings → General → Time zone (owner's brief, 14 Nov 2026). Timestamps
 * stay stored in UTC; this chooses how the Studio shows them. Owners set the
 * organisation's zone (East Africa Time by default); anyone can follow it or
 * choose their own.
 */
export function TimeZoneSettings({ zones, isOwner }: { zones: Zones; isOwner: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [saved, setSaved] = useState(zones);
  const [organisation, setOrganisation] = useState(zones.organisation);
  const [own, setOwn] = useState(zones.own ?? FOLLOW);
  const [busy, setBusy] = useState<"organisation" | "own" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  // An example, so the choice can be checked before saving.
  const example = (zone: string) => formatMoment(new Date(), { timeZone: zone });

  async function save(kind: "organisation" | "own") {
    setBusy(kind);
    setMessage(null);
    try {
      const next = await adminFetch<Zones>(kind === "organisation" ? "time-zone" : "security/time-zone", {
        time_zone: kind === "organisation" ? organisation : own || null,
      });
      setSaved(next);
      setMessage({ tone: "ok", text: `Saved. The Studio shows times in ${label(next.effective)}.` });
      router.refresh();
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof AdminError ? (err.fields[0]?.message ?? err.message) : "Something went wrong.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby={`${uid}-title`} className="fb-panel rounded-[var(--radius-panel)] p-5 sm:p-6">
      <h2 id={`${uid}-title`} className="font-semibold text-text">
        Time zone
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Times are stored in UTC and shown in this zone, named beside them. Showing them differently never
        changes a record.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-org`} className="block text-sm font-medium text-text">
            Organisation
          </label>
          <select
            id={`${uid}-org`}
            value={organisation}
            disabled={!isOwner}
            onChange={(e) => setOrganisation(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text disabled:opacity-60"
          >
            {TIME_ZONES.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </select>
          <p
            suppressHydrationWarning
            className="mt-1.5 text-xs text-subtle"
          >{`Now: ${example(organisation)}`}</p>
          {isOwner ? (
            <div className="mt-3">
              <ActionButton
                variant="secondary"
                ready={organisation !== saved.organisation}
                busy={busy === "organisation"}
                hint="Nothing to save"
                onClick={() => save("organisation")}
              >
                Save for everyone
              </ActionButton>
            </div>
          ) : (
            <p className="mt-2 text-xs text-subtle">Owners change the organisation&apos;s time zone.</p>
          )}
        </div>
        <div>
          <label htmlFor={`${uid}-own`} className="block text-sm font-medium text-text">
            You
          </label>
          <select
            id={`${uid}-own`}
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-text"
          >
            <option value={FOLLOW}>{`Follow the organisation (${label(saved.organisation)})`}</option>
            {TIME_ZONES.map((z) => (
              <option key={z.zone} value={z.zone}>
                {z.label}
              </option>
            ))}
          </select>
          <p
            suppressHydrationWarning
            className="mt-1.5 text-xs text-subtle"
          >{`Now: ${example(own || saved.organisation)}`}</p>
          <div className="mt-3">
            <ActionButton
              variant="secondary"
              ready={(own || null) !== saved.own}
              busy={busy === "own"}
              hint="Nothing to save"
              onClick={() => save("own")}
            >
              Save for me
            </ActionButton>
          </div>
        </div>
      </div>
      {message && (
        <p
          role={message.tone === "ok" ? "status" : "alert"}
          className={message.tone === "ok" ? "mt-4 text-sm text-success" : "mt-4 text-sm text-danger"}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
